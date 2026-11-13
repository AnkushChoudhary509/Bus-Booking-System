import { User, BusOperator, Bus, Journey, Booking, Payment, SupportTicket, Coupon, Route } from '../models/index.js';
import { AppError, asyncHandler, ok } from '../utils/AppError.js';
import { paginate, pageMeta, escapeRegex } from '../utils/paginate.js';
import { notify } from '../services/notificationService.js';
import { processRefund } from '../services/paymentService.js';
import { simulate } from '../services/journeyService.js';

const REVENUE_STATUSES = ['confirmed', 'completed'];
const revenueExpr = { $subtract: ['$fare.seatTotal', '$fare.discount'] };

export const stats = asyncHandler(async (req, res) => {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const [users, operators, buses, journeysByStatus, bookingsByStatus, revenue, today, pendingRefunds, openTickets, pendingOperators] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
    BusOperator.aggregate([{ $group: { _id: '$approvalStatus', n: { $sum: 1 } } }]),
    Bus.countDocuments({ isActive: true }),
    Journey.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Booking.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Booking.aggregate([{ $match: { status: { $in: REVENUE_STATUSES } } }, { $group: { _id: null, total: { $sum: revenueExpr }, count: { $sum: 1 } } }]),
    Booking.countDocuments({ createdAt: { $gte: startOfDay }, status: { $in: REVENUE_STATUSES } }),
    Payment.countDocuments({ refundStatus: 'pending' }),
    SupportTicket.countDocuments({ status: { $ne: 'resolved' } }),
    BusOperator.countDocuments({ approvalStatus: 'pending' }),
  ]);
  const toMap = (arr) => Object.fromEntries(arr.map((x) => [x._id, x.n]));
  ok(res, {
    users: toMap(users),
    operators: toMap(operators),
    activeBuses: buses,
    journeys: toMap(journeysByStatus),
    bookings: toMap(bookingsByStatus),
    revenue: revenue[0]?.total || 0,
    paidBookings: revenue[0]?.count || 0,
    bookingsToday: today,
    pendingRefunds,
    openTickets,
    pendingOperators,
  });
});

export const revenueReport = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const match = { status: { $in: REVENUE_STATUSES } };
  const [byDay, byOperator, byRoute] = await Promise.all([
    Booking.aggregate([
      { $match: { ...match, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, revenue: { $sum: revenueExpr }, bookings: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([
      { $match: match },
      { $group: { _id: '$operator', revenue: { $sum: revenueExpr }, bookings: { $sum: 1 } } },
      { $lookup: { from: 'busoperators', localField: '_id', foreignField: '_id', as: 'o' } },
      { $unwind: '$o' },
      { $project: { _id: 0, operator: '$o.orgName', revenue: 1, bookings: 1 } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
    Booking.aggregate([
      { $match: match },
      { $lookup: { from: 'journeys', localField: 'journey', foreignField: '_id', as: 'j' } },
      { $unwind: '$j' },
      { $lookup: { from: 'routes', localField: 'j.route', foreignField: '_id', as: 'r' } },
      { $unwind: '$r' },
      { $group: { _id: { $concat: ['$r.source', ' → ', '$r.destination'] }, revenue: { $sum: revenueExpr }, bookings: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, route: '$_id', revenue: 1, bookings: 1 } },
    ]),
  ]);
  ok(res, { byDay: byDay.map((d) => ({ date: d._id, revenue: d.revenue, bookings: d.bookings })), byOperator, byRoute });
});

export const users = asyncHandler(async (req, res) => {
  const p = paginate(req.query);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [list, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).select('-searchHistory').lean(), User.countDocuments(filter)]);
  ok(res, { users: list, ...pageMeta(total, p) });
});

export const setUserActive = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw new AppError('You cannot disable your own account', 400);
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.query.activate === 'true' }, { new: true });
  if (!user) throw new AppError('User not found', 404);
  ok(res, { user: user.toSafeJSON(), isActive: user.isActive });
});

export const operators = asyncHandler(async (req, res) => {
  const filter = req.query.status ? { approvalStatus: req.query.status } : {};
  ok(res, { operators: await BusOperator.find(filter).populate('user', 'name email phone isActive').sort({ createdAt: -1 }).lean() });
});

export const decideOperator = (approved) =>
  asyncHandler(async (req, res) => {
    const op = await BusOperator.findById(req.params.id);
    if (!op) throw new AppError('Operator not found', 404);
    op.approvalStatus = approved ? 'approved' : 'rejected';
    op.rejectionReason = approved ? undefined : req.body.reason || 'Application did not meet our requirements';
    op.reviewedAt = new Date();
    await op.save();
    await notify(op.user, {
      type: 'operator',
      title: approved ? 'Your operator account is approved' : 'Your operator application was rejected',
      body: approved ? 'You can now add buses and publish journeys.' : op.rejectionReason,
      link: '/operator',
      email: true,
    });
    ok(res, { operator: op }, approved ? 'Operator approved' : 'Operator rejected');
  });

export const buses = asyncHandler(async (req, res) => ok(res, { buses: await Bus.find().select('-seatTemplate').populate('operator', 'orgName').sort({ createdAt: -1 }).lean() }));

export const journeys = asyncHandler(async (req, res) => {
  const p = paginate(req.query, { limit: 30, max: 100 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const [list, total] = await Promise.all([
    Journey.find(filter).populate('route', 'source destination').populate('bus', 'name regNo').populate('operator', 'orgName').sort({ departure: -1 }).skip(p.skip).limit(p.limit).lean(),
    Journey.countDocuments(filter),
  ]);
  ok(res, {
    journeys: list.map((j) => ({ ...j, seats: undefined, totalSeats: j.seats.length, bookedSeats: j.seats.filter((s) => s.status === 'booked').length })),
    ...pageMeta(total, p),
  });
});

export const bookings = asyncHandler(async (req, res) => {
  const p = paginate(req.query, { limit: 30, max: 100 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.bookingRef = new RegExp(escapeRegex(req.query.q), 'i');
  const [list, total] = await Promise.all([
    Booking.find(filter)
      .populate('user', 'name email')
      .populate('operator', 'orgName')
      .populate({ path: 'journey', select: 'departure route', populate: { path: 'route', select: 'source destination' } })
      .sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    Booking.countDocuments(filter),
  ]);
  ok(res, { bookings: list, ...pageMeta(total, p) });
});

export const refunds = asyncHandler(async (req, res) => {
  const filter = { refundStatus: req.query.status || 'pending' };
  const list = await Payment.find(filter)
    .populate({ path: 'booking', select: 'bookingRef status seats', })
    .populate('user', 'name email')
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  ok(res, { refunds: list });
});

export const decideRefund = asyncHandler(async (req, res) => {
  const payment = await processRefund(req.params.id, req.body.action, req.body.note);
  ok(res, { payment }, req.body.action === 'approve' ? 'Refund processed' : 'Refund rejected');
});

export const supportTickets = asyncHandler(async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  ok(res, { tickets: await SupportTicket.find(filter).populate('user', 'name email').populate('booking', 'bookingRef').sort({ updatedAt: -1 }).limit(100).lean() });
});

export const listCoupons = asyncHandler(async (req, res) => ok(res, { coupons: await Coupon.find().sort({ createdAt: -1 }).lean() }));

export const createCoupon = asyncHandler(async (req, res) => {
  if (req.body.discountType === 'percent' && req.body.value > 100) throw new AppError('Percent discount cannot exceed 100', 400);
  ok(res, { coupon: await Coupon.create({ ...req.body, code: req.body.code.toUpperCase() }) }, 'Coupon created', 201);
});

export const toggleCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, { isActive: req.query.activate === 'true' }, { new: true });
  if (!coupon) throw new AppError('Coupon not found', 404);
  ok(res, { coupon });
});

export const simulation = asyncHandler(async (req, res) => {
  const journey = await simulate(req.params.id, req.body.action, req.body.value);
  ok(res, { journey: { _id: journey._id, status: journey.status, delayMin: journey.delayMin, simulation: journey.simulation } }, 'Simulation updated');
});

export const routesAdmin = asyncHandler(async (req, res) => ok(res, { routes: await Route.find().sort({ source: 1 }).lean() }));
