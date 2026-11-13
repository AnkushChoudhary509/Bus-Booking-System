import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['booking', 'payment', 'cancellation', 'delay', 'rescue', 'refund', 'operator', 'support', 'system'],
      default: 'system',
    },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, maxlength: 400 },
    link: { type: String },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
