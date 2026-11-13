export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

/** Start/end of a calendar day in India Standard Time (UTC+05:30) for a YYYY-MM-DD string. */
export function istDayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00+05:30`);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Total length of a [[lat, lng], ...] polyline in km. */
export function polylineKm(line) {
  let km = 0;
  for (let i = 1; i < line.length; i++) km += haversineKm(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
  return km;
}

/**
 * Point `pct` percent (0-100) of the way along a polyline, measured by distance.
 * Returns { lat, lng, headingDeg } or null for an empty line.
 */
export function pointAlong(line, pct) {
  if (!Array.isArray(line) || line.length === 0) return null;
  if (line.length === 1) return { lat: line[0][0], lng: line[0][1], headingDeg: 0 };
  const clamped = Math.min(100, Math.max(0, Number(pct) || 0));
  const seg = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = haversineKm(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
    seg.push(d);
    total += d;
  }
  const target = (clamped / 100) * total;
  let acc = 0;
  for (let i = 0; i < seg.length; i++) {
    if (acc + seg[i] >= target || i === seg.length - 1) {
      const f = seg[i] === 0 ? 0 : Math.min(1, Math.max(0, (target - acc) / seg[i]));
      const [a, b] = [line[i], line[i + 1]];
      const lat = a[0] + (b[0] - a[0]) * f;
      const lng = a[1] + (b[1] - a[1]) * f;
      const y = Math.sin(((b[1] - a[1]) * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180);
      const x = Math.cos((a[0] * Math.PI) / 180) * Math.sin((b[0] * Math.PI) / 180) - Math.sin((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.cos(((b[1] - a[1]) * Math.PI) / 180);
      return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, headingDeg: Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) };
    }
    acc += seg[i];
  }
  return null;
}

/** Keep at most `max` points (always the first and last) so payloads stay small. */
export function thin(line, max = 400) {
  if (line.length <= max) return line;
  const out = [];
  const step = (line.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(line[Math.round(i * step)]);
  return out;
}

/**
 * Projects a position onto a road polyline. Returns { pct, offRouteKm }:
 * pct = how far along the line (0-100, by distance) the nearest point is; offRouteKm = distance from the line.
 * Uses a local flat approximation per segment, accurate to well under a metre per km at these scales.
 */
export function projectOnLine(line, lat, lng) {
  if (!Array.isArray(line) || line.length < 2) return null;
  const seg = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = haversineKm(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
    seg.push(d);
    total += d;
  }
  if (total === 0) return { pct: 0, offRouteKm: 0 };
  let best = { dist: Infinity, along: 0 };
  let acc = 0;
  for (let i = 0; i < seg.length; i++) {
    const [aLat, aLng] = line[i];
    const [bLat, bLng] = line[i + 1];
    const kx = Math.cos((((aLat + bLat) / 2) * Math.PI) / 180) * 111.32;
    const ky = 110.57;
    const bx = (bLng - aLng) * kx, by = (bLat - aLat) * ky;
    const px = (lng - aLng) * kx, py = (lat - aLat) * ky;
    const len2 = bx * bx + by * by;
    const f = len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / len2));
    const dist = Math.hypot(px - f * bx, py - f * by);
    if (dist < best.dist) best = { dist, along: acc + f * seg[i] };
    acc += seg[i];
  }
  return { pct: Math.min(100, Math.max(0, (best.along / total) * 100)), offRouteKm: Math.round(best.dist * 100) / 100 };
}
