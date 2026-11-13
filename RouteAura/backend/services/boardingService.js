import { haversineKm } from '../utils/geo.js';

/**
 * Estimated convenience score (0-100). Transparent formula:
 *   40 base + 20 near transit + 15 waiting area + 10 well lit + up to 15 for proximity to the passenger's
 *   reference location (when supplied). It is an ESTIMATE from operator-provided attributes.
 */
export function convenienceScore(point, distanceKm) {
  let s = 40;
  if (point.nearTransit) s += 20;
  if (point.hasWaitingArea) s += 15;
  if (point.wellLit) s += 10;
  if (typeof distanceKm === 'number') s += distanceKm <= 2 ? 15 : distanceKm <= 5 ? 8 : distanceKm <= 10 ? 3 : 0;
  return Math.min(100, s);
}

export function decoratePoints(points, journey, ref) {
  const departure = new Date(journey.departure).getTime();
  const delay = (journey.delayMin || 0) * 60000;
  return points.map((p) => {
    const distanceKm =
      ref && typeof ref.lat === 'number' && typeof ref.lng === 'number' && typeof p.lat === 'number'
        ? haversineKm(ref.lat, ref.lng, p.lat, p.lng)
        : null;
    return {
      _id: p._id,
      kind: p.kind,
      name: p.name,
      city: p.city,
      landmark: p.landmark,
      instructions: p.instructions,
      lat: p.lat,
      lng: p.lng,
      scheduledTime: new Date(departure + p.offsetMin * 60000),
      estimatedTime: new Date(departure + p.offsetMin * 60000 + delay),
      distanceKm,
      convenienceScore: convenienceScore(p, distanceKm),
      scoreIsEstimate: true,
    };
  });
}
