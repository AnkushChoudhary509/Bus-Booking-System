import mongoose from 'mongoose';

/** Embedded Seat: dynamic per-journey state. Static attributes live in Bus.seatTemplate (no duplication). */
const seatSchema = new mongoose.Schema(
  {
    number: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['available', 'locked', 'booked'], default: 'available' },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lockExpiresAt: { type: Date, default: null },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  },
  { _id: false }
);

const journeySchema = new mongoose.Schema(
  {
    bus: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
    route: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
    operator: { type: mongoose.Schema.Types.ObjectId, ref: 'BusOperator', required: true, index: true },
    departure: { type: Date, required: true },
    arrival: { type: Date, required: true },
    baseFare: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['scheduled', 'boarding', 'running', 'delayed', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    delayMin: { type: Number, default: 0, min: 0 },
    statusNote: { type: String, maxlength: 200 },
    boardingPoints: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BoardingPoint' }],
    droppingPoints: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BoardingPoint' }],
    cancellationPolicy: {
      type: [{ hoursBefore: Number, refundPercent: Number }],
      default: [
        { hoursBefore: 24, refundPercent: 90 },
        { hoursBefore: 12, refundPercent: 70 },
        { hoursBefore: 4, refundPercent: 50 },
        { hoursBefore: 0, refundPercent: 0 },
      ],
    },
    // Reliability is SAMPLE data unless real history is supplied. `isSample` is shown in the UI.
    reliability: {
      onTimePercent: { type: Number, min: 0, max: 100, default: 85 },
      isSample: { type: Boolean, default: true },
    },
    seats: { type: [seatSchema], default: [] },
    // Simulated tracking (admin controlled).
    simulation: {
      active: { type: Boolean, default: false },
      progressPct: { type: Number, default: 0, min: 0, max: 100 },
      updatedAt: Date,
    },
    // Optional LIVE GPS from the driver's phone (driver mode). Takes precedence over the simulation while fresh.
    gps: {
      active: { type: Boolean, default: false },
      lat: Number,
      lng: Number,
      headingDeg: Number,
      speedKmh: Number,
      accuracyM: Number,
      progressPct: { type: Number, min: 0, max: 100 },
      offRouteKm: Number,
      verified: Boolean, // true once an on-route fix proved real progress
      onRoute: Boolean, // was the latest fix on the road line (and accurate enough)?
      updatedAt: Date,
      startedAt: Date,
    },
  },
  { timestamps: true }
);

journeySchema.index({ route: 1, departure: 1 });
journeySchema.index({ departure: 1, status: 1 });
journeySchema.index({ 'seats.status': 1, 'seats.lockExpiresAt': 1 });

journeySchema.pre('validate', function () {
  if (this.arrival && this.departure && this.arrival <= this.departure) {
    throw new Error('Arrival must be after departure');
  }
});

export default mongoose.model('Journey', journeySchema);
