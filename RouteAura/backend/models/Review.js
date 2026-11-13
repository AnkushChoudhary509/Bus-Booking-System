import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    journey: { type: mongoose.Schema.Types.ObjectId, ref: 'Journey', required: true, index: true },
    operator: { type: mongoose.Schema.Types.ObjectId, ref: 'BusOperator', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

export default mongoose.model('Review', reviewSchema);
