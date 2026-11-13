import http from 'http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A tiny local stand-in for OSRM so we can test response parsing, errors and timeouts without internet.
let server, base, mode = 'ok';
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (mode === 'hang') return; // never answer
    if (mode === 'http500') { res.statusCode = 500; return res.end('nope'); }
    res.setHeader('content-type', 'application/json');
    if (mode === 'noroute') return res.end(JSON.stringify({ code: 'NoRoute', routes: [] }));
    res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: 281300, duration: 19800, geometry: { coordinates: [[77.209, 28.6139], [76.5, 27.6], [75.7873, 26.9124]] } }] }));
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  process.env.OSRM_URL = base;
  process.env.OSRM_TIMEOUT_MS = '400';
});
afterAll(() => server.close());

const load = async () => (await import('../services/roadRouteService.js')).fetchOsrm;
const A = { lat: 28.6139, lng: 77.209 }, B = { lat: 26.9124, lng: 75.7873 };

describe('OSRM client', () => {
  it('converts [lng, lat] GeoJSON to [lat, lng] and reports km / minutes', async () => {
    mode = 'ok';
    const r = await (await load())(A, B);
    expect(r.line[0]).toEqual([28.6139, 77.209]);
    expect(r.line.at(-1)).toEqual([26.9124, 75.7873]);
    expect(r.km).toBe(281.3);
    expect(r.min).toBe(330);
  });
  it('rejects when OSRM finds no route', async () => {
    mode = 'noroute';
    await expect((await load())(A, B)).rejects.toThrow(/no route/i);
  });
  it('rejects on HTTP errors', async () => {
    mode = 'http500';
    await expect((await load())(A, B)).rejects.toThrow(/500/);
  });
  it('gives up after the timeout instead of hanging', async () => {
    mode = 'hang';
    const t0 = Date.now();
    await expect((await load())(A, B)).rejects.toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
