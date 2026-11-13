import { Journey, Route, Bus, Booking, User, Review } from '../models/index.js';
import { AppError, asyncHandler, ok } from '../utils/AppError.js';
import { istDayRange } from '../utils/geo.js';
import { countAvailable, getSeatMap, lockSeats, releaseUserLocks } from '../services/seatService.js';
import { recommendSeats } from '../services/recommendationService.js';
import { labelJourneys, FARE_DATA_NOTE, DEFAULT_WEIGHTS } from '../services/fareIntelligence.js';
import { decoratePoints } from '../services/boardingService.js';
import { buildTracking, updateJourneyStatus, validatePointsForRoute, recordGpsFix, stopGps } from '../services/journeyService.js';
import { seatPrice } from '../utils/seatLayout.js';

const ci = { locale: 'en', strength: 2 };
const istHour = (d) => new Date(new Date(d).getTime() + 330 * 60000).getUTCHours();
const durationMin = (j) => Math.round((new Date(j.arrival) - new Date(j.departure)) / 60000);

const toItem = (j, now) => ({
  id: String(j._id),
  fare: j.baseFare,
  durationMin: durationMin(j),
  departureHour: istHour(j.departure),
  amenityCount: j.bus?.amenities?.length || 0,
  rating: j.operator?.ratingCount > 0 ? j.operator.ratingAvg : 0,
  onTimePercent: j.reliability?.onTimePercent || 0,
  availableSeats: countAvailable(j, now),
});

const shapeJourney = (j, item, scored) => ({
  _id: j._id,
  operator: { _id: j.operator?._id, orgName: j.operator?.orgName, ratingAvg: j.operator?.ratingAvg || 0, ratingCount: j.operator?.ratingCount || 0 },
  bus: { _id: j.bus?._id, name: j.bus?.name, type: j.bus?.type, amenities: j.bus?.amenities || [], layoutType: j.bus?.layoutType },
  departure: j.departure,
  arrival: j.arrival,
  durationMin: item.durationMin,
  baseFare: j.baseFare,
  status: j.status,
  availableSeats: item.availableSeats,
  totalSeats: j.seats.length,
  boardingPoints: (j.boardingPoints || []).map((p) => ({ _id: p._id, name: p.name, city: p.city, offsetMin: p.offsetMin })),
  droppingPoints: (j.droppingPoints || []).map((p) => ({ _id: p._id, name: p.name, city: p.city, offsetMin: p.offsetMin })),
  cancellationPolicy: j.cancellationPolicy,
  reliability: j.reliability,
  score: scored?.score,
  comfortScore: scored?.comfortScore,
  labels: scored?.labels || [],
  breakdown: scored?.breakdown,
});

export const search = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const range = istDayRange(q.date);
  if (!range) throw new AppError('Invalid date', 400);

  const route = await Route.findOne({ source: q.source, destination: q.destination, isActive: true }).collation(ci);

  // record search history for logged-in passengers (latest 10, de-duplicated)
  if (req.user) {
    const entry = { source: route?.source || q.source, destination: route?.destination || q.destination, date: q.date, searchedAt: new Date() };
    await User.updateOne({ _id: req.user._id }, { $pull: { searchHistory: { source: entry.source, destination: entry.destination, date: entry.date } } });
    await User.updateOne({ _id: req.user._id }, { $push: { searchHistory: { $each: [entry], $position: 0, $slice: 10 } } });
  }
  if (!route) return ok(res, { route: null, journeys: [], note: 'No route found between these cities yet.' });

  const now = new Date();
  const from = new Date(Math.max(range.start.getTime(), now.getTime()));
  let journeys = await Journey.find({ route: route._id, status: { $in: ['scheduled', 'boarding'] }, departure: { $gte: from, $lt: range.end } })
    .populate('bus', 'name type amenities layoutType isActive')
    .populate('operator', 'orgName ratingAvg ratingCount')
    .populate('boardingPoints', 'name city offsetMin')
    .populate('droppingPoints', 'name city offsetMin')
    .lean();

  const wanted = q.amenities ? q.amenities.split(',').map((s) => s.trim()).filter(Boolean) : [];
  journeys = journeys.filter((j) => {
    if (!j.bus?.isActive) return false;
    if (q.busType && j.bus.type !== q.busType) return false;
    const h = istHour(j.departure);
    if (q.departureAfter !== undefined && h < q.departureAfter) return false;
    if (q.departureBefore !== undefined && h >= q.departureBefore) return false;
    if (q.maxFare !== undefined && j.baseFare > q.maxFare) return false;
    if (q.minRating !== undefined && !(j.operator?.ratingCount > 0 && j.operator.ratingAvg >= q.minRating)) return false;
    if (wanted.length && !wanted.every((a) => j.bus.amenities.includes(a))) return false;
    return countAvailable(j, now) >= q.passengers;
  });

  let weights;
  try { weights = q.weights ? JSON.parse(q.weights) : undefined; } catch { throw new AppError('weights must be valid JSON', 400); }

  const items = journeys.map((j) => toItem(j, now));
  const { results, weights: usedWeights } = labelJourneys(items, weights, q.preferredHour ?? null);
  const scoreById = new Map(results.map((r) => [r.id, r]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  let shaped = journeys.map((j) => shapeJourney(j, itemById.get(String(j._id)), scoreById.get(String(j._id))));
  const sorters = {
    recommended: (a, b) => b.score - a.score,
    price: (a, b) => a.baseFare - b.baseFare,
    departure: (a, b) => new Date(a.departure) - new Date(b.departure),
    duration: (a, b) => a.durationMin - b.durationMin,
    rating: (a, b) => b.operator.ratingAvg - a.operator.ratingAvg,
  };
  shaped = shaped.sort(sorters[q.sort]);

  ok(res, {
    route: { _id: route._id, source: route.source, destination: route.destination, distanceKm: route.distanceKm, durationMin: route.durationMin },
    journeys: shaped,
    weights: usedWeights,
    defaultWeights: DEFAULT_WEIGHTS,
    note: FARE_DATA_NOTE,
  });
});

export const compare = asyncHandler(async (req, res) => {
  const { journeyIds, weights, preferredHour } = req.body;
  const now = new Date();
  const journeys = await Journey.find({ _id: { $in: journeyIds } })
    .populate('bus', 'name type amenities layoutType')
    .populate('operator', 'orgName ratingAvg ratingCount')
    .populate('boardingPoints', 'name city offsetMin')
    .populate('droppingPoints', 'name city offsetMin')
    .lean();
  if (journeys.length < 2) throw new AppError('Select at least two valid journeys to compare', 400);
  const items = journeys.map((j) => toItem(j, now));
  const { results, weights: usedWeights, comfortWeights } = labelJourneys(items, weights, preferredHour ?? null);
  const scoreById = new Map(results.map((r) => [r.id, r]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  ok(res, {
    journeys: journeys.map((j) => shapeJourney(j, itemById.get(String(j._id)), scoreById.get(String(j._id)))),
    weights: usedWeights,
    comfortWeights,
    note: FARE_DATA_NOTE,
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const j = await Journey.findById(req.params.id)
    .populate('bus', 'name type amenities layoutType regNo')
    .populate('route')
    .populate('operator', 'orgName ratingAvg ratingCount')
    .populate('boardingPoints')
    .populate('droppingPoints')
    .lean();
  if (!j) throw new AppError('Journey not found', 404);
  const now = new Date();
  const reviews = await Review.find({ journey: j._id }).populate('user', 'name').sort({ createdAt: -1 }).limit(5).lean();
  const seatsByStatus = { available: countAvailable(j, now) };
  ok(res, {
    journey: {
      ...j,
      seats: undefined,
      availableSeats: seatsByStatus.available,
      totalSeats: j.seats.length,
      durationMin: durationMin(j),
      minSeatPrice: Math.min(...j.seats.map((s) => s.price)),
      estimatedDeparture: new Date(new Date(j.departure).getTime() + (j.delayMin || 0) * 60000),
      recentReviews: reviews.map((r) => ({ rating: r.rating, comment: r.comment, name: r.user?.name?.split(' ')[0], createdAt: r.createdAt })),
    },
  });
});

export const seatMap = asyncHandler(async (req, res) => ok(res, await getSeatMap(req.params.id, req.user?._id)));

export const recommend = asyncHandler(async (req, res) => {
  const map = await getSeatMap(req.params.id, req.user?._id);
  const { count, ...prefs } = req.body;
  ok(res, recommendSeats(map.seats, prefs, count));
});

export const lock = asyncHandler(async (req, res) => ok(res, await lockSeats(req.params.id, req.user._id, req.body.seats), 'Seats held for you'));

export const unlock = asyncHandler(async (req, res) => {
  const released = await releaseUserLocks(req.params.id, req.user._id);
  ok(res, { released }, 'Seats released');
});

export const tracking = asyncHandler(async (req, res) => ok(res, await buildTracking(req.params.id)));

export const boardingPoints = asyncHandler(async (req, res) => {
  const j = await Journey.findById(req.params.id).populate('boardingPoints').populate('droppingPoints').lean();
  if (!j) throw new AppError('Journey not found', 404);
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
  const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
  const ref = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  ok(res, {
    boarding: decoratePoints(j.boardingPoints, j, ref).sort((a, b) => b.convenienceScore - a.convenienceScore),
    dropping: decoratePoints(j.droppingPoints, j, null),
    note: 'Convenience scores are estimates based on operator-provided attributes and distance from your reference location.',
  });
});

// ---------------- operator / admin ----------------

export const create = asyncHandler(async (req, res) => {
  const { bus: busId, route: routeId, departure, baseFare } = req.body;
  const bus = await Bus.findById(busId);
  if (!bus || !bus.isActive) throw new AppError('Bus not found or inactive', 404);
  if (req.user.role !== 'admin' && String(bus.operator) !== String(req.operator._id)) throw new AppError('You can only schedule your own buses', 403);
  const route = await Route.findById(routeId);
  if (!route || !route.isActive) throw new AppError('Route not found or inactive', 404);
  if (new Date(departure) <= new Date()) throw new AppError('Departure must be in the future', 400);

  const dep = new Date(departure);
  const arr = req.body.arrival ? new Date(req.body.arrival) : new Date(dep.getTime() + route.durationMin * 60000);
  if (arr <= dep) throw new AppError('Arrival must be after departure', 400);

  // a bus cannot be on two journeys at the same time
  const clash = await Journey.exists({ bus: bus._id, status: { $nin: ['cancelled', 'completed'] }, departure: { $lt: arr }, arrival: { $gt: dep } });
  if (clash) throw new AppError('This bus is already scheduled during that time', 409);

  const boardingPoints = await validatePointsForRoute(route._id, bus.operator, req.body.boardingPoints, 'boarding');
  const droppingPoints = await validatePointsForRoute(route._id, bus.operator, req.body.droppingPoints, 'dropping');

  const seats = bus.seatTemplate.map((s) => ({ number: s.number, price: seatPrice(baseFare, s), status: 'available' }));
  const journey = await Journey.create({
    bus: bus._id,
    route: route._id,
    operator: bus.operator,
    departure: dep,
    arrival: arr,
    baseFare,
    boardingPoints,
    droppingPoints,
    seats,
    ...(req.body.cancellationPolicy ? { cancellationPolicy: req.body.cancellationPolicy } : {}),
  });
  ok(res, { journey }, 'Journey published', 201);
});

const ownJourney = async (req) => {
  const j = await Journey.findById(req.params.id);
  if (!j) throw new AppError('Journey not found', 404);
  if (req.user.role !== 'admin' && String(j.operator) !== String(req.operator._id)) throw new AppError('Not your journey', 403);
  return j;
};

export const setStatus = asyncHandler(async (req, res) => {
  await ownJourney(req);
  const journey = await updateJourneyStatus(req.params.id, req.body);
  ok(res, { journey }, `Journey marked ${journey.status}`);
});

export const reservations = asyncHandler(async (req, res) => {
  await ownJourney(req);
  const bookings = await Booking.find({ journey: req.params.id, status: { $in: ['confirmed', 'completed'] } })
    .populate('user', 'name phone email')
    .populate('boardingPoint', 'name')
    .populate('droppingPoint', 'name')
    .sort({ createdAt: 1 })
    .lean();
  ok(res, {
    reservations: bookings.map((b) => ({
      _id: b._id,
      bookingRef: b.bookingRef,
      status: b.status,
      seats: b.seats,
      passengers: b.passengers,
      contact: b.contactPhone || b.user?.phone,
      boardingPoint: b.boardingPoint?.name,
      droppingPoint: b.droppingPoint?.name,
      checkedInAt: b.checkedInAt,
      amount: b.fare.seatTotal - b.fare.discount,
    })),
  });
});

export const operatorJourneys = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { operator: req.operator._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.upcoming === 'true') filter.departure = { $gt: new Date() };
  const journeys = await Journey.find(filter)
    .populate('bus', 'name type regNo')
    .populate('route', 'source destination')
    .populate('operator', 'orgName')
    .sort({ departure: -1 })
    .limit(200)
    .lean();
  const now = new Date();
  ok(res, {
    journeys: journeys.map((j) => ({
      ...j,
      seats: undefined,
      totalSeats: j.seats.length,
      bookedSeats: j.seats.filter((s) => s.status === 'booked').length,
      availableSeats: countAvailable(j, now),
    })),
  });
});

export const postLocation = asyncHandler(async (req, res) => {
  await ownJourney(req);
  ok(res, { gps: await recordGpsFix(req.params.id, req.body) }, 'Position received');
});

export const stopLocation = asyncHandler(async (req, res) => {
  await ownJourney(req);
  ok(res, await stopGps(req.params.id), 'Live sharing stopped');
});
