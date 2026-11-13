import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { generateSeatTemplate } from '../utils/seatLayout.js';
import { recommendSeats } from '../services/recommendationService.js';
import { verifyRazorpaySignature } from '../services/paymentService.js';
import { labelJourneys } from '../services/fareIntelligence.js';
import { convenienceScore } from '../services/boardingService.js';
import { haversineKm, pointAlong, polylineKm, projectOnLine, thin } from '../utils/geo.js';

const seatsFor = (layout) => generateSeatTemplate(layout).map((s) => ({ ...s, status: 'available', price: 500 }));

describe('seat recommendation (transparent scoring)', () => {
  it('ranks window seats first when window is requested', () => {
    const r = recommendSeats(seatsFor('seater-2x2'), { window: true }, 4);
    expect(r.recommended).toHaveLength(4);
    expect(r.recommended.every((x) => /[AD]$/.test(x.number))).toBe(true);
    expect(r.estimated).toBe(true);
  });
  it('never recommends unavailable seats', () => {
    const seats = seatsFor('seater-2x2').map((s) => (s.isWindow ? { ...s, status: 'booked' } : s));
    const r = recommendSeats(seats, { window: true, aisle: true }, 3);
    expect(r.recommended.every((x) => /[BC]$/.test(x.number))).toBe(true);
  });
  it('returns nothing when no preference is given', () => {
    expect(recommendSeats(seatsFor('seater-2x2'), {}, 2).recommended).toHaveLength(0);
  });
  it('prefers lower berths on sleepers', () => {
    const r = recommendSeats(seatsFor('sleeper-2x1'), { berth: 'lower' }, 3);
    expect(r.recommended.every((x) => x.number.startsWith('L'))).toBe(true);
  });
});

describe('payment signature', () => {
  it('accepts a correct HMAC and rejects tampering', () => {
    const secret = 'shh';
    const sig = crypto.createHmac('sha256', secret).update('order_1|pay_1').digest('hex');
    expect(verifyRazorpaySignature('order_1', 'pay_1', sig, secret)).toBe(true);
    expect(verifyRazorpaySignature('order_1', 'pay_2', sig, secret)).toBe(false);
    expect(verifyRazorpaySignature('order_1', 'pay_1', 'deadbeef', secret)).toBe(false);
    expect(verifyRazorpaySignature('order_1', 'pay_1', '', secret)).toBe(false);
  });
});

describe('fare intelligence', () => {
  const items = [
    { id: 'cheap', fare: 400, durationMin: 400, departureHour: 6, amenityCount: 1, rating: 3.5, onTimePercent: 80, availableSeats: 10 },
    { id: 'fancy', fare: 900, durationMin: 330, departureHour: 21, amenityCount: 7, rating: 4.8, onTimePercent: 95, availableSeats: 10 },
    { id: 'mid', fare: 600, durationMin: 360, departureHour: 20, amenityCount: 4, rating: 4.2, onTimePercent: 88, availableSeats: 10 },
  ];
  it('labels the cheapest as Budget Friendly and the most comfortable as Comfort Priority', () => {
    const { results } = labelJourneys(items);
    expect(results.find((r) => r.id === 'cheap').labels).toContain('Budget Friendly');
    expect(results.find((r) => r.id === 'fancy').labels).toContain('Comfort Priority');
    expect(results.some((r) => r.labels.includes('Best Overall Value'))).toBe(true);
  });
  it('respects custom weights', () => {
    const { results } = labelJourneys(items, { price: 1, duration: 0, amenities: 0, rating: 0, reliability: 0, departure: 0 });
    const top = [...results].sort((a, b) => b.score - a.score)[0];
    expect(top.id).toBe('cheap');
  });
});

describe('boarding intelligence and geo', () => {
  it('scores convenience from documented attributes', () => {
    expect(convenienceScore({}, null)).toBe(40);
    expect(convenienceScore({ nearTransit: true, hasWaitingArea: true, wellLit: true }, 1)).toBe(100);
  });
  it('computes Delhi-Jaipur distance near 235 km', () => {
    const d = haversineKm(28.6139, 77.209, 26.9124, 75.7873);
    expect(d).toBeGreaterThan(220);
    expect(d).toBeLessThan(250);
  });
});

describe('route position along a road line', () => {
  const line = [[28.6, 77.2], [28.0, 77.0], [27.0, 76.0], [26.9, 75.8]];
  it('starts and ends at the first and last points', () => {
    expect(pointAlong(line, 0)).toMatchObject({ lat: 28.6, lng: 77.2 });
    expect(pointAlong(line, 100)).toMatchObject({ lat: 26.9, lng: 75.8 });
  });
  it('is measured by distance, so the halfway point splits the total length evenly', () => {
    const mid = pointAlong(line, 50);
    const firstHalf = polylineKm([...line.slice(0, 2), [mid.lat, mid.lng]]);
    const total = polylineKm(line);
    expect(Math.abs(firstHalf - total / 2)).toBeLessThan(total / 2); // sanity
    const a = polylineKm([line[0], line[1]]) + haversineKm(line[1][0], line[1][1], mid.lat, mid.lng);
    expect(Math.abs(a - total / 2)).toBeLessThan(total * 0.02);
  });
  it('moves monotonically and clamps out-of-range progress', () => {
    const lats = [0, 25, 50, 75, 100].map((p) => pointAlong(line, p).lat);
    expect([...lats].sort((x, y) => y - x)).toEqual(lats);
    expect(pointAlong(line, -20)).toMatchObject({ lat: 28.6 });
    expect(pointAlong(line, 500)).toMatchObject({ lat: 26.9 });
  });
  it('reports a south-westerly heading for this line and handles degenerate input', () => {
    const h = pointAlong(line, 30).headingDeg;
    expect(h).toBeGreaterThan(180);
    expect(h).toBeLessThan(270);
    expect(pointAlong([], 50)).toBeNull();
    expect(pointAlong([[1, 2]], 50)).toMatchObject({ lat: 1, lng: 2 });
  });
  it('thins long lines but keeps both ends', () => {
    const big = Array.from({ length: 5000 }, (_, i) => [i / 100, i / 100]);
    const t = thin(big, 300);
    expect(t).toHaveLength(300);
    expect(t[0]).toEqual(big[0]);
    expect(t[299]).toEqual(big[4999]);
  });
});

describe('projecting a GPS fix onto the road line', () => {
  const line = [[28.6, 77.2], [28.0, 77.0], [27.0, 76.0], [26.9, 75.8]];
  it('recovers the progress of a point that is exactly on the line', () => {
    for (const pct of [10, 40, 75]) {
      const p = pointAlong(line, pct);
      const r = projectOnLine(line, p.lat, p.lng);
      expect(Math.abs(r.pct - pct)).toBeLessThan(0.5);
      expect(r.offRouteKm).toBeLessThan(0.1);
    }
  });
  it('reports distance off the road for a point beside it', () => {
    const p = pointAlong(line, 50);
    const r = projectOnLine(line, p.lat + 0.05, p.lng); // ~5 km north
    expect(r.offRouteKm).toBeGreaterThan(1);
  });
  it('clamps points before the start and after the end', () => {
    expect(projectOnLine(line, 29.5, 77.5).pct).toBe(0);
    expect(projectOnLine(line, 26.0, 75.0).pct).toBe(100);
  });
  it('returns null for a degenerate line', () => {
    expect(projectOnLine([[1, 1]], 1, 1)).toBeNull();
  });
});

describe('GPS trust rules (which positions may mark stops as passed)', async () => {
  const { gpsState, effectiveProgress } = await import('../services/journeyService.js');
  const now = Date.now();
  const base = { status: 'running', simulation: { progressPct: 0 } };
  const gps = (o) => ({ ...base, gps: { active: true, updatedAt: new Date(now - 10_000), progressPct: 50, offRouteKm: 0.2, verified: true, onRoute: true, ...o } });

  it('a fresh on-route fix drives progress', () => {
    expect(effectiveProgress(gps({}))).toBe(50);
    expect(gpsState(gps({})).onRoute).toBe(true);
  });
  it('a fresh but off-route fix never drives progress', () => {
    const j = gps({ onRoute: false, verified: false, progressPct: 0, offRouteKm: 900 });
    expect(gpsState(j).offRoute).toBe(true);
    expect(effectiveProgress(j)).toBe(0);
  });
  it('when the signal is lost, verified progress is kept (stops never un-pass)', () => {
    const j = gps({ updatedAt: new Date(now - 10 * 60_000) });
    expect(gpsState(j).lost).toBe(true);
    expect(effectiveProgress(j)).toBe(50);
  });
  it('a lost signal that was never verified gives nothing', () => {
    const j = gps({ updatedAt: new Date(now - 10 * 60_000), verified: false, progressPct: 0 });
    expect(gpsState(j).lost).toBe(false);
    expect(effectiveProgress(j)).toBe(0);
  });
  it('explicitly stopped sharing still keeps verified progress', () => {
    expect(effectiveProgress(gps({ active: false }))).toBe(50);
  });
});
