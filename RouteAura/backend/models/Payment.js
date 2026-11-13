import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    // exactly one payment record per booking: retries reuse it, so a booking can never be charged twice
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 }, // INR
    currency: { type: String, default: 'INR' },
    mode: { type: String, enum: ['mock', 'razorpay'], required: true },
    status: { type: String, enum: ['created', 'paid', 'failed', 'refunded'], default: 'created', index: true },
    providerOrderId: { type: String, index: true },
    providerPaymentId: { type: String, unique: true, sparse: true }, // a gateway payment can only ever be applied once
    paidAt: Date,
    failureReason: String,
    refundStatus: { type: String, enum: ['none', 'pending', 'processed', 'rejected'], default: 'none', index: true },
    refundAmount: { type: Number, default: 0, min: 0 },
    refundReason: String,
    refundedAt: Date,
    // NOTE: no card data is ever stored; Razorpay Checkout handles card entry on their side.
  },
  { timestamps: true }
);

export default mongoose.model('Payment', paymentSchema);
