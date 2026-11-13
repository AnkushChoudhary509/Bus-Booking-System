import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 20 },
    description: { type: String, maxlength: 150 },
    discountType: { type: String, enum: ['percent', 'flat'], required: true },
    value: { type: Number, required: true, min: 1 },
    maxDiscount: { type: Number, min: 0 }, // cap for percent coupons
    minAmount: { type: Number, default: 0, min: 0 },
    validFrom: { type: Date, default: Date.now },
    validTo: { type: Date, required: true },
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.methods.discountFor = function (amount) {
  if (amount < this.minAmount) return 0;
  let d = this.discountType === 'percent' ? Math.floor((amount * this.value) / 100) : this.value;
  if (this.maxDiscount) d = Math.min(d, this.maxDiscount);
  return Math.min(d, amount);
};

couponSchema.methods.isUsable = function (now = new Date()) {
  return (
    this.isActive &&
    this.validFrom <= now &&
    this.validTo >= now &&
    (this.usageLimit === 0 || this.usedCount < this.usageLimit)
  );
};

export default mongoose.model('Coupon', couponSchema);
