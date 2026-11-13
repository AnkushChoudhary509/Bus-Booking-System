import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, loginAs, startDb, stopDb } from './helpers.js';
import { Journey } from '../models/index.js';
import { endpoints } from '../services/roadRouteService.js';

beforeAll(startDb);
afterAll(stopDb);

const fresh = () => Journey.findOne({ status: 'scheduled' }).populate('route');
/** A point `f` of the way along the straight line between the route's cities (tests run without OSRM). */
const along = (j, f) => { const { a, b } = endpoints(j.route); return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }; };
const loc = (j) => `/api/v1/journeys/${j._id}/location`;
const track = async (j) => (await api().get(`/api/v1/journeys/${j._id}/tracking`)).body.data;

describe('live GPS driver mode', () => {
  it('rejects anonymous callers and passengers', async () => {
    const j = await fresh();
    const pax = await loginAs('passenger@routeaura.test');
    expect((await api().post(loc(j)).send({ lat: 28.6, lng: 77.2 })).status).toBe(401);
    expect((await api().post(loc(j)).set(pax.auth).send({ lat: 28.6, lng: 77.2 })).status).toBe(403);
  });

  it('validates coordinates', async () => {
    const admin = await loginAs('admin@routeaura.test');
    const j = await fresh();
    expect((await api().post(loc(j)).set(admin.auth).send({ lat: 999, lng: 0 })).status).toBe(400);
  });

  it('an on-route fix drives progress and stops; stopping keeps the verified progress', async () => {
    const admin = await loginAs('admin@routeaura.test');
    const j = await fresh();
    await api().post(loc(j)).set(admin.auth).send({ ...along(j, 0.5), accuracyM: 12 }).expect(200);
    let t = await track(j);
    expect(t.trackingType).toBe('gps');
    expect(t.simulated).toBe(false);
    expect(Math.round(t.progressPct)).toBeGreaterThan(40);
    expect(Math.round(t.progressPct)).toBeLessThan(60);
    await api().delete(loc(j)).set(admin.auth).expect(200);
    t = await track(j);
    expect(t.trackingType).toBe('gps-lost'); // signal gone, but passed stops do not un-pass
    expect(Math.round(t.progressPct)).toBeGreaterThan(40);
  });

  it('progress never moves backwards on a stray earlier fix', async () => {
    const admin = await loginAs('admin@routeaura.test');
    const j = await fresh();
    await api().post(loc(j)).set(admin.auth).send({ ...along(j, 0.6) }).expect(200);
    await api().post(loc(j)).set(admin.auth).send({ ...along(j, 0.2) }).expect(200);
    expect(Math.round((await track(j)).progressPct)).toBeGreaterThan(55);
  });

  it('a fix far from the route is shown but gives no progress, no passed stops and does not start the trip', async () => {
    const admin = await loginAs('admin@routeaura.test');
    const j = await fresh();
    await api().post(loc(j)).set(admin.auth).send({ lat: 31.33, lng: 75.57 }).expect(200); // Jalandhar
    const t = await track(j);
    expect(t.map.offRoute).toBe(true);
    expect(t.progressPct).toBeLessThan(5);
    expect(t.stops.filter((s) => s.passed && s.kind === 'stop')).toHaveLength(0);
    expect((await Journey.findById(j._id)).status).toBe('scheduled');
  });

  it('an inaccurate fix is ignored for progress', async () => {
    const admin = await loginAs('admin@routeaura.test');
    const j = await fresh();
    await api().post(loc(j)).set(admin.auth).send({ ...along(j, 0.5), accuracyM: 20000 }).expect(200);
    expect((await track(j)).progressPct).toBeLessThan(5);
  });

  it('admin Reset clears GPS progress', async () => {
    const admin = await loginAs('admin@routeaura.test');
    const j = await fresh();
    await api().post(loc(j)).set(admin.auth).send({ ...along(j, 0.5) }).expect(200);
    await api().post(`/api/v1/admin/simulation/${j._id}`).set(admin.auth).send({ action: 'reset' }).expect(200);
    const t = await track(j);
    expect(t.progressPct).toBe(0);
  });
});
