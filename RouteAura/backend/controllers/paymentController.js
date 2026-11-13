import crypto from 'crypto';
import { Booking, Payment } from '../models/index.js';
import { AppError, asyncHandler, ok } from '../utils/AppError.js';
import { config } from '../config/env.js';
import { createOrder, confirmPayment, failPayment, paymentConfig, settleZeroAmount, verifyRazorpaySignature } from '../services/paymentService.js';

const loadOwnBooking = async (bookingId, userId) => {
  const booking = await Booking.findOne({ _id: bookingId, user: userId });
  if (!booking) throw new AppError('Booking not found', 404);
  return booking;
};

const respondConfirmed = (res, result) => {
  if (result.seatConflict) {
    return res.status(409).json({
      success: false,
      message: 'Your payment was received but the seats were no longer available. A full refund has been initiated.',
      data: { booking: result.booking },
    });
  }
  return ok(res, { booking: result.booking, alreadyProcessed: !!result.alreadyProcessed }, result.alreadyProcessed ? 'Payment was already processed' : 'Payment verified. Booking confirmed!');
};

export const getConfig = (req, res) => ok(res, paymentConfig());

export const create = asyncHandler(async (req, res) => {
  const booking = await loadOwnBooking(req.body.bookingId, req.user._id);
  if (booking.fare.amountDue === 0 && booking.status === 'pending_payment') {
    return respondConfirmed(res, await settleZeroAmount(booking));
  }
  const { payment, reused } = await createOrder(booking);
  ok(res, {
    mode: payment.mode,
    orderId: payment.providerOrderId,
    amount: payment.amount,
    currency: payment.currency,
    keyId: payment.mode === 'razorpay' ? config.razorpayKeyId : null,
    bookingRef: booking.bookingRef,
    reused,
  });
});

/** Razorpay: the frontend sends the checkout result; we NEVER trust it until the HMAC signature verifies. */
export const verify = asyncHandler(async (req, res) => {
  if (config.paymentMode !== 'razorpay') throw new AppError('Razorpay verification is disabled in mock mode', 400);
  const { bookingId, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  const booking = await loadOwnBooking(bookingId, req.user._id);
  const payment = await Payment.findOne({ booking: booking._id });
  if (!payment || payment.providerOrderId !== orderId) throw new AppError('Order does not match this booking', 400);
  if (!verifyRazorpaySignature(orderId, paymentId, signature)) throw new AppError('Payment verification failed', 400);
  respondConfirmed(res, await confirmPayment(booking._id, { providerPaymentId: paymentId }));
});

/** Razorpay checkout dismissed / failed on the client. */
export const reportFailure = asyncHandler(async (req, res) => {
  const booking = await loadOwnBooking(req.body.bookingId, req.user._id);
  await failPayment(booking._id, req.body.reason || 'Payment cancelled');
  ok(res, {}, 'Payment marked as failed. You can retry.');
});

/** Demo gateway. Only available when PAYMENT_MODE=mock; goes through the same confirmation path as real payments. */
export const mock = asyncHandler(async (req, res) => {
  if (config.paymentMode !== 'mock') throw new AppError('Mock payments are disabled', 403);
  const booking = await loadOwnBooking(req.body.bookingId, req.user._id);
  const payment = await Payment.findOne({ booking: booking._id });
  if (!payment) throw new AppError('Start the payment first', 400);

  if (req.body.outcome === 'failure') {
    await failPayment(booking._id, 'Mock payment declined');
    throw new AppError('Payment failed (mock gateway). You can try again.', 402);
  }
  respondConfirmed(res, await confirmPayment(booking._id, { providerPaymentId: `mock_pay_${crypto.randomBytes(8).toString('hex')}` }));
});
