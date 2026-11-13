import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
  {
    bookingRef: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    journey: { type: mongoose.Schema.Types.ObjectId, ref: 'Journey', required: true, index: true },
    operator: { type: mongoose.Schema.Types.ObjectId, ref: 'BusOperator', required: true, index: true },
    seats: [{ type: String, required: true }],
    passengers: [
      {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        age: { type: Number, required: true, min: 1, max: 120 },
        gender: { type: String, enum: ['male', 'female', 'other'], required: true },
        seatNumber: { type: String, required: true },
        _id: false,
      },
    ],
    contactPhone: { type: String, trim: true },
    boardingPoint: { type: mongoose.Schema.Types.ObjectId, ref: 'BoardingPoint' },
    droppingPoint: { type: mongoose.Schema.Types.ObjectId, ref: 'BoardingPoint' },
    fare: {
      seatTotal: { type: Number, required: true, min: 0 },
      discount: { type: Number, default: 0, min: 0 },
      credit: { type: Number, default: 0, min: 0 }, // credit carried over from a replaced booking
      amountDue: { type: Number, required: true, min: 0 },
      couponCode: String,
    },
    // booking lifecycle and payment lifecycle are stored separately
    status: {
      type: String,
      enum: ['pending_payment', 'confirmed', 'cancelled', 'expired', 'replaced', 'completed'],
      default: 'pending_payment',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refund_pending', 'refunded', 'failed'],
      default: 'unpaid',
    },
    // Journey Rescue: original booking stays `confirmed` until the passenger confirms a replacement or cancellation
    rescueStatus: { type: String, enum: ['none', 'offered', 'accepted', 'declined'], default: 'none' },
    rescueReason: String,
    replacementFor: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    idempotencyKey: { type: String },
    qrToken: { type: String, unique: true, sparse: true },
    checkedInAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    pointsAwarded: { type: Number, default: 0 },
    history: [{ status: String, note: String, at: { type: Date, default: Date.now }, _id: false }],
  },
  { timestamps: true }
);

// One idempotency key per user -> retries never create a second booking
bookingSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ journey: 1, status: 1 });

export default mongoose.model('Booking', bookingSchema);
