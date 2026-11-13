import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Booking, Journey, Payment, User, Coupon } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { config } from '../config/env.js';
import { generateQrToken } from '../utils/bookingRef.js';
import { confirmSeats, lockSeats } from './seatService.js';
import { finalizeReplacement } from './bookingService.js';
import { notify } from './notificationService.js';
import { emitToUser } from '../sockets/index.js';

let rzp = null;
function razorpayClient() {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) throw new AppError('Payment gateway is not configured', 500);
  if (!rzp) rzp = new Razorpay({ key_id: config.razorpayKeyId, key_secret: config.razorpayKeySecret });
  return rzp;
}

export const paymentConfig = () => ({
  mode: config.paymentMode,
  keyId: config.paymentMode === 'razorpay' ? config.razorpayKeyId : null, // key id is public; the secret never leaves the server
});

/** HMAC-SHA256 signature check exactly as documented by Razorpay (constant-time compare). */
export function verifyRazorpaySignature(orderId, paymentId, signature, secret = config.razorpayKeySecret) {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Create (or reuse) the single Payment record for a booking.
 *  - created -> the same order is returned again (retries are harmless)
 *  - failed  -> a fresh order is attached to the SAME record (still one payment per booking)
 *  - paid    -> 409
 */
export async function createOrder(booking) {
  if (!['pending_payment'].includes(booking.status)) throw new AppError(`This booking is ${booking.status.replace('_', ' ')} and cannot be paid`, 409);

  // verify the seats are still ours (and extend the hold while the passenger pays)
  await lockSeats(booking.journey, booking.user, booking.seats);

  let payment = await Payment.findOne({ booking: booking._id });
  if (payment?.status === 'paid') throw new AppError('This booking is already paid', 409);
  if (payment?.status === 'created') return { payment, reused: true };

  const amount = booking.fare.amountDue;
  let providerOrderId;
  if (config.paymentMode === 'razorpay') {
    const order = await razorpayClient().orders.create({
      amount: amount * 100, // paise
      currency: 'INR',
      receipt: booking.bookingRef,
      notes: { bookingId: String(booking._id) },
    });
    providerOrderId = order.id;
  } else {
    providerOrderId = `mock_order_${crypto.randomBytes(8).toString('hex')}`;
  }

  if (payment) {
    payment.status = 'created';
    payment.providerOrderId = providerOrderId;
    payment.failureReason = undefined;
    payment.amount = amount;
    await payment.save();
  } else {
    try {
      payment = await Payment.create({
        booking: booking._id,
        user: booking.user,
        amount,
        mode: config.paymentMode,
        providerOrderId,
      });
    } catch (err) {
      if (err.code === 11000) return { payment: await Payment.findOne({ booking: booking._id }), reused: true }; // concurrent create
      throw err;
    }
  }
  if (booking.paymentStatus === 'failed') {
    await Booking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'unpaid' } });
  }
  return { payment, reused: false };
}

/**
 * The ONLY place where a booking becomes confirmed.
 * Idempotent: the Payment document is claimed with an atomic created -> paid transition, so processing the same
 * payment twice (double click, retry, replayed request) confirms exactly once and never charges twice.
 */
export async function confirmPayment(bookingId, { providerPaymentId }) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError('Booking not found', 404);
  if (booking.status === 'confirmed') return { booking, alreadyProcessed: true };
  if (!['pending_payment', 'expired'].includes(booking.status)) {
    throw new AppError(`Booking is ${booking.status} and cannot be confirmed`, 409);
  }

  let claimed;
  try {
    claimed = await Payment.findOneAndUpdate(
      { booking: booking._id, status: 'created' },
      { $set: { status: 'paid', providerPaymentId, paidAt: new Date() } },
      { new: true }
    );
  } catch (err) {
    if (err.code === 11000) throw new AppError('This payment has already been applied to another booking', 409);
    throw err;
  }
  if (!claimed) {
    // somebody else already processed (or failed) this payment
    return { booking: await Booking.findById(bookingId), alreadyProcessed: true };
  }

  // server-side seat verification: all-or-nothing atomic conversion to booked
  const seatsOk = await confirmSeats(booking.journey, booking.user, booking.seats, booking._id);

  if (!seatsOk) {
    // paid but the seats are gone (lock expired AND someone else took them): refund, never double-sell
    await Payment.updateOne(
      { _id: claimed._id },
      { $set: { refundStatus: claimed.amount > 0 ? 'pending' : 'none', refundAmount: claimed.amount, refundReason: 'Seats were no longer available after payment' } }
    );
    const failed = await Booking.findOneAndUpdate(
      { _id: booking._id },
      {
        $set: { status: 'expired', paymentStatus: claimed.amount > 0 ? 'refund_pending' : 'unpaid' },
        $push: { history: { status: 'expired', note: 'Seats unavailable after payment; refund initiated' } },
      },
      { new: true }
    );
    await notify(booking.user, {
      type: 'payment',
      title: 'Seats no longer available',
      body: `We could not hold your seats for ${booking.bookingRef}. A full refund has been initiated.`,
      link: '/bookings',
      email: true,
    });
    return { booking: failed, seatConflict: true };
  }

  const points = Math.floor(claimed.amount / 10);
  const confirmed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: { $in: ['pending_payment', 'expired'] } },
    {
      $set: { status: 'confirmed', paymentStatus: 'paid', qrToken: generateQrToken(), pointsAwarded: points },
      $push: { history: { status: 'confirmed', note: 'Payment verified, seats confirmed' } },
    },
    { new: true }
  );
  await User.updateOne({ _id: booking.user }, { $inc: { loyaltyPoints: points } });
  if (booking.fare.couponCode) await Coupon.updateOne({ code: booking.fare.couponCode }, { $inc: { usedCount: 1 } });
  if (confirmed.replacementFor) await finalizeReplacement(confirmed);

  const journey = await Journey.findById(confirmed.journey).populate('route', 'source destination');
  await notify(confirmed.user, {
    type: 'booking',
    title: `Booking confirmed: ${confirmed.bookingRef}`,
    body: `${journey.route.source} → ${journey.route.destination}, seats ${confirmed.seats.join(', ')}.`,
    link: `/booking/${confirmed._id}`,
    email: true,
  });
  emitToUser(String(confirmed.user), 'booking:update', { bookingId: confirmed._id, status: confirmed.status });
  return { booking: confirmed, alreadyProcessed: false };
}

/** Payment attempt failed or was dismissed. The booking stays pending so the passenger can retry until the lock expires. */
export async function failPayment(bookingId, reason = 'Payment failed') {
  const payment = await Payment.findOneAndUpdate(
    { booking: bookingId, status: 'created' },
    { $set: { status: 'failed', failureReason: reason } },
    { new: true }
  );
  if (payment) await Booking.updateOne({ _id: bookingId, status: 'pending_payment' }, { $set: { paymentStatus: 'failed' } });
  return payment;
}

/** Zero-amount settlement (replacement fully covered by credit). Goes through the same confirm path. */
export async function settleZeroAmount(booking) {
  if (booking.fare.amountDue !== 0) throw new AppError('Booking still has an amount due', 400);
  await Payment.findOneAndUpdate(
    { booking: booking._id },
    {
      $setOnInsert: { user: booking.user, amount: 0, mode: config.paymentMode, status: 'created', providerOrderId: `credit_${booking.bookingRef}` },
    },
    { upsert: true, new: true }
  );
  return confirmPayment(booking._id, { providerPaymentId: `credit_${booking.bookingRef}` });
}

/** Admin: approve or reject a pending refund. In Razorpay mode the refund is issued through the gateway first. */
export async function processRefund(paymentId, action, note) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new AppError('Payment not found', 404);
  if (payment.refundStatus !== 'pending') throw new AppError('No pending refund on this payment', 409);

  if (action === 'reject') {
    payment.refundStatus = 'rejected';
    payment.refundReason = note || payment.refundReason;
    await payment.save();
    await Booking.updateOne({ _id: payment.booking }, { $set: { paymentStatus: 'paid' } });
    await notify(payment.user, { type: 'refund', title: 'Refund request declined', body: note || 'Your refund request was declined.', link: '/bookings' });
    return payment;
  }

  if (payment.mode === 'razorpay' && payment.providerPaymentId && payment.refundAmount > 0 && !payment.providerPaymentId.startsWith('credit_')) {
    try {
      await razorpayClient().payments.refund(payment.providerPaymentId, { amount: payment.refundAmount * 100 });
    } catch (err) {
      throw new AppError(`Gateway refund failed: ${err.error?.description || err.message}`, 502);
    }
  }
  payment.refundStatus = 'processed';
  payment.refundedAt = new Date();
  if (payment.refundAmount >= payment.amount) payment.status = 'refunded';
  await payment.save();
  await Booking.updateOne({ _id: payment.booking }, { $set: { paymentStatus: 'refunded' } });
  await notify(payment.user, {
    type: 'refund',
    title: 'Refund processed',
    body: `₹${payment.refundAmount} has been refunded to your original payment method.`,
    link: '/bookings',
    email: true,
  });
  return payment;
}
