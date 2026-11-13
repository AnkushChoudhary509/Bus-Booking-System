import { Booking, Journey, Payment } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { istDayRange } from '../utils/geo.js';
import { countAvailable, lockSeats } from './seatService.js';
import { cancelBooking, createBooking } from './bookingService.js';
import { settleZeroAmount } from './paymentService.js';
import { notify } from './notificationService.js';

const BOOKABLE = ['scheduled', 'boarding'];

/** Value the passenger already paid for the original booking (what can be carried over). */
export const paidValue = (booking) => booking.fare.seatTotal - booking.fare.discount;

function assertRescuable(booking) {
  if (booking.status !== 'confirmed') throw new AppError('Only confirmed bookings can be rescued', 409);
  if (booking.rescueStatus !== 'offered') throw new AppError('No rescue offer is active for this booking', 409);
}

/** Alternatives: same route, same day (IST), still bookable, with enough seats. Nothing is changed here. */
export async function getRescueOptions(booking) {
  assertRescuable(booking);
  const original = await Journey.findById(booking.journey).populate('route', 'source destination');
  const day = istDayRange(new Date(original.departure.getTime() + 330 * 60000).toISOString().slice(0, 10));
  const now = new Date();
  const candidates = await Journey.find({
    route: original.route._id,
    _id: { $ne: original._id },
    status: { $in: BOOKABLE },
    departure: { $gt: now, $gte: day.start, $lt: day.end },
  })
    .populate('bus', 'name type amenities')
    .populate('operator', 'orgName ratingAvg ratingCount')
    .sort({ departure: 1 });

  const needed = booking.seats.length;
  const paid = paidValue(booking);
  const options = candidates
    .map((j) => {
      const available = countAvailable(j, now);
      const cheapest = j.seats.filter((s) => s.status === 'available').map((s) => s.price).sort((a, b) => a - b).slice(0, needed);
      const estimatedTotal = cheapest.reduce((a, b) => a + b, 0);
      return {
        journeyId: j._id,
        operator: j.operator?.orgName,
        bus: j.bus,
        departure: j.departure,
        arrival: j.arrival,
        baseFare: j.baseFare,
        availableSeats: available,
        estimatedTotal,
        extraFare: Math.max(0, estimatedTotal - paid),
        refundDifference: Math.max(0, paid - estimatedTotal),
      };
    })
    .filter((o) => o.availableSeats >= needed);

  return { original: { journeyId: original._id, route: original.route, status: original.status, delayMin: original.delayMin }, paidValue: paid, options };
}

/**
 * Passenger decision. Nothing is transferred or charged without this explicit call.
 *  - action "cancel":  cancel the original with a FULL refund
 *  - action "replace": book seats on an alternative journey; extra fare (if any) is paid through the normal payment
 *                      flow. The original booking stays confirmed until the replacement is confirmed.
 */
export async function confirmRescue(booking, user, { action, journeyId, seats, boardingPointId, droppingPointId, idempotencyKey }) {
  assertRescuable(booking);

  if (action === 'cancel') {
    const result = await cancelBooking(booking._id, { reason: booking.rescueReason || 'Journey disruption', fullRefund: true });
    await Booking.updateOne({ _id: booking._id }, { $set: { rescueStatus: 'declined' } });
    return { action, ...result };
  }

  // replace
  const target = await Journey.findById(journeyId).select('route status departure boardingPoints droppingPoints');
  const original = await Journey.findById(booking.journey).select('route');
  if (!target || String(target.route) !== String(original.route)) throw new AppError('Alternative must be on the same route', 400);
  if (!BOOKABLE.includes(target.status) || target.departure <= new Date()) throw new AppError('That journey is no longer available', 409);
  if (!seats?.length || seats.length !== booking.seats.length) throw new AppError(`Select ${booking.seats.length} seat(s)`, 400);

  await lockSeats(journeyId, user._id, seats);

  const { booking: replacement, reused } = await createBooking({
    user,
    journeyId,
    seats,
    passengers: booking.passengers.map((p) => ({ name: p.name, age: p.age, gender: p.gender })),
    boardingPointId: boardingPointId || (target.boardingPoints[0] && String(target.boardingPoints[0])),
    droppingPointId: droppingPointId || (target.droppingPoints[0] && String(target.droppingPoints[0])),
    contactPhone: booking.contactPhone,
    credit: paidValue(booking),
    replacementFor: booking._id,
    idempotencyKey: idempotencyKey || `rescue-${booking._id}-${journeyId}`,
  });

  if (replacement.fare.amountDue === 0 && replacement.status === 'pending_payment') {
    const settled = await settleZeroAmount(replacement);
    return { action, booking: settled.booking, needsPayment: false };
  }
  if (replacement.status === 'confirmed') return { action, booking: replacement, needsPayment: false, reused };

  await notify(user._id, {
    type: 'rescue',
    title: 'Replacement journey reserved',
    body: `Pay ₹${replacement.fare.amountDue} to confirm. Your original booking stays valid until then.`,
    link: `/booking/${replacement._id}/pay`,
  });
  return { action, booking: replacement, needsPayment: true, reused };
}

export const originalPayment = (bookingId) => Payment.findOne({ booking: bookingId });
