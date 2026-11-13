import { z } from 'zod';
import { BUS_TYPES, AMENITIES, LAYOUTS } from '../utils/seatLayout.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const city = z.string().trim().min(2).max(60);
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password needs a letter')
  .regex(/[0-9]/, 'Password needs a number');
const phone = z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, 'Invalid phone number');

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email(),
    password,
    phone: phone.optional(),
    role: z.enum(['passenger', 'operator']).default('passenger'),
    orgName: z.string().trim().min(2).max(100).optional(),
    licenseNo: z.string().trim().min(3).max(40).optional(),
  })
  .refine((v) => v.role !== 'operator' || (v.orgName && v.licenseNo), {
    message: 'Operators must provide an organisation name and licence number',
    path: ['orgName'],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required'),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: phone.optional(),
  gender: z.enum(['male', 'female', 'other', '']).optional(),
  savedPassengers: z
    .array(z.object({ name: z.string().trim().min(2).max(80), age: z.coerce.number().int().min(1).max(120), gender: z.enum(['male', 'female', 'other']) }))
    .max(10)
    .optional(),
});

export const passwordChangeSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

export const searchQuerySchema = z.object({
  source: city,
  destination: city,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  passengers: z.coerce.number().int().min(1).max(6).default(1),
  busType: z.enum(BUS_TYPES).optional(),
  departureAfter: z.coerce.number().int().min(0).max(23).optional(),
  departureBefore: z.coerce.number().int().min(1).max(24).optional(),
  maxFare: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  amenities: z.string().optional(), // comma separated
  sort: z.enum(['recommended', 'price', 'departure', 'duration', 'rating']).default('recommended'),
  preferredHour: z.coerce.number().int().min(0).max(23).optional(),
  weights: z.string().optional(), // JSON {price:..,duration:..}
});

export const compareSchema = z.object({
  journeyIds: z.array(objectId).min(2).max(4),
  weights: z.record(z.string(), z.coerce.number().min(0)).optional(),
  preferredHour: z.coerce.number().int().min(0).max(23).optional(),
});

export const seatPrefsSchema = z.object({
  window: z.boolean().optional(),
  aisle: z.boolean().optional(),
  position: z.enum(['front', 'rear', 'any']).optional(),
  legroom: z.boolean().optional(),
  lowVibration: z.boolean().optional(),
  nearEntrance: z.boolean().optional(),
  berth: z.enum(['lower', 'upper', 'any']).optional(),
  count: z.coerce.number().int().min(1).max(6).default(1),
});

export const lockSeatsSchema = z.object({ seats: z.array(z.string().min(1).max(6)).min(1).max(6) });

export const busSchema = z.object({
  name: z.string().trim().min(2).max(80),
  regNo: z.string().trim().min(5).max(14),
  type: z.enum(BUS_TYPES),
  layoutType: z.enum(Object.keys(LAYOUTS)),
  amenities: z.array(z.enum(AMENITIES)).default([]),
  operator: z.string().regex(/^[a-f\d]{24}$/i).optional(), // admins add a bus on behalf of an operator
});

const latLng = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });
export const routeSchema = z.object({
  source: city,
  destination: city,
  // optional: when left out the server estimates them from the road route (or straight-line distance)
  distanceKm: z.coerce.number().min(1).optional(),
  durationMin: z.coerce.number().min(10).optional(),
  stops: z.array(z.object({ name: z.string().trim().min(2).max(60), offsetMin: z.coerce.number().min(0) })).max(12).default([]),
  sourceCoords: latLng.optional(),
  destinationCoords: latLng.optional(),
});

export const boardingPointSchema = z.object({
  kind: z.enum(['boarding', 'dropping']),
  name: z.string().trim().min(2).max(100),
  city,
  landmark: z.string().trim().max(150).optional(),
  instructions: z.string().trim().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  offsetMin: z.coerce.number().min(0),
  nearTransit: z.boolean().optional(),
  hasWaitingArea: z.boolean().optional(),
  wellLit: z.boolean().optional(),
});

export const journeyCreateSchema = z.object({
  bus: objectId,
  route: objectId,
  departure: z.coerce.date(),
  arrival: z.coerce.date().optional(),
  baseFare: z.coerce.number().min(1),
  boardingPoints: z.array(objectId).default([]),
  droppingPoints: z.array(objectId).default([]),
  cancellationPolicy: z.array(z.object({ hoursBefore: z.number().min(0), refundPercent: z.number().min(0).max(100) })).optional(),
});

export const journeyStatusSchema = z.object({
  status: z.enum(['scheduled', 'boarding', 'running', 'delayed', 'completed', 'cancelled']),
  delayMin: z.coerce.number().int().min(1).max(1440).optional(),
  note: z.string().trim().max(200).optional(),
});

const passengerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  age: z.coerce.number().int().min(1).max(120),
  gender: z.enum(['male', 'female', 'other']),
});

export const bookingCreateSchema = z.object({
  journeyId: objectId,
  seats: z.array(z.string().min(1).max(6)).min(1).max(6),
  passengers: z.array(passengerSchema).min(1).max(6),
  boardingPointId: objectId.optional(),
  droppingPointId: objectId.optional(),
  couponCode: z.string().trim().max(20).optional(),
  contactPhone: phone.optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
});

export const cancelSchema = z.object({ reason: z.string().trim().max(200).optional() });

export const rescueConfirmSchema = z.object({
  action: z.enum(['replace', 'cancel']),
  journeyId: objectId.optional(),
  seats: z.array(z.string()).max(6).optional(),
  boardingPointId: objectId.optional(),
  droppingPointId: objectId.optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
});

export const createOrderSchema = z.object({ bookingId: objectId });
export const verifyPaymentSchema = z.object({
  bookingId: objectId,
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});
export const mockPaymentSchema = z.object({ bookingId: objectId, outcome: z.enum(['success', 'failure']).default('success') });

export const reviewSchema = z.object({ bookingId: objectId, rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() });

export const supportSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(5).max(1500),
  category: z.enum(['booking', 'payment', 'refund', 'journey', 'account', 'other']).default('other'),
  bookingId: objectId.optional(),
});
export const supportReplySchema = z.object({ message: z.string().trim().min(1).max(1500), status: z.enum(['open', 'in_progress', 'resolved']).optional() });

export const couponSchema = z.object({
  code: z.string().trim().min(3).max(20),
  description: z.string().max(150).optional(),
  discountType: z.enum(['percent', 'flat']),
  value: z.coerce.number().min(1),
  maxDiscount: z.coerce.number().min(0).optional(),
  minAmount: z.coerce.number().min(0).default(0),
  validTo: z.coerce.date(),
  usageLimit: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export const couponValidateSchema = z.object({ code: z.string().trim().min(1), amount: z.coerce.number().min(0) });

export const operatorDecisionSchema = z.object({ reason: z.string().trim().max(200).optional() });
export const refundDecisionSchema = z.object({ action: z.enum(['approve', 'reject']), note: z.string().trim().max(200).optional() });
export const simulationSchema = z.object({ action: z.enum(['start', 'advance', 'delay', 'reset']), value: z.coerce.number().optional() });
export const favoriteSchema = z.object({ source: city, destination: city });

export const gpsFixSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  accuracyM: z.coerce.number().min(0).max(100000).optional(),
  headingDeg: z.coerce.number().min(0).max(360).optional(),
  speedKmh: z.coerce.number().min(0).max(250).optional(),
  manual: z.boolean().optional(),
});
