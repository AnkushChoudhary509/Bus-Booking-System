import mongoose from 'mongoose';
import { Journey, Bus } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { config } from '../config/env.js';
import { emitToJourney } from '../sockets/index.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/** A seat is effectively free if available, or if its lock has expired. */
export const effectiveStatus = (seat, now = new Date()) =>
  seat.status === 'locked' && seat.lockExpiresAt && new Date(seat.lockExpiresAt) <= now ? 'available' : seat.status;

export const countAvailable = (journey, now = new Date()) =>
  journey.seats.filter((s) => effectiveStatus(s, now) === 'available').length;

const BOOKABLE = ['scheduled', 'boarding'];

/** Broadcast the public seat map state (no personal data) to everyone watching this journey. */
export async function broadcastSeats(journeyId) {
  const j = await Journey.findById(journeyId).select('seats').lean();
  if (!j) return;
  const now = new Date();
  emitToJourney(String(journeyId), 'seats:update', {
    journeyId: String(journeyId),
    seats: j.seats.map((s) => ({ number: s.number, status: effectiveStatus(s, now) })),
    availableSeats: j.seats.filter((s) => effectiveStatus(s, now) === 'available').length,
  });
}

/**
 * Atomically lock seats for a user.
 * Each seat is claimed with a single conditional updateOne (the filter and the write happen atomically in
 * MongoDB), so two users can never both lock the same seat. If any seat cannot be claimed, the seats claimed
 * in this call are rolled back and a 409 is returned.
 * Seats the user already holds are re-locked (lock expiry extended). Seats the user held that are not in the
 * new selection are released.
 */
export async function lockSeats(journeyId, userId, seatNumbers, { maxSeats = 6 } = {}) {
  const numbers = [...new Set(seatNumbers)];
  if (!numbers.length) throw new AppError('Select at least one seat', 400);
  if (numbers.length > maxSeats) throw new AppError(`You can select at most ${maxSeats} seats`, 400);

  const journey = await Journey.findById(journeyId).select('status seats.number departure');
  if (!journey) throw new AppError('Journey not found', 404);
  if (!BOOKABLE.includes(journey.status) || journey.departure <= new Date()) {
    throw new AppError('This journey is no longer open for booking', 409);
  }
  const known = new Set(journey.seats.map((s) => s.number));
  const unknown = numbers.filter((n) => !known.has(n));
  if (unknown.length) throw new AppError(`Unknown seat(s): ${unknown.join(', ')}`, 400);

  const uid = oid(userId);
  const jid = oid(journeyId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.seatLockMinutes * 60 * 1000);

  // release this user's other locks on the journey first
  await releaseUserLocks(jid, uid, numbers);

  const claimed = [];
  for (const n of numbers) {
    const res = await Journey.updateOne(
      {
        _id: jid,
        status: { $in: BOOKABLE },
        seats: {
          $elemMatch: {
            number: n,
            $or: [
              { status: 'available' },
              { status: 'locked', lockExpiresAt: { $lte: now } },
              { status: 'locked', lockedBy: uid },
            ],
          },
        },
      },
      {
        $set: {
          'seats.$[s].status': 'locked',
          'seats.$[s].lockedBy': uid,
          'seats.$[s].lockExpiresAt': expiresAt,
          'seats.$[s].booking': null,
        },
      },
      { arrayFilters: [{ 's.number': n }] }
    );
    if (res.modifiedCount === 1) {
      claimed.push(n);
    } else {
      // roll back what we claimed in this call and report the conflict
      if (claimed.length) await releaseUserLocks(jid, uid, [], claimed);
      await broadcastSeats(jid);
      throw new AppError(`Seat ${n} was just taken by someone else. Please choose another seat.`, 409);
    }
  }
  await broadcastSeats(jid);
  return { seats: claimed, lockExpiresAt: expiresAt };
}

/** Release locks held by `userId` on a journey. Optionally keep some seats or only release specific ones. */
export async function releaseUserLocks(journeyId, userId, keepNumbers = [], onlyNumbers = null) {
  const seatFilter = { 's.status': 'locked', 's.lockedBy': oid(userId) };
  const cond = { status: 'locked', lockedBy: oid(userId) };
  if (onlyNumbers) {
    seatFilter['s.number'] = { $in: onlyNumbers };
    cond.number = { $in: onlyNumbers };
  } else if (keepNumbers.length) {
    seatFilter['s.number'] = { $nin: keepNumbers };
    cond.number = { $nin: keepNumbers };
  }
  const res = await Journey.updateOne(
    { _id: oid(journeyId), seats: { $elemMatch: cond } },
    {
      $set: {
        'seats.$[s].status': 'available',
        'seats.$[s].lockedBy': null,
        'seats.$[s].lockExpiresAt': null,
      },
    },
    { arrayFilters: [seatFilter] }
  );
  if (res.modifiedCount) await broadcastSeats(journeyId);
  return res.modifiedCount;
}

/**
 * Sweeper: free every lock whose expiry has passed. Runs on an interval from server.js.
 * Returns the number of journeys touched.
 */
export async function releaseExpiredLocks(now = new Date()) {
  const filter = { seats: { $elemMatch: { status: 'locked', lockExpiresAt: { $lte: now } } } };
  const journeys = await Journey.find(filter).select('_id').lean();
  if (!journeys.length) return 0;
  await Journey.updateMany(filter, {
    $set: { 'seats.$[s].status': 'available', 'seats.$[s].lockedBy': null, 'seats.$[s].lockExpiresAt': null },
  }, { arrayFilters: [{ 's.status': 'locked', 's.lockExpiresAt': { $lte: now } }] });
  await Promise.all(journeys.map((j) => broadcastSeats(j._id)));
  return journeys.length;
}

/**
 * Atomically turn locked/available seats into booked seats for a booking. ALL seats or NONE:
 * a single conditional updateOne with one $elemMatch per seat inside $and.
 * `allowAvailable` lets a paid booking still win seats whose lock was swept but nobody else took.
 */
export async function confirmSeats(journeyId, userId, seatNumbers, bookingId) {
  const uid = oid(userId);
  const conditions = seatNumbers.map((n) => ({
    seats: {
      $elemMatch: {
        number: n,
        $or: [{ status: 'locked', lockedBy: uid }, { status: 'available' }],
      },
    },
  }));
  const res = await Journey.updateOne(
    { _id: oid(journeyId), $and: conditions },
    {
      $set: {
        'seats.$[s].status': 'booked',
        'seats.$[s].booking': oid(bookingId),
        'seats.$[s].lockedBy': null,
        'seats.$[s].lockExpiresAt': null,
      },
    },
    { arrayFilters: [{ 's.number': { $in: seatNumbers } }] }
  );
  const success = res.modifiedCount === 1;
  if (success) await broadcastSeats(journeyId);
  return success;
}

/** Free seats that belong to a booking (cancellation / replacement). */
export async function releaseBookedSeats(journeyId, bookingId) {
  const res = await Journey.updateOne(
    { _id: oid(journeyId), seats: { $elemMatch: { booking: oid(bookingId), status: 'booked' } } },
    { $set: { 'seats.$[s].status': 'available', 'seats.$[s].booking': null, 'seats.$[s].lockedBy': null, 'seats.$[s].lockExpiresAt': null } },
    { arrayFilters: [{ 's.booking': oid(bookingId) }] }
  );
  if (res.modifiedCount) await broadcastSeats(journeyId);
  return res.modifiedCount;
}

/** Merge Bus.seatTemplate attributes with the journey's dynamic seat state for the API/UI. */
export async function getSeatMap(journeyId, viewerId) {
  const journey = await Journey.findById(journeyId).lean();
  if (!journey) throw new AppError('Journey not found', 404);
  const bus = await Bus.findById(journey.bus).select('seatTemplate layoutType type').lean();
  const tmpl = new Map(bus.seatTemplate.map((s) => [s.number, s]));
  const now = new Date();
  const seats = journey.seats.map((s) => {
    const status = effectiveStatus(s, now);
    const mine = !!viewerId && s.lockedBy && String(s.lockedBy) === String(viewerId) && status === 'locked';
    return {
      ...tmpl.get(s.number),
      number: s.number,
      price: s.price,
      status,
      lockedByMe: mine,
      lockExpiresAt: mine ? s.lockExpiresAt : undefined,
    };
  });
  return {
    journeyId: journey._id,
    layoutType: bus.layoutType,
    busType: bus.type,
    availableSeats: seats.filter((s) => s.status === 'available').length,
    seats,
  };
}
