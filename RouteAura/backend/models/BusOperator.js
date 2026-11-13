import mongoose from 'mongoose';

const operatorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    orgName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    licenseNo: { type: String, required: true, trim: true },
    contactPhone: { type: String, trim: true },
    description: { type: String, maxlength: 500 },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    rejectionReason: { type: String },
    reviewedAt: { type: Date },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('BusOperator', operatorSchema);
