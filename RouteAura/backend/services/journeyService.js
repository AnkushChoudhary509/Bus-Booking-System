import { Journey, Booking, BoardingPoint, Route } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { notifyMany } from './notificationService.js';
import { emitToJourney, emitToUser } from '../sockets/index.js';
import { cancelBooking } from './bookingService.js';
import { getRouteGeometry } from './roadRouteService.js';
import { pointAlong, projectOnLine, thin } from '../utils/geo.js';

/** Journeys delayed by at least this many minutes are "significantly delayed" and trigger Journey Rescue. */
export const SIGNIFICANT_DELAY_MIN = 60;

/** A GPS fix older than this means the signal is lost. */
export const GPS_FRESH_MS = 2 * 60 * 1000;
/** A fix farther than this from the road line is shown on the map but never used for progress or stops. */
export const OFF_ROUTE_KM = 15;
/** A fix less accurate than this (metres) is never used for progress or stops. */
export const MAX_ACCURACY_M = 1500;

export const isGpsLive = (j, now = Date.now()) => !!(j.gps?.active && j.gps.updatedAt && now - new Date(j.gps.updatedAt).getTime() < GPS_FRESH_MS);

/**
 * What the tracking page may trust:
 *  - onRoute : fresh GPS that is on the road line      -> real progress
 *  - offRoute: fresh GPS but not on the line / too inaccurate -> marker only, no progress, no passed stops
 *  - lost    : signal gone, but an earlier on-route fix proved progress -> keep the last verified progress (stops never un-pass)
 *  Otherwise the simulation (or nothing) applies.
 */
export function gpsState(j, now = Date.now()) {
  const live = isGpsLive(j, now);
  const gpsProg = j.gps?.progressPct || 0;
  const verified = j.gps?.verified === true || (j.gps?.verified === undefined && gpsProg > 0 && (j.gps?.offRouteKm ?? 0) <= OFF_ROUTE_KM);
  const onRoute = live && verified && j.gps.onRoute !== false;
  return { live, onRoute, offRoute: live && !onRoute, lost: !live && verified && gpsProg > 0 && !!j.gps?.updatedAt, gpsProg };
}
const simProgress = (j) => j.simulation?.progressPct || 0;
export function effectiveProgress(j) {
  if (j.status === 'completed') return 100;
  const g = gpsState(j);
  if (g.onRoute) return g.gpsProg;
  if (g.lost) return Math.max(g.gpsProg, simProgress(j));
  return simProgress(j);
}

export function journeyStatusPayload(j) {
  const delayMs = (j.delayMin || 0) * 60000;
  return {
    journeyId: String(j._id),
    status: j.status,
    delayMin: j.delayMin || 0,
    statusNote: j.statusNote,
    scheduledDeparture: j.departure,
    estimatedDeparture: new Date(new Date(j.departure).getTime() + delayMs),
    scheduledArrival: j.arrival,
    estimatedArrival: new Date(new Date(j.arrival).getTime() + delayMs),
    progressPct: effectiveProgress(j),
    trackingType: (() => { const g = gpsState(j); return g.live ? 'gps' : g.lost ? 'gps-lost' : j.simulation?.active || j.simulation?.progressPct > 0 ? 'simulated' : 'none'; })(),
  };
}

/** Build the Journey Health view model (stops with scheduled/estimated times, progress, completion). */
export async function buildTracking(journeyId) {
  const j = await Journey.findById(journeyId).populate('route').populate('bus', 'name type regNo').populate('operator', 'orgName');
  if (!j) throw new AppError('Journey not found', 404);
  const dur = (j.arrival - j.departure) / 60000;
  const delay = j.delayMin || 0;
  const g = gpsState(j);
  const { live, offRoute, lost } = g;
  const progress = effectiveProgress(j);
  const ageSec = j.gps?.updatedAt ? Math.max(0, Math.round((Date.now() - new Date(j.gps.updatedAt)) / 1000)) : null;
  const elapsedMin = (progress / 100) * dur;

  const stops = [
    { name: j.route.source, offsetMin: 0, kind: 'origin' },
    ...j.route.stops.map((s) => ({ name: s.name, offsetMin: s.offsetMin, kind: 'stop' })),
    { name: j.route.destination, offsetMin: dur, kind: 'destination' },
  ]
    .sort((a, b) => a.offsetMin - b.offsetMin)
    .map((s) => ({
      ...s,
      scheduledTime: new Date(j.departure.getTime() + s.offsetMin * 60000),
      estimatedTime: new Date(j.departure.getTime() + (s.offsetMin + delay) * 60000),
      passed: progress > 0 && s.offsetMin <= elapsedMin,
    }));

  // Map data: the road line, where the simulated bus is on it, and a coordinate for every stop.
  let map = null;
  try {
    const geo = await getRouteGeometry(j.route._id);
    if (geo) {
      const at = (offsetMin) => pointAlong(geo.line, dur > 0 ? (offsetMin / dur) * 100 : 0);
      for (const s of stops) { const p = at(s.offsetMin); if (p) { s.lat = p.lat; s.lng = p.lng; } }
      const position = live
        ? { lat: j.gps.lat, lng: j.gps.lng, headingDeg: Math.round(j.gps.headingDeg ?? pointAlong(geo.line, progress)?.headingDeg ?? 0) }
        : pointAlong(geo.line, progress);
      map = {
        line: thin(geo.line, 300),
        position,
        geometrySource: geo.source,
        roadDistanceKm: geo.roadDistanceKm,
        positionSource: live ? 'gps' : lost ? 'gps-last' : 'simulated',
        offRouteKm: live ? j.gps.offRouteKm : undefined,
        offRoute,
        gps: j.gps?.updatedAt ? { updatedAt: j.gps.updatedAt, ageSec, accuracyM: j.gps.accuracyM, speedKmh: j.gps.speedKmh, lost } : undefined,
        note: offRoute
          ? `LIVE GPS position received, but it is ${j.gps.offRouteKm > OFF_ROUTE_KM ? `about ${Math.round(j.gps.offRouteKm)} km away from this route` : 'too inaccurate'}, so it is shown on the map only and is NOT used for journey progress or stops.`
          : lost
          ? `GPS signal lost ${Math.round(ageSec / 60)} min ago. Showing the last verified position on the route; passed stops stay passed.`
          : live
          ? `LIVE GPS from the driver's phone (last fix ${Math.max(0, Math.round((Date.now() - new Date(j.gps.updatedAt)) / 1000))} s ago${j.gps.accuracyM ? `, accuracy about ${Math.round(j.gps.accuracyM)} m` : ''}). The road line is from ${geo.source === 'osrm' ? 'OpenStreetMap routing' : 'a straight-line fallback'}.`
          : geo.source === 'osrm'
            ? 'Road line from OpenStreetMap routing (OSRM). The bus marker is a SIMULATED position along it, not live GPS.'
            : 'Road routing was unavailable, so a straight line is shown. The bus marker is a SIMULATED position, not live GPS.',
      };
    }
  } catch { map = null; }

  return {
    ...journeyStatusPayload(j),
    map,
    route: { source: j.route.source, destination: j.route.destination, distanceKm: j.route.distanceKm },
    bus: j.bus,
    operator: j.operator?.orgName,
    stops,
    upcomingStops: stops.filter((s) => !s.passed),
    completed: j.status === 'completed',
    simulated: !g.onRoute && !lost,
    disclaimer: offRoute
      ? "A live GPS position is being received but it is not on this route, so journey progress and stops are NOT based on it."
      : lost
      ? "GPS signal from the driver's phone was lost. Progress shows the last position verified on the route."
      : live
      ? "Live position shared from the driver's phone via its GPS. Accuracy depends on the phone and signal."
      : 'Journey progress is SIMULATED for this demonstration and controlled by an administrator. This journey is not currently sharing live GPS.',
  };
}

export async function broadcastJourneyStatus(journey) {
  const payload = journeyStatusPayload(journey);
  emitToJourney(String(journey._id), 'journey:status', payload);
  return payload;
}

/** Operator / admin changes a journey's status. Cancellations and significant delays trigger Journey Rescue. */
export async function updateJourneyStatus(journeyId, { status, delayMin, note }) {
  const journey = await Journey.findById(journeyId).populate('route', 'source destination');
  if (!journey) throw new AppError('Journey not found', 404);
  if (['completed', 'cancelled'].includes(journey.status)) throw new AppError(`Journey is already ${journey.status}`, 409);

  const before = journey.status;
  if (status === 'delayed') {
    if (!(delayMin > 0)) throw new AppError('Provide the delay in minutes', 400);
    journey.delayMin = delayMin;
  }
  journey.status = status;
  if (note !== undefined) journey.statusNote = note;
  if (status === 'running') journey.simulation.active = journey.simulation.active || false;
  if (status === 'completed') journey.simulation.progressPct = 100;
  await journey.save();

  const bookings = await Booking.find({ journey: journey._id, status: 'confirmed' }).select('user bookingRef');
  const userIds = bookings.map((b) => b.user);
  const label = `${journey.route.source} → ${journey.route.destination}`;

  if (status === 'cancelled') {
    await Booking.updateMany(
      { journey: journey._id, status: 'confirmed' },
      { $set: { rescueStatus: 'offered', rescueReason: 'Journey cancelled by operator' } }
    );
    for (const b of bookings) {
      await notifyMany([b.user], {
        type: 'rescue',
        title: `Journey cancelled: ${label}`,
        body: `Your booking ${b.bookingRef} is still valid. Choose an alternative journey or cancel for a full refund.`,
        link: `/booking/${b._id}/rescue`,
        email: true,
      });
      emitToUser(String(b.user), 'booking:update', { bookingId: b._id, rescueStatus: 'offered' });
    }
  } else if (status === 'delayed') {
    const significant = delayMin >= SIGNIFICANT_DELAY_MIN;
    if (significant) {
      await Booking.updateMany(
        { journey: journey._id, status: 'confirmed', rescueStatus: 'none' },
        { $set: { rescueStatus: 'offered', rescueReason: `Significant delay (${delayMin} min)` } }
      );
    }
    for (const b of bookings) {
      await notifyMany([b.user], {
        type: significant ? 'rescue' : 'delay',
        title: `Delay: ${label}`,
        body: significant
          ? `Your bus is delayed by ${delayMin} minutes. You can explore alternative journeys or keep your booking.`
          : `Your bus is delayed by ${delayMin} minutes.`,
        link: significant ? `/booking/${b._id}/rescue` : `/journey/${journey._id}/tracking`,
        email: significant,
      });
    }
  } else if (before !== status) {
    await notifyMany(userIds, { type: 'delay', title: `Journey ${status}: ${label}`, body: note || `Status changed to ${status}.`, link: `/journey/${journey._id}/tracking` });
  }

  await broadcastJourneyStatus(journey);
  return journey;
}

/** Admin simulation controls (no real GPS). */
export async function simulate(journeyId, action, value) {
  const journey = await Journey.findById(journeyId);
  if (!journey) throw new AppError('Journey not found', 404);
  if (['cancelled', 'completed'].includes(journey.status) && action !== 'reset') throw new AppError(`Journey is ${journey.status}`, 409);

  if (action === 'start') {
    journey.simulation = { active: true, progressPct: 0, updatedAt: new Date() };
    journey.status = journey.delayMin > 0 ? 'delayed' : 'running';
  } else if (action === 'advance') {
    const step = Number(value) > 0 ? Number(value) : 10;
    if (!journey.simulation.active) { journey.simulation.active = true; if (journey.status === 'scheduled') journey.status = 'running'; }
    journey.simulation.progressPct = Math.min(100, (journey.simulation.progressPct || 0) + step);
    journey.simulation.updatedAt = new Date();
    if (journey.simulation.progressPct >= 100) {
      journey.status = 'completed';
      journey.simulation.active = false;
      await Booking.updateMany({ journey: journey._id, status: 'confirmed' }, { $set: { status: 'completed' }, $push: { history: { status: 'completed', note: 'Journey completed' } } });
    }
  } else if (action === 'delay') {
    return updateJourneyStatus(journeyId, { status: 'delayed', delayMin: Number(value) || 30, note: 'Delay reported (simulation)' });
  } else if (action === 'reset') {
    journey.simulation = { active: false, progressPct: 0, updatedAt: new Date() };
    journey.gps = { active: false };
    journey.status = 'scheduled';
    journey.delayMin = 0;
  } else {
    throw new AppError('Unknown simulation action', 400);
  }
  await journey.save();
  await broadcastJourneyStatus(journey);
  return journey;
}

/** Sweeper: journeys whose arrival time has passed are completed, and their confirmed bookings become completed. */
export async function completePastJourneys(now = new Date()) {
  const past = await Journey.find({ arrival: { $lt: new Date(now.getTime() - 60 * 60000) }, status: { $in: ['scheduled', 'boarding', 'running', 'delayed'] } }).select('_id');
  for (const j of past) {
    await Journey.updateOne({ _id: j._id }, { $set: { status: 'completed', 'simulation.progressPct': 100, 'simulation.active': false } });
    await Booking.updateMany({ journey: j._id, status: 'confirmed' }, { $set: { status: 'completed' }, $push: { history: { status: 'completed', note: 'Journey completed' } } });
    emitToJourney(String(j._id), 'journey:status', { journeyId: String(j._id), status: 'completed' });
  }
  return past.length;
}

/** Admin/operator cancelling a journey whose bookings must be handled: already covered by Rescue. Helper for full refunds. */
export async function cancelAllBookingsWithRefund(journeyId, reason = 'Journey cancelled by operator') {
  const bookings = await Booking.find({ journey: journeyId, status: 'confirmed' }).select('_id');
  for (const b of bookings) await cancelBooking(b._id, { reason, fullRefund: true });
}

export async function validatePointsForRoute(routeId, operatorId, pointIds, kind) {
  if (!pointIds?.length) return [];
  const points = await BoardingPoint.find({ _id: { $in: pointIds }, route: routeId, kind });
  if (points.length !== new Set(pointIds.map(String)).size) throw new AppError(`Some ${kind} points are invalid for this route`, 400);
  return points.map((p) => p._id);
}

export const findRoute = (source, destination) =>
  Route.findOne({ source, destination }).collation({ locale: 'en', strength: 2 });


/**
 * Driver phone reports its position. We project it onto the road line to get journey progress,
 * so the progress bar, ETA and "stops passed" follow the real bus. Returns the stored gps block.
 */
export async function recordGpsFix(journeyId, fix) {
  const journey = await Journey.findById(journeyId);
  if (!journey) throw new AppError('Journey not found', 404);
  if (['completed', 'cancelled'].includes(journey.status)) throw new AppError(`Journey is ${journey.status}`, 409);

  const geo = await getRouteGeometry(journey.route);
  const proj = geo ? projectOnLine(geo.line, fix.lat, fix.lng) : null;
  const now = new Date();
  const wasActive = isGpsLive(journey);
  const accurate = !(fix.accuracyM > MAX_ACCURACY_M);
  const onRoute = !!proj && proj.offRouteKm <= OFF_ROUTE_KM && accurate;
  const prev = journey.gps?.progressPct || 0;
  // Progress only moves from fixes verified to be on the road, and never goes backwards (a manual test position may).
  const progressPct = onRoute ? Math.round((fix.manual ? proj.pct : Math.max(prev, proj.pct)) * 10) / 10 : prev;
  journey.gps = {
    active: true,
    lat: fix.lat,
    lng: fix.lng,
    headingDeg: fix.headingDeg,
    speedKmh: fix.speedKmh,
    accuracyM: fix.accuracyM,
    progressPct,
    verified: onRoute || journey.gps?.verified === true,
    onRoute,
    offRouteKm: proj?.offRouteKm,
    updatedAt: now,
    startedAt: wasActive ? journey.gps.startedAt : now,
  };
  // only a verified on-route fix may start a trip that has not begun
  if (onRoute && ['scheduled', 'boarding'].includes(journey.status)) {
    journey.status = journey.delayMin > 0 ? 'delayed' : 'running';
  }
  await journey.save();
  await broadcastJourneyStatus(journey);
  return journey.gps;
}

export async function stopGps(journeyId) {
  const journey = await Journey.findById(journeyId);
  if (!journey) throw new AppError('Journey not found', 404);
  if (journey.gps) journey.gps.active = false;
  await journey.save();
  await broadcastJourneyStatus(journey);
  return { active: false };
}
