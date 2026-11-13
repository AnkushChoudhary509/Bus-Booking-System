const URL_BASE = process.env.GEOCODE_URL || 'https://nominatim.openstreetmap.org';
const TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS || 6000);

/**
 * Looks a place name up in OpenStreetMap (Nominatim). Best effort: returns [] if the service is unreachable.
 * Nominatim's usage policy asks for a real User-Agent and at most ~1 request/second; routes are created rarely.
 */
export async function geocode(q, limit = 5) {
  const url = `${URL_BASE}/search?format=jsonv2&limit=${limit}&countrycodes=in&q=${encodeURIComponent(q)}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'RouteAura-academic-demo', 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error(`geocoder HTTP ${res.status}`);
    const rows = await res.json();
    return rows.map((r) => ({ name: r.display_name, lat: Math.round(Number(r.lat) * 1e5) / 1e5, lng: Math.round(Number(r.lon) * 1e5) / 1e5 })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } catch {
    return null; // null = lookup unavailable (different from [] = nothing found)
  } finally {
    clearTimeout(timer);
  }
}
