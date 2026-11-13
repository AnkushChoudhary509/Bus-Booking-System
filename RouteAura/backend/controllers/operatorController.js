import { Booking, Journey, Bus, BusOperator } from '../models/index.js';
import { asyncHandler, ok } from '../utils/AppError.js';
import { countAvailable } from '../services/seatService.js';

const REVENUE_STATUSES = ['confirmed', 'completed'];
const revenueExpr = { $subtract: ['$fare.seatTotal', '$fare.discount'] };

export const dashboard = asyncHandler(async (req, res) => {
  const op = req.operator._id;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const now = new Date();

  const [totals, byDay, byRoute, upcoming, buses] = await Promise.all([
    Booking.aggregate([
      { $match: { operator: op, status: { $in: REVENUE_STATUSES } } },
      { $group: { _id: null, revenue: { $sum: revenueExpr }, bookings: { $sum: 1 }, seats: { $sum: { $size: '$seats' } } } },
    ]),
    Booking.aggregate([
      { $match: { operator: op, status: { $in: REVENUE_STATUSES }, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, revenue: { $sum: revenueExpr }, bookings: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([
      { $match: { operator: op, status: { $in: REVENUE_STATUSES } } },
      { $lookup: { from: 'journeys', localField: 'journey', foreignField: '_id', as: 'j' } },
      { $unwind: '$j' },
      { $lookup: { from: 'routes', localField: 'j.route', foreignField: '_id', as: 'r' } },
      { $unwind: '$r' },
      { $group: { _id: { $concat: ['$r.source', ' → ', '$r.destination'] }, revenue: { $sum: revenueExpr }, bookings: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: 8 },
    ]),
    Journey.find({ operator: op, departure: { $gt: now }, status: { $in: ['scheduled', 'boarding', 'delayed'] } }).select('seats departure').lean(),
    Bus.countDocuments({ operator: op, isActive: true }),
  ]);

  const seatsTotal = upcoming.reduce((s, j) => s + j.seats.length, 0);
  const seatsFree = upcoming.reduce((s, j) => s + countAvailable(j, now), 0);
  const t = totals[0] || { revenue: 0, bookings: 0, seats: 0 };
  ok(res, {
    approvalStatus: req.operator.approvalStatus,
    rejectionReason: req.operator.rejectionReason,
    summary: {
      revenue: t.revenue,
      bookings: t.bookings,
      seatsSold: t.seats,
      upcomingJourneys: upcoming.length,
      activeBuses: buses,
      upcomingOccupancyPct: seatsTotal ? Math.round(((seatsTotal - seatsFree) / seatsTotal) * 100) : 0,
      rating: { avg: req.operator.ratingAvg, count: req.operator.ratingCount },
    },
    revenueByDay: byDay.map((d) => ({ date: d._id, revenue: d.revenue, bookings: d.bookings })),
    revenueByRoute: byRoute.map((r) => ({ route: r._id, revenue: r.revenue, bookings: r.bookings })),
    note: 'Revenue counts confirmed and completed bookings (seat total minus discounts).',
  });
});

export const bookings = asyncHandler(async (req, res) => {
  const filter = { operator: req.operator._id };
  if (req.query.status) filter.status = req.query.status;
  const list = await Booking.find(filter)
    .populate('user', 'name phone')
    .populate({ path: 'journey', select: 'departure route', populate: { path: 'route', select: 'source destination' } })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  ok(res, { bookings: list });
});

export const profile = asyncHandler(async (req, res) => ok(res, { operator: await BusOperator.findById(req.operator._id) }));
