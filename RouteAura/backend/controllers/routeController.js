import { Route, BoardingPoint, Journey } from '../models/index.js';
import { AppError, asyncHandler, ok } from '../utils/AppError.js';
import { endpoints, fetchOsrm } from '../services/roadRouteService.js';
import { geocode } from '../services/geocodeService.js';
import { haversineKm } from '../utils/geo.js';

const ci = { locale: 'en', strength: 2 };

export const cities = asyncHandler(async (req, res) => {
  const [a, b] = await Promise.all([Route.distinct('source', { isActive: true }), Route.distinct('destination', { isActive: true })]);
  ok(res, { cities: [...new Set([...a, ...b])].sort() });
});

export const list = asyncHandler(async (req, res) => {
  const filter = req.user?.role === 'admin' ? {} : { isActive: true };
  ok(res, { routes: await Route.find(filter).sort({ source: 1, destination: 1 }) });
});

/** Featured routes for the landing page: routes with the most upcoming scheduled journeys. */
export const featured = asyncHandler(async (req, res) => {
  const agg = await Journey.aggregate([
    { $match: { status: 'scheduled', departure: { $gt: new Date() } } },
    { $group: { _id: '$route', journeys: { $sum: 1 }, minFare: { $min: '$baseFare' } } },
    { $sort: { journeys: -1 } },
    { $limit: 8 },
  ]);
  const routes = await Route.find({ _id: { $in: agg.map((a) => a._id) } }).lean();
  const byId = new Map(routes.map((r) => [String(r._id), r]));
  ok(res, {
    routes: agg
      .map((a) => ({ ...byId.get(String(a._id)), upcomingJourneys: a.journeys, startingFare: a.minFare }))
      .filter((r) => r._id),
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const route = await Route.findById(req.params.id);
  if (!route) throw new AppError('Route not found', 404);
  ok(res, { route });
});

export const lookup = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) throw new AppError('Type at least 2 characters', 400);
  const places = await geocode(q);
  if (places === null) throw new AppError('Place lookup is unavailable right now. Enter the latitude and longitude manually.', 503);
  ok(res, { places });
});

export const create = asyncHandler(async (req, res) => {
  const existing = await Route.findOne({ source: req.body.source, destination: req.body.destination }).collation(ci);
  if (existing) return ok(res, { route: existing, existing: true }, 'Route already exists');

  // Coordinates: given by the user, else known city, else an OpenStreetMap lookup. Without them the route still works
  // for booking, but has no tracking map.
  const known = endpoints(req.body);
  let a = req.body.sourceCoords || known?.a;
  let b = req.body.destinationCoords || known?.b;
  const notes = [];
  if (!a) { const r = (await geocode(req.body.source, 1))?.[0]; if (r) a = { lat: r.lat, lng: r.lng }; }
  if (!b) { const r = (await geocode(req.body.destination, 1))?.[0]; if (r) b = { lat: r.lat, lng: r.lng }; }
  if (!a || !b) notes.push('no map coordinates were found, so this route will not show a tracking map');

  // Distance and duration: given, else from the road route, else a straight-line estimate (clearly an estimate).
  let { distanceKm, durationMin } = req.body;
  if ((!distanceKm || !durationMin) && a && b) {
    try { const r = await fetchOsrm(a, b); distanceKm ||= r.km; durationMin ||= r.min; } catch { /* fall through to estimate */ }
    if (!distanceKm || !durationMin) {
      const km = Math.max(1, Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * 1.3));
      distanceKm ||= km; durationMin ||= Math.max(10, Math.round((km / 50) * 60));
      notes.push('distance and duration are estimates (about 50 km/h)');
    }
  }
  if (!distanceKm || !durationMin) throw new AppError('Enter distance and duration (they could not be estimated without coordinates)', 400);
  if (req.body.stops.some((s) => s.offsetMin >= durationMin)) throw new AppError('Every intermediate stop must be reached before the journey ends', 400);

  const route = await Route.create({ ...req.body, distanceKm, durationMin, sourceCoords: a, destinationCoords: b });
  ok(res, { route, notes }, notes.length ? `Route created: ${notes.join('; ')}` : 'Route created', 201);
});

export const update = asyncHandler(async (req, res) => {
  const route = await Route.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!route) throw new AppError('Route not found', 404);
  ok(res, { route }, 'Route updated');
});

export const deactivate = asyncHandler(async (req, res) => {
  const upcoming = await Journey.exists({ route: req.params.id, status: { $in: ['scheduled', 'boarding', 'running', 'delayed'] } });
  if (upcoming) throw new AppError('Cancel or complete the journeys on this route first', 409);
  const route = await Route.findByIdAndUpdate(req.params.id, { isActive: req.query.activate === 'true' }, { new: true });
  if (!route) throw new AppError('Route not found', 404);
  ok(res, { route });
});

export const listPoints = asyncHandler(async (req, res) => {
  const filter = { route: req.params.id };
  if (req.user?.role === 'operator' && req.operator && req.query.mine === 'true') filter.operator = req.operator._id;
  if (req.query.kind) filter.kind = req.query.kind;
  ok(res, { points: await BoardingPoint.find(filter).sort({ kind: 1, offsetMin: 1 }) });
});

export const createPoint = asyncHandler(async (req, res) => {
  if (!req.operator) throw new AppError('Only operators can add boarding points', 403);
  const route = await Route.findById(req.params.id);
  if (!route) throw new AppError('Route not found', 404);
  const point = await BoardingPoint.create({ ...req.body, route: route._id, operator: req.operator._id });
  ok(res, { point }, 'Point added', 201);
});

export const deletePoint = asyncHandler(async (req, res) => {
  const point = await BoardingPoint.findById(req.params.pointId);
  if (!point) throw new AppError('Point not found', 404);
  if (req.user.role !== 'admin' && String(point.operator) !== String(req.operator?._id)) throw new AppError('Not your boarding point', 403);
  if (await Journey.exists({ $or: [{ boardingPoints: point._id }, { droppingPoints: point._id }], status: { $in: ['scheduled', 'boarding', 'running', 'delayed'] } })) {
    throw new AppError('This point is used by an active journey', 409);
  }
  await point.deleteOne();
  ok(res, {}, 'Point removed');
});
