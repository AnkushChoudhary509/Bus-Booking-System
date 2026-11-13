import { User, Booking, Review } from '../models/index.js';
import { AppError, asyncHandler, ok } from '../utils/AppError.js';

export const updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name', 'phone', 'gender', 'savedPassengers'];
  for (const k of allowed) if (req.body[k] !== undefined) req.user[k] = req.body[k];
  await req.user.save();
  ok(res, { user: req.user.toSafeJSON() }, 'Profile updated');
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.comparePassword(req.body.currentPassword))) throw new AppError('Current password is incorrect', 400);
  user.passwordHash = await User.hashPassword(req.body.newPassword);
  await user.save();
  ok(res, {}, 'Password changed');
});

const istHour = (d) => new Date(new Date(d).getTime() + 330 * 60000).getUTCHours();

/** Travel Passport: everything is derived from the user's real bookings and stored route distances. */
export const passport = asyncHandler(async (req, res) => {
  const now = new Date();
  const bookings = await Booking.find({ user: req.user._id, status: { $in: ['confirmed', 'completed', 'cancelled', 'replaced'] } })
    .populate({ path: 'journey', select: 'departure arrival route status', populate: { path: 'route', select: 'source destination distanceKm' } })
    .sort({ createdAt: -1 })
    .lean();

  const shape = (b) => ({
    _id: b._id,
    bookingRef: b.bookingRef,
    status: b.status,
    seats: b.seats,
    source: b.journey?.route?.source,
    destination: b.journey?.route?.destination,
    distanceKm: b.journey?.route?.distanceKm || 0,
    departure: b.journey?.departure,
    arrival: b.journey?.arrival,
  });
  const isDone = (b) => b.status === 'completed' || (b.status === 'confirmed' && b.journey && new Date(b.journey.arrival) < now);
  const completed = bookings.filter(isDone).map(shape);
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && !isDone(b)).map(shape);
  const cancelled = bookings.filter((b) => b.status === 'cancelled').map(shape);
  const replaced = bookings.filter((b) => b.status === 'replaced').length;

  const totalDistanceKm = completed.reduce((s, b) => s + b.distanceKm, 0);
  const destinations = new Set(completed.map((b) => b.destination));
  const routeCount = {};
  completed.forEach((b) => { const k = `${b.source} → ${b.destination}`; routeCount[k] = (routeCount[k] || 0) + 1; });
  const topRoute = Object.entries(routeCount).sort((a, b) => b[1] - a[1])[0];
  const reviewCount = await Review.countDocuments({ user: req.user._id });
  const nightTrips = completed.filter((b) => { const h = istHour(b.departure); return h >= 20 || h < 4; }).length;

  const achievements = [
    { key: 'first', title: 'First Journey', description: 'Complete your first trip', progress: completed.length, target: 1 },
    { key: 'frequent', title: 'Frequent Traveller', description: 'Complete 5 journeys', progress: completed.length, target: 5 },
    { key: 'distance', title: 'Road Warrior', description: 'Travel 1,000 km with RouteAura', progress: Math.round(totalDistanceKm), target: 1000 },
    { key: 'cities', title: 'City Hopper', description: 'Arrive in 3 different cities', progress: destinations.size, target: 3 },
    { key: 'night', title: 'Night Owl', description: 'Take a night journey (8 pm – 4 am)', progress: nightTrips, target: 1 },
    { key: 'reviewer', title: 'Trusted Voice', description: 'Review a journey', progress: reviewCount, target: 1 },
    { key: 'rescued', title: 'Rescue Survivor', description: 'Switch to a replacement journey after a disruption', progress: replaced, target: 1 },
  ].map((a) => ({ ...a, earned: a.progress >= a.target, progress: Math.min(a.progress, a.target) }));

  const points = req.user.loyaltyPoints;
  const tier = points >= 2000 ? 'Gold' : points >= 500 ? 'Silver' : 'Bronze';
  const nextTierAt = tier === 'Bronze' ? 500 : tier === 'Silver' ? 2000 : null;

  ok(res, {
    stats: {
      totalJourneys: completed.length,
      totalDistanceKm,
      upcomingJourneys: upcoming.length,
      cancelledBookings: cancelled.length,
      citiesVisited: destinations.size,
      topRoute: topRoute ? { route: topRoute[0], trips: topRoute[1] } : null,
      loyaltyPoints: points,
      tier,
      nextTierAt,
    },
    completed,
    upcoming,
    cancelled,
    savedRoutes: req.user.favoriteRoutes,
    achievements,
    notes: { distance: 'Distance is the sum of stored route distances for completed journeys.', points: '1 loyalty point is earned for every ₹10 paid.' },
  });
});

export const addFavorite = asyncHandler(async (req, res) => {
  const { source, destination } = req.body;
  const exists = req.user.favoriteRoutes.some((f) => f.source.toLowerCase() === source.toLowerCase() && f.destination.toLowerCase() === destination.toLowerCase());
  if (!exists) {
    if (req.user.favoriteRoutes.length >= 20) throw new AppError('You can save up to 20 routes', 400);
    req.user.favoriteRoutes.push({ source, destination });
    await req.user.save();
  }
  ok(res, { favorites: req.user.favoriteRoutes }, 'Route saved', 201);
});

export const removeFavorite = asyncHandler(async (req, res) => {
  req.user.favoriteRoutes = req.user.favoriteRoutes.filter((f) => String(f._id) !== req.params.id);
  await req.user.save();
  ok(res, { favorites: req.user.favoriteRoutes });
});

export const listFavorites = asyncHandler(async (req, res) => ok(res, { favorites: req.user.favoriteRoutes }));
export const listHistory = asyncHandler(async (req, res) => ok(res, { history: req.user.searchHistory }));
export const clearHistory = asyncHandler(async (req, res) => {
  req.user.searchHistory = [];
  await req.user.save();
  ok(res, { history: [] }, 'Search history cleared');
});
