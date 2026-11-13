import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, restrict, optionalAuth, requireApprovedOperator } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as S from '../validators/schemas.js';
import * as auth from '../controllers/authController.js';
import * as users from '../controllers/userController.js';
import { announceCatalogChanges } from '../middleware/catalog.js';
import * as routes from '../controllers/routeController.js';
import * as buses from '../controllers/busController.js';
import * as journeys from '../controllers/journeyController.js';
import * as bookings from '../controllers/bookingController.js';
import * as payments from '../controllers/paymentController.js';
import * as misc from '../controllers/miscController.js';
import * as operator from '../controllers/operatorController.js';
import * as admin from '../controllers/adminController.js';

const router = Router();
router.use(announceCatalogChanges);
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' } });
const operatorOnly = [protect, restrict('operator')];
const inventoryManagers = [protect, restrict('operator', 'admin'), requireApprovedOperator];

// ---- auth
router.post('/auth/register', authLimiter, validate({ body: S.registerSchema }), auth.register);
router.post('/auth/login', authLimiter, validate({ body: S.loginSchema }), auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', protect, auth.me);

// ---- passenger profile, passport, favourites, history
router.put('/users/me', protect, validate({ body: S.profileSchema }), users.updateMe);
router.put('/users/me/password', protect, validate({ body: S.passwordChangeSchema }), users.changePassword);
router.get('/users/me/passport', protect, restrict('passenger'), users.passport);
router.get('/users/me/favorites', protect, users.listFavorites);
router.post('/users/me/favorites', protect, validate({ body: S.favoriteSchema }), users.addFavorite);
router.delete('/users/me/favorites/:id', protect, users.removeFavorite);
router.get('/users/me/search-history', protect, users.listHistory);
router.delete('/users/me/search-history', protect, users.clearHistory);

// ---- routes & boarding points
router.get('/routes/cities', routes.cities);
router.get('/routes/featured', routes.featured);
router.get('/routes', optionalAuth, routes.list);
router.get('/routes/lookup', ...inventoryManagers, routes.lookup);
router.get('/routes/:id', routes.getOne);
router.post('/routes', inventoryManagers, validate({ body: S.routeSchema }), routes.create);
router.put('/routes/:id', protect, restrict('admin'), validate({ body: S.routeSchema.partial() }), routes.update);
router.patch('/routes/:id/active', protect, restrict('admin'), routes.deactivate);
router.get('/routes/:id/boarding-points', optionalAuth, routes.listPoints);
router.post('/routes/:id/boarding-points', protect, restrict('operator'), requireApprovedOperator, validate({ body: S.boardingPointSchema }), routes.createPoint);
router.delete('/routes/:id/boarding-points/:pointId', protect, restrict('operator', 'admin'), routes.deletePoint);

// ---- buses
router.get('/buses/meta', buses.meta);
router.get('/buses', protect, restrict('operator', 'admin'), buses.list);
router.post('/buses', inventoryManagers, validate({ body: S.busSchema }), buses.create);
router.get('/buses/:id', protect, restrict('operator', 'admin'), buses.getOne);
router.put('/buses/:id', protect, restrict('operator', 'admin'), validate({ body: S.busSchema.partial() }), buses.update);
router.patch('/buses/:id/active', protect, restrict('operator', 'admin'), buses.setActive);

// ---- journeys: discovery, comparison, seats, tracking
router.get('/journeys/search', optionalAuth, validate({ query: S.searchQuerySchema }), journeys.search);
router.post('/journeys/compare', validate({ body: S.compareSchema }), journeys.compare);
router.post('/journeys', inventoryManagers, validate({ body: S.journeyCreateSchema }), journeys.create);
router.get('/journeys/:id', journeys.getOne);
router.get('/journeys/:id/seats', optionalAuth, journeys.seatMap);
router.post('/journeys/:id/seats/recommend', optionalAuth, validate({ body: S.seatPrefsSchema }), journeys.recommend);
router.post('/journeys/:id/seats/lock', protect, restrict('passenger'), validate({ body: S.lockSeatsSchema }), journeys.lock);
router.delete('/journeys/:id/seats/lock', protect, restrict('passenger'), journeys.unlock);
router.get('/journeys/:id/boarding-points', journeys.boardingPoints);
router.get('/journeys/:id/tracking', journeys.tracking);
router.get('/journeys/:id/reviews', (req, res, next) => { req.params.id = req.params.id; next(); }, async (req, res, next) => {
  try {
    const { Review } = await import('../models/index.js');
    const rows = await Review.find({ journey: req.params.id }).populate('user', 'name').sort({ createdAt: -1 }).limit(20).lean();
    res.json({ success: true, data: { reviews: rows.map((r) => ({ rating: r.rating, comment: r.comment, name: r.user?.name?.split(' ')[0], createdAt: r.createdAt })) } });
  } catch (e) { next(e); }
});
router.patch('/journeys/:id/status', protect, restrict('operator', 'admin'), requireApprovedOperator, validate({ body: S.journeyStatusSchema }), journeys.setStatus);
router.post('/journeys/:id/location', protect, restrict('operator', 'admin'), requireApprovedOperator, validate({ body: S.gpsFixSchema }), journeys.postLocation);
router.delete('/journeys/:id/location', protect, restrict('operator', 'admin'), requireApprovedOperator, journeys.stopLocation);
router.get('/journeys/:id/reservations', protect, restrict('operator', 'admin'), journeys.reservations);

// ---- bookings, tickets, rescue
router.post('/bookings', protect, restrict('passenger'), validate({ body: S.bookingCreateSchema }), bookings.create);
router.get('/bookings/mine', protect, bookings.mine);
router.get('/bookings/:id', protect, bookings.getOne);
router.post('/bookings/:id/cancel', protect, restrict('passenger'), validate({ body: S.cancelSchema }), bookings.cancel);
router.get('/bookings/:id/ticket.pdf', protect, bookings.ticketPdf);
router.get('/bookings/:id/rescue-options', protect, restrict('passenger'), bookings.rescueOptions);
router.post('/bookings/:id/rescue/confirm', protect, restrict('passenger'), validate({ body: S.rescueConfirmSchema }), bookings.rescueConfirm);
router.get('/tickets/verify/:token', bookings.verifyTicket);
router.post('/tickets/check-in/:token', protect, restrict('operator', 'admin'), bookings.checkIn);

// ---- payments
router.get('/payments/config', payments.getConfig);
router.post('/payments/create-order', protect, restrict('passenger'), validate({ body: S.createOrderSchema }), payments.create);
router.post('/payments/verify', protect, restrict('passenger'), validate({ body: S.verifyPaymentSchema }), payments.verify);
router.post('/payments/fail', protect, restrict('passenger'), validate({ body: S.createOrderSchema }), payments.reportFailure);
router.post('/payments/mock', protect, restrict('passenger'), validate({ body: S.mockPaymentSchema }), payments.mock);

// ---- reviews, notifications, support, coupons
router.post('/reviews', protect, restrict('passenger'), validate({ body: S.reviewSchema }), misc.createReview);
router.get('/reviews/operator/:id', misc.operatorReviews);
router.get('/notifications', protect, misc.listNotifications);
router.post('/notifications/read-all', protect, misc.markAllRead);
router.patch('/notifications/:id/read', protect, misc.markRead);
router.post('/support', protect, validate({ body: S.supportSchema }), misc.createTicket);
router.get('/support/mine', protect, misc.myTickets);
router.post('/support/:id/replies', protect, validate({ body: S.supportReplySchema }), misc.replyTicket);
router.get('/coupons/active', misc.activeCoupons);
router.post('/coupons/validate', protect, validate({ body: S.couponValidateSchema }), misc.validateCoupon);

// ---- operator console
router.get('/operator/profile', ...operatorOnly, operator.profile);
router.get('/operator/dashboard', ...operatorOnly, operator.dashboard);
router.get('/operator/bookings', ...operatorOnly, operator.bookings);
router.get('/operator/journeys', protect, restrict('operator', 'admin'), journeys.operatorJourneys);

// ---- admin console
const adminRouter = Router();
adminRouter.use(protect, restrict('admin'));
adminRouter.get('/stats', admin.stats);
adminRouter.get('/revenue', admin.revenueReport);
adminRouter.get('/users', admin.users);
adminRouter.patch('/users/:id/active', admin.setUserActive);
adminRouter.get('/operators', admin.operators);
adminRouter.patch('/operators/:id/approve', admin.decideOperator(true));
adminRouter.patch('/operators/:id/reject', validate({ body: S.operatorDecisionSchema }), admin.decideOperator(false));
adminRouter.get('/buses', admin.buses);
adminRouter.get('/routes', admin.routesAdmin);
adminRouter.get('/journeys', admin.journeys);
adminRouter.get('/bookings', admin.bookings);
adminRouter.get('/refunds', admin.refunds);
adminRouter.patch('/refunds/:id', validate({ body: S.refundDecisionSchema }), admin.decideRefund);
adminRouter.get('/support', admin.supportTickets);
adminRouter.get('/coupons', admin.listCoupons);
adminRouter.post('/coupons', validate({ body: S.couponSchema }), admin.createCoupon);
adminRouter.patch('/coupons/:id/active', admin.toggleCoupon);
adminRouter.post('/simulation/:id', validate({ body: S.simulationSchema }), admin.simulation);
router.use('/admin', adminRouter);

export default router;
