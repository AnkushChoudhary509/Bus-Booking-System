import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { Booking, Payment, Journey } from '../models/index.js';
import { AppError, asyncHandler, ok } from '../utils/AppError.js';
import { config } from '../config/env.js';
import { createBooking, cancelBooking, refundPercentFor } from '../services/bookingService.js';
import { releaseUserLocks } from '../services/seatService.js';
import { getRescueOptions, confirmRescue } from '../services/rescueService.js';

const populateBooking = (q) =>
  q
    .populate({ path: 'journey', select: 'departure arrival status delayMin cancellationPolicy route bus operator', populate: [{ path: 'route', select: 'source destination distanceKm' }, { path: 'bus', select: 'name type regNo amenities' }] })
    .populate('operator', 'orgName')
    .populate('boardingPoint', 'name landmark city offsetMin instructions lat lng')
    .populate('droppingPoint', 'name landmark city offsetMin lat lng');

/** Owner, the journey's operator, or an admin may read a booking. */
function assertCanView(req, booking) {
  const isOwner = String(booking.user._id || booking.user) === String(req.user._id);
  const isOperator = req.operator && String(booking.operator._id || booking.operator) === String(req.operator._id);
  if (!isOwner && !isOperator && req.user.role !== 'admin') throw new AppError('Booking not found', 404);
}

const ticketUrl = (token) => `${config.clientUrls[0]}/verify/${token}`;

export const create = asyncHandler(async (req, res) => {
  const { journeyId, seats, passengers, boardingPointId, droppingPointId, couponCode, contactPhone, idempotencyKey } = req.body;
  const { booking, reused } = await createBooking({ user: req.user, journeyId, seats, passengers, boardingPointId, droppingPointId, couponCode, contactPhone, idempotencyKey });
  ok(res, { booking, reused }, reused ? 'Existing booking returned' : 'Booking created, awaiting payment', reused ? 200 : 201);
});

export const mine = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const bookings = await populateBooking(Booking.find(filter).sort({ createdAt: -1 }).limit(100)).lean();
  const payments = await Payment.find({ booking: { $in: bookings.map((b) => b._id) } }).select('booking status refundStatus refundAmount').lean();
  const payBy = new Map(payments.map((p) => [String(p.booking), p]));
  ok(res, { bookings: bookings.map((b) => ({ ...b, payment: payBy.get(String(b._id)) || null })) });
});

export const getOne = asyncHandler(async (req, res) => {
  const booking = await populateBooking(Booking.findById(req.params.id));
  if (!booking) throw new AppError('Booking not found', 404);
  assertCanView(req, booking);
  const payment = await Payment.findOne({ booking: booking._id }).select('status refundStatus refundAmount mode amount paidAt');
  const confirmed = ['confirmed', 'completed'].includes(booking.status);
  const qr = confirmed && booking.qrToken ? await QRCode.toDataURL(ticketUrl(booking.qrToken), { margin: 1, width: 240 }) : null;
  const refundPercent = booking.status === 'confirmed' ? refundPercentFor(booking.journey) : null;
  ok(res, { booking: booking.toObject(), payment, qr, refundPercentIfCancelledNow: refundPercent });
});

export const cancel = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
  if (!booking) throw new AppError('Booking not found', 404);

  if (booking.status === 'pending_payment') {
    // abandon an unpaid attempt and free the seats immediately
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'pending_payment' },
      { $set: { status: 'expired' }, $push: { history: { status: 'expired', note: 'Abandoned by passenger' } } },
      { new: true }
    );
    await releaseUserLocks(booking.journey, req.user._id);
    return ok(res, { booking: updated, refundAmount: 0, refundPercent: 0 }, 'Booking abandoned');
  }
  const result = await cancelBooking(booking._id, { reason: req.body.reason || 'Cancelled by passenger' });
  ok(res, result, 'Booking cancelled');
});

export const ticketPdf = asyncHandler(async (req, res) => {
  const booking = await populateBooking(Booking.findById(req.params.id)).populate('user', 'name');
  if (!booking) throw new AppError('Booking not found', 404);
  assertCanView(req, booking);
  if (!['confirmed', 'completed'].includes(booking.status)) throw new AppError('Ticket is available after payment is confirmed', 409);

  const j = booking.journey;
  const fmt = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const qrPng = await QRCode.toBuffer(ticketUrl(booking.qrToken), { margin: 1, width: 220 });

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="RouteAura-${booking.bookingRef}.pdf"`);
  doc.pipe(res);

  doc.rect(0, 0, doc.page.width, 90).fill('#0B1426');
  doc.fillColor('#14E0C3').fontSize(26).text('RouteAura', 48, 30);
  doc.fillColor('#F6F8FB').fontSize(10).text('E-TICKET', 48, 62);
  doc.fillColor('#0B1426');

  doc.fontSize(11).fillColor('#64748B').text('BOOKING ID', 48, 120);
  doc.fontSize(22).fillColor('#0B1426').text(booking.bookingRef, 48, 136);
  doc.image(qrPng, doc.page.width - 48 - 130, 112, { width: 130 });

  doc.fontSize(18).text(`${j.route.source}  →  ${j.route.destination}`, 48, 190);
  doc.fontSize(10).fillColor('#64748B');
  doc.text(`Departure: ${fmt(j.departure)}`, 48, 220);
  doc.text(`Arrival: ${fmt(j.arrival)}`, 48, 236);
  doc.text(`Operator: ${booking.operator.orgName}`, 48, 252);
  doc.text(`Bus: ${j.bus.name} (${j.bus.type}) · ${j.bus.regNo}`, 48, 268);
  doc.text(`Boarding: ${booking.boardingPoint?.name || '-'}${booking.boardingPoint?.landmark ? ' (' + booking.boardingPoint.landmark + ')' : ''}`, 48, 292);
  doc.text(`Dropping: ${booking.droppingPoint?.name || '-'}`, 48, 308);

  doc.fillColor('#0B1426').fontSize(12).text('Passengers', 48, 345);
  let y = 366;
  doc.fontSize(10);
  booking.passengers.forEach((p) => {
    doc.fillColor('#0B1426').text(`${p.name}  ·  ${p.age} yrs  ·  ${p.gender}`, 48, y);
    doc.fillColor('#14B8A6').text(`Seat ${p.seatNumber}`, 420, y, { width: 120, align: 'right' });
    y += 18;
  });
  y += 12;
  doc.fillColor('#64748B').text(`Amount paid: INR ${booking.fare.amountDue}   (Seat total ${booking.fare.seatTotal}, discount ${booking.fare.discount}, credit ${booking.fare.credit})`, 48, y);
  y += 30;
  doc.fontSize(9).text('Show this QR code at boarding. Carry a valid photo ID. Cancellation refunds follow the operator policy shown at booking time.', 48, y, { width: 500 });
  doc.end();
});

// -------- ticket verification --------

/** Public, minimal: confirms a QR token is genuine without exposing personal data. */
export const verifyTicket = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ qrToken: req.params.token })
    .populate({ path: 'journey', select: 'departure arrival status route', populate: { path: 'route', select: 'source destination' } })
    .populate('operator', 'orgName');
  if (!booking) return ok(res, { valid: false, reason: 'Ticket not found' });
  const valid = ['confirmed', 'completed'].includes(booking.status);
  ok(res, {
    valid,
    reason: valid ? undefined : `Booking is ${booking.status}`,
    bookingRef: booking.bookingRef,
    route: `${booking.journey.route.source} → ${booking.journey.route.destination}`,
    departure: booking.journey.departure,
    operator: booking.operator.orgName,
    seats: booking.seats,
    passengerInitials: booking.passengers.map((p) => `${p.name.trim()[0]}. ${p.name.trim().split(' ').slice(-1)[0]}`),
    checkedInAt: booking.checkedInAt,
    journeyStatus: booking.journey.status,
  });
});

/** Operator (own journeys) or admin marks a passenger as boarded. */
export const checkIn = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ qrToken: req.params.token });
  if (!booking || booking.status !== 'confirmed') throw new AppError('Valid ticket not found', 404);
  if (req.user.role !== 'admin' && String(booking.operator) !== String(req.operator?._id)) throw new AppError('This ticket belongs to another operator', 403);
  if (booking.checkedInAt) throw new AppError('Passenger already checked in', 409);
  booking.checkedInAt = new Date();
  await booking.save();
  ok(res, { bookingRef: booking.bookingRef, checkedInAt: booking.checkedInAt }, 'Passenger checked in');
});

// -------- Journey Rescue --------

export const rescueOptions = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
  if (!booking) throw new AppError('Booking not found', 404);
  ok(res, await getRescueOptions(booking));
});

export const rescueConfirm = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
  if (!booking) throw new AppError('Booking not found', 404);
  if (req.body.action === 'replace' && (!req.body.journeyId || !req.body.seats?.length)) throw new AppError('Choose a journey and seats', 400);
  const result = await confirmRescue(booking, req.user, req.body);
  ok(res, result, result.action === 'cancel' ? 'Booking cancelled with full refund' : result.needsPayment ? 'Replacement reserved, payment required' : 'Replacement confirmed');
});

export const journeyOf = (id) => Journey.findById(id);
