import { Review, Booking, BusOperator, Notification, SupportTicket, Coupon } from '../models/index.js';
import { AppError, asyncHandler, ok } from '../utils/AppError.js';
import { notify } from '../services/notificationService.js';
import { User } from '../models/index.js';

// ---------------- reviews ----------------
export const createReview = asyncHandler(async (req, res) => {
  const { bookingId, rating, comment } = req.body;
  const booking = await Booking.findOne({ _id: bookingId, user: req.user._id }).populate('journey', 'arrival');
  if (!booking) throw new AppError('Booking not found', 404);
  const finished = booking.status === 'completed' || (booking.status === 'confirmed' && new Date(booking.journey.arrival) < new Date());
  if (!finished) throw new AppError('You can review a journey after it is completed', 409);
  if (await Review.exists({ booking: booking._id })) throw new AppError('You have already reviewed this journey', 409);

  const review = await Review.create({ user: req.user._id, booking: booking._id, journey: booking.journey._id, operator: booking.operator, rating, comment });
  const [agg] = await Review.aggregate([{ $match: { operator: booking.operator } }, { $group: { _id: '$operator', avg: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  await BusOperator.updateOne({ _id: booking.operator }, { $set: { ratingAvg: Math.round(agg.avg * 10) / 10, ratingCount: agg.count } });
  ok(res, { review }, 'Thanks for your review!', 201);
});

export const operatorReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ operator: req.params.id }).populate('user', 'name').sort({ createdAt: -1 }).limit(30).lean();
  ok(res, { reviews: reviews.map((r) => ({ rating: r.rating, comment: r.comment, name: r.user?.name?.split(' ')[0], createdAt: r.createdAt })) });
});

// ---------------- notifications ----------------
export const listNotifications = asyncHandler(async (req, res) => {
  const [notifications, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(60).lean(),
    Notification.countDocuments({ user: req.user._id, readAt: null }),
  ]);
  ok(res, { notifications, unread });
});

export const markRead = asyncHandler(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { readAt: new Date() } });
  ok(res, {});
});

export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  ok(res, {}, 'All notifications marked as read');
});

// ---------------- support ----------------
export const createTicket = asyncHandler(async (req, res) => {
  const { subject, message, category, bookingId } = req.body;
  if (bookingId && !(await Booking.exists({ _id: bookingId, user: req.user._id }))) throw new AppError('Booking not found', 404);
  const ticket = await SupportTicket.create({ user: req.user._id, subject, message, category, booking: bookingId });
  const admins = await User.find({ role: 'admin' }).select('_id');
  await Promise.all(admins.map((a) => notify(a._id, { type: 'support', title: 'New support ticket', body: subject, link: '/admin' })));
  ok(res, { ticket }, 'Your request has been submitted', 201);
});

export const myTickets = asyncHandler(async (req, res) =>
  ok(res, { tickets: await SupportTicket.find({ user: req.user._id }).sort({ updatedAt: -1 }).populate('booking', 'bookingRef').lean() })
);

export const replyTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw new AppError('Ticket not found', 404);
  const isOwner = String(ticket.user) === String(req.user._id);
  if (!isOwner && req.user.role !== 'admin') throw new AppError('Ticket not found', 404);
  ticket.replies.push({ author: req.user._id, authorRole: req.user.role, message: req.body.message });
  if (req.user.role === 'admin') {
    ticket.status = req.body.status || 'in_progress';
    await notify(ticket.user, { type: 'support', title: 'Support replied to your request', body: ticket.subject, link: '/support' });
  } else if (ticket.status === 'resolved') {
    ticket.status = 'open';
  }
  await ticket.save();
  ok(res, { ticket }, 'Reply sent');
});

// ---------------- coupons ----------------
export const activeCoupons = asyncHandler(async (req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({ isActive: true, validFrom: { $lte: now }, validTo: { $gte: now } }).select('code description discountType value maxDiscount minAmount validTo').lean();
  ok(res, { coupons });
});

export const validateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findOne({ code: req.body.code.toUpperCase() });
  if (!coupon || !coupon.isUsable()) throw new AppError('This coupon is invalid or expired', 400);
  const discount = coupon.discountFor(req.body.amount);
  if (discount <= 0) throw new AppError(`Minimum booking of ₹${coupon.minAmount} required for this coupon`, 400);
  ok(res, { code: coupon.code, discount, description: coupon.description });
});
