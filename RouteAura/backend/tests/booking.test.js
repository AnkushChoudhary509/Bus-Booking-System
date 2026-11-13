import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, findOpenJourney, freeSeats, loginAs, pax, registerPassenger, startDb, stopDb } from './helpers.js';
import { Journey, Booking, Payment } from '../models/index.js';
import { releaseExpiredLocks } from '../services/seatService.js';

beforeAll(startDb);
afterAll(stopDb);

const lock = (jid, who, seats) => api().post(`/api/v1/journeys/${jid}/seats/lock`).set(who.auth).send({ seats });

describe('journey search', () => {
  it('finds seeded buses on a popular route', async () => {
    const date = new Date(Date.now() + 330 * 60000 + 2 * 86400000).toISOString().slice(0, 10);
    const r = await api().get('/api/v1/journeys/search').query({ source: 'Delhi', destination: 'Jaipur', date });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.journeys)).toBe(true);
  });
  it('validates input', async () => {
    expect((await api().get('/api/v1/journeys/search').query({ source: 'Delhi' })).status).toBe(400);
  });
});

describe('seat locking and double booking', () => {
  it('lets only one of two concurrent passengers lock the same seat', async () => {
    const j = await findOpenJourney();
    const [seat] = freeSeats(j, 1);
    const a = await registerPassenger('Racer A', 'racer.a@example.test');
    const b = await registerPassenger('Racer B', 'racer.b@example.test');
    const [ra, rb] = await Promise.all([lock(j._id, a, [seat]), lock(j._id, b, [seat])]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    const fresh = await Journey.findById(j._id);
    expect(fresh.seats.find((s) => s.number === seat).status).toBe('locked');
  });

  it('survives many simultaneous lock attempts on one seat (exactly one winner)', async () => {
    const j = await findOpenJourney();
    const seat = freeSeats(j, 1)[0];
    const users = await Promise.all(Array.from({ length: 8 }, (_, i) => registerPassenger(`Crowd ${i}`, `crowd${i}@example.test`)));
    const results = await Promise.all(users.map((u) => lock(j._id, u, [seat])));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('releases expired locks', async () => {
    const j = await findOpenJourney();
    const seat = freeSeats(j, 1)[0];
    const u = await registerPassenger('Slow Poke', 'slow@example.test');
    expect((await lock(j._id, u, [seat])).status).toBe(200);
    await Journey.updateOne({ _id: j._id, 'seats.number': seat }, { $set: { 'seats.$.lockExpiresAt': new Date(Date.now() - 1000) } });
    await releaseExpiredLocks();
    const fresh = await Journey.findById(j._id);
    expect(fresh.seats.find((s) => s.number === seat).status).toBe('available');
    const other = await registerPassenger('Quick Bird', 'quick@example.test');
    expect((await lock(j._id, other, [seat])).status).toBe(200);
  });

  it('refuses a booking for seats the user has not locked', async () => {
    const j = await findOpenJourney();
    const seat = freeSeats(j, 1)[0];
    const u = await registerPassenger('No Lock', 'nolock@example.test');
    const r = await api().post('/api/v1/bookings').set(u.auth).send({ journeyId: String(j._id), seats: [seat], passengers: pax(1) });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe('booking, payment, ticket and cancellation', () => {
  it('confirms only after payment, is idempotent, and issues a QR ticket', async () => {
    const j = await findOpenJourney();
    const seats = freeSeats(j, 2);
    const u = await registerPassenger('Pay Flow', 'payflow@example.test');
    expect((await lock(j._id, u, seats)).status).toBe(200);

    const key = 'idem-key-12345678';
    const body = { journeyId: String(j._id), seats, passengers: pax(2), idempotencyKey: key };
    const b1 = await api().post('/api/v1/bookings').set(u.auth).send(body);
    expect(b1.status).toBe(201);
    const b2 = await api().post('/api/v1/bookings').set(u.auth).send(body); // retry with same key
    expect(b2.body.data.booking._id).toBe(b1.body.data.booking._id);
    expect(await Booking.countDocuments({ user: u.user._id })).toBe(1);

    const id = b1.body.data.booking._id;
    expect(b1.body.data.booking.status).toBe('pending_payment');

    // a payment-less request must not confirm anything
    expect((await Booking.findById(id)).status).toBe('pending_payment');

    expect((await api().post('/api/v1/payments/create-order').set(u.auth).send({ bookingId: id })).status).toBe(200);
    const pays = await Promise.all([1, 2, 3].map(() => api().post('/api/v1/payments/mock').set(u.auth).send({ bookingId: id, outcome: 'success' })));
    expect(pays.every((p) => p.status === 200)).toBe(true); // retries are safe
    expect(await Payment.countDocuments({ booking: id })).toBe(1);

    const booking = await Booking.findById(id);
    expect(booking.status).toBe('confirmed');
    expect(booking.paymentStatus).toBe('paid');
    expect(booking.qrToken).toBeTruthy();
    const fresh = await Journey.findById(j._id);
    expect(seats.every((n) => fresh.seats.find((s) => s.number === n).status === 'booked')).toBe(true);

    const detail = await api().get(`/api/v1/bookings/${id}`).set(u.auth);
    expect(detail.body.data.qr).toMatch(/^data:image\/png/);
    const verify = await api().get(`/api/v1/tickets/verify/${booking.qrToken}`);
    expect(verify.body.data.valid).toBe(true);
    const pdf = await api().get(`/api/v1/bookings/${id}/ticket.pdf`).set(u.auth).buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(pdf.headers['content-type']).toMatch(/pdf/);
    expect(pdf.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('keeps seats bookable for nobody else once booked', async () => {
    const j = await findOpenJourney();
    const seat = freeSeats(j, 1)[0];
    const a = await registerPassenger('Owner', 'owner@example.test');
    expect((await lock(j._id, a, [seat])).status).toBe(200);
    const bk = await api().post('/api/v1/bookings').set(a.auth).send({ journeyId: String(j._id), seats: [seat], passengers: pax(1) });
    await api().post('/api/v1/payments/create-order').set(a.auth).send({ bookingId: bk.body.data.booking._id });
    await api().post('/api/v1/payments/mock').set(a.auth).send({ bookingId: bk.body.data.booking._id, outcome: 'success' });
    const late = await registerPassenger('Latecomer', 'late@example.test');
    expect((await lock(j._id, late, [seat])).status).toBeGreaterThanOrEqual(400);
  });

  it('a failed payment does not confirm the booking and can be retried', async () => {
    const j = await findOpenJourney();
    const seats = freeSeats(j, 1);
    const u = await registerPassenger('Retry Rider', 'retry@example.test');
    await lock(j._id, u, seats);
    const bk = await api().post('/api/v1/bookings').set(u.auth).send({ journeyId: String(j._id), seats, passengers: pax(1) });
    const id = bk.body.data.booking._id;
    await api().post('/api/v1/payments/create-order').set(u.auth).send({ bookingId: id });
    const fail = await api().post('/api/v1/payments/mock').set(u.auth).send({ bookingId: id, outcome: 'failure' });
    expect(fail.status).toBe(402);
    expect((await Booking.findById(id)).status).not.toBe('confirmed');
    await api().post('/api/v1/payments/create-order').set(u.auth).send({ bookingId: id });
    expect((await api().post('/api/v1/payments/mock').set(u.auth).send({ bookingId: id, outcome: 'success' })).status).toBe(200);
    expect((await Booking.findById(id)).status).toBe('confirmed');
  });

  it("does not let one passenger pay for or read another's booking", async () => {
    const j = await findOpenJourney();
    const seats = freeSeats(j, 1);
    const a = await registerPassenger('Private A', 'privatea@example.test');
    const b = await registerPassenger('Private B', 'privateb@example.test');
    await lock(j._id, a, seats);
    const bk = await api().post('/api/v1/bookings').set(a.auth).send({ journeyId: String(j._id), seats, passengers: pax(1) });
    const id = bk.body.data.booking._id;
    expect((await api().get(`/api/v1/bookings/${id}`).set(b.auth)).status).toBe(404);
    expect((await api().post('/api/v1/payments/create-order').set(b.auth).send({ bookingId: id })).status).toBe(404);
  });

  it('cancels a confirmed booking, frees the seats and records a refund', async () => {
    const j = await findOpenJourney();
    const seats = freeSeats(j, 1);
    const u = await registerPassenger('Canceller', 'cancel@example.test');
    await lock(j._id, u, seats);
    const bk = await api().post('/api/v1/bookings').set(u.auth).send({ journeyId: String(j._id), seats, passengers: pax(1) });
    const id = bk.body.data.booking._id;
    await api().post('/api/v1/payments/create-order').set(u.auth).send({ bookingId: id });
    await api().post('/api/v1/payments/mock').set(u.auth).send({ bookingId: id, outcome: 'success' });
    const c = await api().post(`/api/v1/bookings/${id}/cancel`).set(u.auth).send({ reason: 'Plans changed' });
    expect(c.status).toBe(200);
    expect(c.body.data.refundAmount).toBeGreaterThan(0);
    const fresh = await Journey.findById(j._id);
    expect(fresh.seats.find((s) => s.number === seats[0]).status).toBe('available');
    expect((await Booking.findById(id)).status).toBe('cancelled');
  });
});

describe('Journey Rescue', () => {
  it('flags bookings on cancellation, keeps them valid until the passenger decides, and refunds in full on request', async () => {
    const j = await findOpenJourney();
    const seats = freeSeats(j, 1);
    const u = await registerPassenger('Rescued', 'rescued@example.test');
    await lock(j._id, u, seats);
    const bk = await api().post('/api/v1/bookings').set(u.auth).send({ journeyId: String(j._id), seats, passengers: pax(1) });
    const id = bk.body.data.booking._id;
    await api().post('/api/v1/payments/create-order').set(u.auth).send({ bookingId: id });
    await api().post('/api/v1/payments/mock').set(u.auth).send({ bookingId: id, outcome: 'success' });

    const { BusOperator, User } = await import('../models/index.js');
    const op = await BusOperator.findById(j.operator);
    const opUser = await User.findById(op.user);
    const o = await loginAs(opUser.email);
    const st = await api().patch(`/api/v1/journeys/${j._id}/status`).set(o.auth).send({ status: 'delayed', delayMin: 120, note: 'Breakdown' });
    expect(st.status).toBe(200);

    const mid = await Booking.findById(id);
    expect(mid.status).toBe('confirmed'); // untouched until the passenger acts
    expect(mid.rescueStatus).toBe('offered');
    const opts = await api().get(`/api/v1/bookings/${id}/rescue-options`).set(u.auth);
    expect(opts.status).toBe(200);
    expect(Array.isArray(opts.body.data.options)).toBe(true);

    const decide = await api().post(`/api/v1/bookings/${id}/rescue/confirm`).set(u.auth).send({ action: 'cancel' });
    expect(decide.status).toBe(200);
    expect((await Booking.findById(id)).status).toBe('cancelled');
    const pay = await Payment.findOne({ booking: id });
    expect(pay.refundAmount).toBe(pay.amount);
  });
});
