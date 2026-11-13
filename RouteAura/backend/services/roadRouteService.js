import { Route } from '../models/index.js';
import { CITIES } from '../seeders/data.js';
import { polylineKm, thin } from '../utils/geo.js';

const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';
const TIMEOUT_MS = Number(process.env.OSRM_TIMEOUT_MS || 8000);

// After a routing failure, don't retry for a while: tracking pages poll often and must stay fast offline.
const RETRY_AFTER_MS = 5 * 60 * 1000;
const failedAt = new Map();

const cityCoords = (name) => {
  const key = Object.keys(CITIES).find((k) => k.toLowerCase() === String(name).toLowerCase());
  return key ? { lat: CITIES[key].lat, lng: CITIES[key].lng } : null;
};

/** Source and destination coordinates: stored on the route, else looked up from the known-city table. */
export function endpoints(route) {
  const a = route.sourceCoords?.lat != null ? route.sourceCoords : cityCoords(route.source);
  const b = route.destinationCoords?.lat != null ? route.destinationCoords : cityCoords(route.destination);
  return a && b ? { a, b } : null;
}

export async function fetchOsrm(a, b) {
  const url = `${OSRM_URL}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'RouteAura-academic-demo' } });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const json = await res.json();
    const r = json.routes?.[0];
    if (json.code !== 'Ok' || !r?.geometry?.coordinates?.length) throw new Error('OSRM returned no route');
    const line = r.geometry.coordinates.map(([lng, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]);
    return { line: thin(line, 600), km: Math.round(r.distance / 100) / 10, min: Math.round(r.duration / 60) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns { line, source, roadDistanceKm, roadDurationMin } for a route, or null if its cities are unknown.
 * Road geometry is fetched from OSRM once and cached on the Route. If OSRM is unreachable we return a straight
 * line (clearly marked) and try again next time; we never invent a road.
 */
export async function getRouteGeometry(routeId) {
  const route = await Route.findById(routeId).select('+geometry +geometrySource +roadDistanceKm +roadDurationMin');
  if (!route) return null;
  if (route.geometry?.length > 1) {
    return { line: route.geometry, source: route.geometrySource || 'osrm', roadDistanceKm: route.roadDistanceKm, roadDurationMin: route.roadDurationMin };
  }
  const ends = endpoints(route);
  if (!ends) return null;
  const recentlyFailed = failedAt.has(String(routeId)) && Date.now() - failedAt.get(String(routeId)) < RETRY_AFTER_MS;
  try {
    if (recentlyFailed) throw new Error('recent routing failure, using fallback');
    const { line, km, min } = await fetchOsrm(ends.a, ends.b);
    failedAt.delete(String(routeId));
    route.geometry = line;
    route.geometrySource = 'osrm';
    route.roadDistanceKm = km;
    route.roadDurationMin = min;
    await route.save();
    return { line, source: 'osrm', roadDistanceKm: km, roadDurationMin: min };
  } catch (err) {
    if (!recentlyFailed) failedAt.set(String(routeId), Date.now());
    if (!recentlyFailed && process.env.NODE_ENV !== 'test') console.warn(`Road routing unavailable (${err.message}); using straight line for ${route.source} to ${route.destination}`);
    const line = [[ends.a.lat, ends.a.lng], [ends.b.lat, ends.b.lng]];
    return { line, source: 'straight-line', roadDistanceKm: Math.round(polylineKm(line) * 10) / 10, roadDurationMin: null };
  }
}
