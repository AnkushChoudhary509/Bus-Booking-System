import mongoose from 'mongoose';
import { Booking, Journey, Payment, Coupon, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { generateBookingRef } from '../utils/bookingRef.js';
import { lockSeats, releaseBookedSeats } from './seatService.js';
import { notify } from './notificationService.js';
import { emitToUser } from '../sockets/index.js';

const MAX_SEATS = 6;

/**
 * Create a pending booking.
 *  - idempotent per (user, idempotencyKey): retries return the same booking
 *  - re-verifies / extends the seat locks on the server (never trusts the UI)
 *  - prices everything on the server from the journey's seat prices
 */
export async function createBooking({
  user,
  journeyId,
  seats,
  passengers,
  boardingPointId,
  droppingPointId,
  couponCode,
  idempotencyKey,
  contactPhone,
  credit = 0,
  replacementFor = null,
}) {
  if (idempotencyKey) {
    const existing = await Booking.findOne({ user: user._id, idempotencyKey });
    if (existing) return { booking: existing, reused: true };
  }

  const seatNumbers = [...new Set(seats)];
  if (seatNumbers.length !== seats.length) throw new AppError('Duplicate seats selected', 400);
  if (seatNumbers.length > MAX_SEATS) throw new AppError(`Maximum ${MAX_SEATS} seats per booking`, 400);
  if (!passengers || passengers.length !== seatNumbers.length) {
    throw new AppError('Provide passenger details for every selected seat', 400);
  }

  // server-side seat verification + lock extension (409 if someone else holds any seat)
  await lockSeats(journeyId, user._id, seatNumbers, { maxSeats: MAX_SEATS });

  const journey = await Journey.findById(journeyId).select('seats operator boardingPoints droppingPoints status').lean();
  const priceBySeat = new Map(journey.seats.map((s) => [s.number, s.price]));
  const seatTotal = seatNumbers.reduce((sum, n) => sum + priceBySeat.get(n), 0);

  const inList = (list, id) => list.some((p) => String(p) === String(id));
  if (journey.boardingPoints.length && !boardingPointId) throw new AppError('Select a boarding point', 400);
  if (journey.droppingPoints.length && !droppingPointId) throw new AppError('Select a dropping point', 400);
  if (boardingPointId && !inList(journey.boardingPoints, boardingPointId)) throw new AppError('Invalid boarding point', 400);
  if (droppingPointId && !inList(journey.droppingPoints, droppingPointId)) throw new AppError('Invalid dropping point', 400);

  let discount = 0;
  let appliedCode;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: String(couponCode).toUpperCase() });
    if (!coupon || !coupon.isUsable()) throw new AppError('This coupon is invalid or expired', 400);
    discount = coupon.discountFor(seatTotal);
    if (discount <= 0) throw new AppError(`Coupon needs a minimum booking of ₹${coupon.minAmount}`, 400);
    appliedCode = coupon.code;
  }
  const amountDue = Math.max(0, seatTotal - discount - credit);

  // any older unpaid attempt by this user for this journey is superseded
  await Booking.updateMany(
    { user: user._id, journey: journeyId, status: 'pending_payment' },
    { $set: { status: 'expired' }, $push: { history: { status: 'expired', note: 'Superseded by a newer attempt' } } }
  );

  const doc = {
    user: user._id,
    journey: journeyId,
    operator: journey.operator,
    seats: seatNumbers,
    passengers: passengers.map((p, i) => ({ ...p, seatNumber: seatNumbers[i] })),
    contactPhone: contactPhone || user.phone,
    boardingPoint: boardingPointId || undefined,
    droppingPoint: droppingPointId || undefined,
    fare: { seatTotal, discount, credit, amountDue, couponCode: appliedCode },
    idempotencyKey: idempotencyKey || undefined,
    replacementFor: replacementFor || null,
    history: [{ status: 'pending_payment', note: 'Booking created, awaiting payment' }],
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const booking = await Booking.create({ ...doc, bookingRef: generateBookingRef() });
      return { booking, reused: false };
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.bookingRef) continue; // reference collision -> regenerate
      if (err.code === 11000 && err.keyPattern?.idempotencyKey) {
        const existing = await Booking.findOne({ user: user._id, idempotencyKey });
        if (existing) return { booking: existing, reused: true };
      }
      throw err;
    }
  }
  throw new AppError('Could not generate a booking reference. Please retry.', 500);
}

/** Refund percentage from the journey's cancellation policy based on hours left before departure. */
export function refundPercentFor(journey, now = new Date()) {
  const hours = (new Date(journey.departure).getTime() - now.getTime()) / 36e5;
  const tiers = [...journey.cancellationPolicy].sort((a, b) => b.hoursBefore - a.hoursBefore);
  const tier = tiers.find((t) => hours >= t.hoursBefore);
  return tier ? tier.refundPercent : 0;
}

/** Cancel a confirmed booking (passenger, operator disruption or admin). Moves refund to `pending` for admin processing. */
export async function cancelBooking(bookingId, { reason = 'Cancelled by passenger', fullRefund = false, now = new Date() } = {}) {
  const current = await Booking.findById(bookingId);
  if (!current) throw new AppError('Booking not found', 404);
  const journey = await Journey.findById(current.journey).select('departure cancellationPolicy');
  if (!fullRefund && journey.departure <= now) throw new AppError('This journey has already departed', 409);

  // atomic state transition: only one concurrent cancel can win
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, status: 'confirmed' },
    { $set: { status: 'cancelled', cancelledAt: now, cancelReason: reason }, $push: { history: { status: 'cancelled', note: reason } } },
    { new: true }
  );
  if (!booking) throw new AppError('Only confirmed bookings can be cancelled', 409);

  await releaseBookedSeats(booking.journey, booking._id);

  const percent = fullRefund ? 100 : refundPercentFor(journey, now);
  const payment = await Payment.findOne({ booking: booking._id });
  const paidValue = (payment?.amount || 0) + (booking.fare.credit || 0);
  const refundAmount = Math.floor((paidValue * percent) / 100);

  if (payment && payment.status === 'paid' && refundAmount > 0) {
    payment.refundStatus = 'pending';
    payment.refundAmount = refundAmount;
    payment.refundReason = reason;
    await payment.save();
    booking.paymentStatus = 'refund_pending';
    await booking.save();
  }

  if (booking.pointsAwarded > 0) {
    const u = await User.findById(booking.user).select('loyaltyPoints');
    if (u) await User.updateOne({ _id: u._id }, { $set: { loyaltyPoints: Math.max(0, u.loyaltyPoints - booking.pointsAwarded) } });
  }

  await notify(booking.user, {
    type: 'cancellation',
    title: `Booking ${booking.bookingRef} cancelled`,
    body: refundAmount > 0 ? `A refund of ₹${refundAmount} (${percent}%) is pending approval.` : 'No refund is applicable under the cancellation policy.',
    link: '/bookings',
    email: true,
  });
  emitToUser(String(booking.user), 'booking:update', { bookingId: booking._id, status: booking.status });
  return { booking, refundAmount, refundPercent: percent };
}

/** Called after a replacement booking is confirmed: retire the original booking and settle any difference. */
export async function finalizeReplacement(newBooking) {
  if (!newBooking.replacementFor) return null;
  const original = await Booking.findOneAndUpdate(
    { _id: newBooking.replacementFor, status: 'confirmed' },
    {
      $set: { status: 'replaced', rescueStatus: 'accepted', replacedBy: newBooking._id },
      $push: { history: { status: 'replaced', note: `Replaced by ${newBooking.bookingRef}` } },
    },
    { new: true }
  );
  if (!original) return null;
  await releaseBookedSeats(original.journey, original._id);

  // if the new journey is cheaper than what was already paid, the difference is refundable
  const diff = Math.max(0, (newBooking.fare.credit || 0) - newBooking.fare.seatTotal + (newBooking.fare.discount || 0));
  if (diff > 0) {
    const originalPayment = await Payment.findOne({ booking: original._id });
    if (originalPayment) {
      originalPayment.refundStatus = 'pending';
      originalPayment.refundAmount = diff;
      originalPayment.refundReason = 'Fare difference after journey replacement';
      await originalPayment.save();
      original.paymentStatus = 'refund_pending';
      await original.save();
    }
  }
  await notify(original.user, {
    type: 'rescue',
    title: 'Replacement journey confirmed',
    body: `Booking ${original.bookingRef} was replaced by ${newBooking.bookingRef}.`,
    link: `/booking/${newBooking._id}`,
  });
  return original;
}

export const isValidId = (id) => mongoose.isValidObjectId(id);
