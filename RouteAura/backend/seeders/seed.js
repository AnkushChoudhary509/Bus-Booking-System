import path from 'path';
import { fileURLToPath } from 'url';
/**
 * RouteAura demo seeder.   Usage:  npm run seed            (wipes and re-creates demo data)
 *
 * DEVELOPMENT ONLY. Refuses to run when NODE_ENV=production unless SEED_ALLOW_PRODUCTION=true,
 * because it deletes every collection and creates accounts with publicly documented passwords.
 *
 * Demo accounts (password for all: Demo@12345):
 *   admin@routeaura.test, operator@routeaura.test (approved), pending.operator@routeaura.test (awaiting approval),
 *   passenger@routeaura.test, plus a few more passengers.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { User, BusOperator, Bus, Route, BoardingPoint, Journey, Booking, Payment, Review, Coupon, Notification, SupportTicket } from '../models/index.js';
import { generateSeatTemplate, seatPrice } from '../utils/seatLayout.js';
import { generateBookingRef, generateQrToken } from '../utils/bookingRef.js';
import { haversineKm } from '../utils/geo.js';
import { CITIES, BASE_ROUTES, OPERATORS, PASSENGERS, BUS_PROFILES, BUS_NAME_PARTS, COUPONS, REVIEW_COMMENTS } from './data.js';

export const DEMO_PASSWORD = 'Demo@12345';
const DAYS_AHEAD = 7;

// deterministic pseudo-random so every seed run produces the same demo data
let seedState = 20261110;
const rnd = () => { seedState = (seedState * 1664525 + 1013904223) % 4294967296; return seedState / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pad = (n) => String(n).padStart(2, '0');

const istMidnight = (offsetDays) => {
  const nowIst = new Date(Date.now() + 330 * 60000);
  const d = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate() + offsetDays));
  return new Date(d.getTime() - 330 * 60000); // back to the real instant of IST midnight
};

export async function seed({ log = console.log } = {}) {
  log('Clearing existing data…');
  await Promise.all([User, BusOperator, Bus, Route, BoardingPoint, Journey, Booking, Payment, Review, Coupon, Notification, SupportTicket].map((m) => m.deleteMany({})));

  const passwordHash = await User.hashPassword(DEMO_PASSWORD);

  // ---------- users ----------
  const admin = await User.create({ name: 'Admin Aura', email: 'admin@routeaura.test', role: 'admin', passwordHash, phone: '9876500000' });
  const passengers = await User.insertMany(PASSENGERS.map((p) => ({ ...p, role: 'passenger', passwordHash })));
  passengers[0].favoriteRoutes.push({ source: 'Jalandhar', destination: 'Delhi' }, { source: 'Delhi', destination: 'Jaipur' });
  await passengers[0].save();

  // ---------- operators ----------
  const operators = {};
  for (const o of OPERATORS) {
    const u = await User.create({ name: o.name, email: o.email, role: 'operator', passwordHash, phone: '98765' + String(10000 + Math.floor(rnd() * 89999)) });
    operators[o.key] = {
      def: o,
      doc: await BusOperator.create({ user: u._id, orgName: o.org, licenseNo: o.license, approvalStatus: o.approved ? 'approved' : 'pending', reviewedAt: o.approved ? new Date() : undefined, description: 'Demo operator (fictional)' }),
    };
  }

  // ---------- buses ----------
  const buses = {}; // operator key -> Bus[]
  let regCounter = 1000;
  const stateCodes = { himalayan: 'JK02', rajputana: 'RJ14', westcoast: 'MH12', southern: 'KA01', eastern: 'WB02' };
  for (const { def, doc } of Object.values(operators)) {
    buses[def.key] = [];
    for (let i = 0; i < def.buses; i++) {
      const profile = BUS_PROFILES[(i + def.key.length) % BUS_PROFILES.length];
      const template = generateSeatTemplate(profile.layout);
      const bus = await Bus.create({
        operator: doc._id,
        name: `${def.org.split(' ')[0]} ${BUS_NAME_PARTS[(i * 3 + def.key.length) % BUS_NAME_PARTS.length]}`,
        regNo: `${stateCodes[def.key]}AB${regCounter++}`,
        type: profile.type,
        layoutType: profile.layout,
        amenities: profile.amenities,
        seatTemplate: template,
        totalSeats: template.length,
      });
      buses[def.key].push({ doc: bus, profile });
    }
  }

  // ---------- routes + boarding points ----------
  const routeDocs = [];
  const allRoutes = BASE_ROUTES.flatMap((r) => [
    { ...r, source: r.a, destination: r.b, stops: r.stops },
    { ...r, source: r.b, destination: r.a, stops: [...r.stops].reverse().map(([n, p]) => [n, 100 - p]) },
  ]);
  for (const r of allRoutes) {
    const route = await Route.create({
      source: r.source,
      destination: r.destination,
      distanceKm: r.km,
      durationMin: r.min,
      sourceCoords: { lat: CITIES[r.source].lat, lng: CITIES[r.source].lng },
      destinationCoords: { lat: CITIES[r.destination].lat, lng: CITIES[r.destination].lng },
      stops: r.stops.map(([name, pct]) => ({ name, offsetMin: Math.round((r.min * pct) / 100) })),
    });
    routeDocs.push({ route, def: r });
  }

  const pointsByRouteOp = new Map(); // `${route}:${op}` -> {boarding:[], dropping:[]}
  for (const { route, def } of routeDocs) {
    for (const opKey of def.ops) {
      const op = operators[opKey].doc;
      const src = CITIES[def.source];
      const dst = CITIES[def.destination];
      const boarding = [];
      const dropping = [];
      for (const [idx, [name, landmark]] of src.points.entries()) {
        boarding.push(await BoardingPoint.create({
          route: route._id, operator: op._id, kind: 'boarding', name, city: def.source, landmark,
          instructions: 'Arrive 15 minutes early and keep your e-ticket handy.',
          lat: src.lat + (idx - 1) * 0.02, lng: src.lng + (idx - 1) * 0.015,
          offsetMin: idx * 15, nearTransit: idx !== 2, hasWaitingArea: idx === 0, wellLit: true,
        }));
      }
      for (const [idx, [name, landmark]] of dst.points.entries()) {
        dropping.push(await BoardingPoint.create({
          route: route._id, operator: op._id, kind: 'dropping', name, city: def.destination, landmark,
          lat: dst.lat + (idx - 1) * 0.02, lng: dst.lng + (idx - 1) * 0.015,
          offsetMin: def.min + idx * 12, nearTransit: idx !== 1, hasWaitingArea: idx === 0, wellLit: true,
        }));
      }
      pointsByRouteOp.set(`${route._id}:${opKey}`, { boarding, dropping });
    }
  }

  // ---------- journeys ----------
  const slots = [[6, 15], [9, 40], [14, 0], [19, 30], [22, 15]];
  const journeys = [];
  let busCursor = {};
  for (const { route, def } of routeDocs) {
    for (let day = 0; day < DAYS_AHEAD; day++) {
      // 2 departures per route per day, from different operators/slots
      for (let k = 0; k < 2; k++) {
        const opKey = def.ops[k % def.ops.length];
        const pool = buses[opKey];
        busCursor[opKey] = (busCursor[opKey] || 0) + 1;
        const { doc: bus, profile } = pool[(busCursor[opKey] * 3 + day) % pool.length];
        const [h, m] = slots[(day + k * 2 + route.distanceKm) % slots.length];
        const departure = new Date(istMidnight(day).getTime() + (h * 60 + m) * 60000);
        if (departure <= new Date(Date.now() + 30 * 60000)) continue; // only future journeys
        const arrival = new Date(departure.getTime() + route.durationMin * 60000);
        const baseFare = Math.max(150, Math.round((route.distanceKm * profile.rate) / 10) * 10);

        // a bus can't be double-booked in time
        const clash = journeys.some((j) => String(j.bus) === String(bus._id) && j.departure < arrival && j.arrival > departure);
        if (clash) continue;

        const pts = pointsByRouteOp.get(`${route._id}:${opKey}`);
        const seats = bus.seatTemplate.map((s) => ({ number: s.number, price: seatPrice(baseFare, s), status: 'available' }));
        const j = await Journey.create({
          bus: bus._id, route: route._id, operator: bus.operator, departure, arrival, baseFare,
          boardingPoints: pts.boarding.map((p) => p._id), droppingPoints: pts.dropping.map((p) => p._id),
          reliability: { onTimePercent: 72 + Math.floor(rnd() * 25), isSample: true },
          seats,
        });
        journeys.push(j);
      }
    }
  }

  // ---------- coupons ----------
  const inThreeMonths = new Date(Date.now() + 90 * 24 * 3600 * 1000);
  await Coupon.insertMany(COUPONS.map((c) => ({ ...c, validTo: inThreeMonths })));

  // ---------- historical (completed) journeys + bookings + reviews, so Passport and revenue have real data ----------
  const completedBookings = [];
  const pastRoutes = routeDocs.slice(0, 10);
  for (let i = 0; i < pastRoutes.length; i++) {
    const { route, def } = pastRoutes[i];
    const opKey = def.ops[0];
    const bus = buses[opKey][0].doc;
    const baseFare = Math.max(150, Math.round((route.distanceKm * buses[opKey][0].profile.rate) / 10) * 10);
    const departure = new Date(istMidnight(-(3 + i * 2)).getTime() + (9 + (i % 4) * 3) * 3600000);
    const arrival = new Date(departure.getTime() + route.durationMin * 60000);
    const pts = pointsByRouteOp.get(`${route._id}:${opKey}`);
    const seats = bus.seatTemplate.map((s) => ({ number: s.number, price: seatPrice(baseFare, s), status: 'available' }));
    const pj = await Journey.create({
      bus: bus._id, route: route._id, operator: bus.operator, departure, arrival, baseFare, status: 'completed',
      boardingPoints: pts.boarding.map((p) => p._id), droppingPoints: pts.dropping.map((p) => p._id),
      reliability: { onTimePercent: 85, isSample: true }, seats, simulation: { active: false, progressPct: 100 },
    });
    // two bookings per past journey
    for (let b = 0; b < 2; b++) {
      const user = passengers[(i + b) % passengers.length];
      const seatNos = [seats[b * 2].number, seats[b * 2 + 1].number];
      const seatTotal = seatNos.reduce((s, n) => s + seats.find((x) => x.number === n).price, 0);
      const booking = await Booking.create({
        bookingRef: generateBookingRef(), user: user._id, journey: pj._id, operator: bus.operator, seats: seatNos,
        passengers: seatNos.map((n, idx) => ({ name: idx === 0 ? user.name : 'Co-traveller', age: 28 + idx, gender: idx === 0 ? 'male' : 'female', seatNumber: n })),
        contactPhone: user.phone, boardingPoint: pts.boarding[0]._id, droppingPoint: pts.dropping[0]._id,
        fare: { seatTotal, discount: 0, credit: 0, amountDue: seatTotal },
        status: 'completed', paymentStatus: 'paid', qrToken: generateQrToken(), pointsAwarded: Math.floor(seatTotal / 10),
        history: [{ status: 'confirmed', note: 'Seed data' }, { status: 'completed', note: 'Journey completed' }],
        createdAt: new Date(departure.getTime() - 3 * 24 * 3600 * 1000),
      });
      await Payment.create({ booking: booking._id, user: user._id, amount: seatTotal, mode: 'mock', status: 'paid', providerOrderId: `seed_order_${i}_${b}`, providerPaymentId: `seed_pay_${i}_${b}`, paidAt: booking.createdAt });
      await Journey.updateOne({ _id: pj._id }, { $set: Object.fromEntries(seatNos.map((n) => [`seats.${seats.findIndex((x) => x.number === n)}.status`, 'booked'])) });
      await User.updateOne({ _id: user._id }, { $inc: { loyaltyPoints: booking.pointsAwarded } });
      completedBookings.push({ booking, journey: pj, user });
    }
  }
  const reviewTargets = completedBookings.slice(0, 12);
  for (const { booking, journey, user } of reviewTargets) {
    await Review.create({ user: user._id, booking: booking._id, journey: journey._id, operator: journey.operator, rating: 3 + Math.floor(rnd() * 3), comment: pick(REVIEW_COMMENTS) });
  }
  for (const { doc } of Object.values(operators)) {
    const [agg] = await Review.aggregate([{ $match: { operator: doc._id } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
    if (agg) await BusOperator.updateOne({ _id: doc._id }, { $set: { ratingAvg: Math.round(agg.avg * 10) / 10, ratingCount: agg.n } });
  }

  // ---------- a few upcoming confirmed bookings for the demo passenger ----------
  const demoUser = passengers[0];
  const upcomingPick = journeys.filter((j) => j.departure > new Date(Date.now() + 26 * 3600 * 1000)).slice(0, 3);
  for (const [i, j] of upcomingPick.entries()) {
    const fresh = await Journey.findById(j._id);
    const nums = [fresh.seats[10 + i * 4].number];
    const seatTotal = fresh.seats.find((s) => s.number === nums[0]).price;
    const booking = await Booking.create({
      bookingRef: generateBookingRef(), user: demoUser._id, journey: j._id, operator: j.operator, seats: nums,
      passengers: [{ name: demoUser.name, age: 26, gender: 'male', seatNumber: nums[0] }], contactPhone: demoUser.phone,
      boardingPoint: j.boardingPoints[0], droppingPoint: j.droppingPoints[0],
      fare: { seatTotal, discount: 0, credit: 0, amountDue: seatTotal }, status: 'confirmed', paymentStatus: 'paid',
      qrToken: generateQrToken(), pointsAwarded: Math.floor(seatTotal / 10), history: [{ status: 'confirmed', note: 'Seed data' }],
    });
    await Payment.create({ booking: booking._id, user: demoUser._id, amount: seatTotal, mode: 'mock', status: 'paid', providerOrderId: `seed_up_${i}`, providerPaymentId: `seed_uppay_${i}`, paidAt: new Date() });
    await Journey.updateOne({ _id: j._id, 'seats.number': nums[0] }, { $set: { 'seats.$.status': 'booked', 'seats.$.booking': booking._id } });
    await User.updateOne({ _id: demoUser._id }, { $inc: { loyaltyPoints: booking.pointsAwarded } });
  }

  // ---------- notifications + support ticket ----------
  await Notification.insertMany([
    { user: demoUser._id, type: 'system', title: 'Welcome to RouteAura', body: 'Your demo account is ready. Explore seat recommendations and the Travel Passport.', link: '/dashboard' },
    { user: admin._id, type: 'operator', title: 'New operator application', body: 'NewLeaf Tours is awaiting approval.', link: '/admin' },
  ]);
  await SupportTicket.create({ user: demoUser._id, category: 'other', subject: 'Can I change my boarding point?', message: 'I would like to board at a different point on my upcoming trip. Is that possible?' });

  const summary = {
    users: await User.countDocuments(),
    operators: await BusOperator.countDocuments(),
    buses: await Bus.countDocuments(),
    routes: await Route.countDocuments(),
    boardingPoints: await BoardingPoint.countDocuments(),
    journeys: await Journey.countDocuments(),
    bookings: await Booking.countDocuments(),
    coupons: await Coupon.countDocuments(),
    cities: Object.keys(CITIES).length,
    avgRouteKm: Math.round(routeDocs.reduce((s, r) => s + r.route.distanceKm, 0) / routeDocs.length),
    sampleHaversineDelhiJaipur: haversineKm(CITIES.Delhi.lat, CITIES.Delhi.lng, CITIES.Jaipur.lat, CITIES.Jaipur.lng),
  };
  log('Seed complete:', JSON.stringify(summary));
  return summary;
}

// run directly: node seeders/seed.js
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    console.error('Refusing to seed a production database (it wipes all data and creates demo accounts). Set SEED_ALLOW_PRODUCTION=true to override.');
    process.exit(1);
  }
  connectDB()
    .then(() => seed())
    .then(() => {
      console.log(`\nDemo logins (DEVELOPMENT ONLY — password for all: ${DEMO_PASSWORD})\n  admin:      admin@routeaura.test\n  operator:   operator@routeaura.test\n  passenger:  passenger@routeaura.test\n  pending operator (to demo approval): pending.operator@routeaura.test`);
      return mongoose.disconnect();
    })
    .catch(async (e) => { console.error('Seed failed:', e); await mongoose.disconnect(); process.exit(1); });
}
