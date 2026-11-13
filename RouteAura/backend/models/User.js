import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['passenger', 'operator', 'admin'], default: 'passenger', index: true },
    phone: { type: String, trim: true, match: [/^[0-9+\-\s]{7,15}$/, 'Invalid phone number'] },
    gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
    isActive: { type: Boolean, default: true },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    favoriteRoutes: [
      {
        source: { type: String, required: true },
        destination: { type: String, required: true },
      },
    ],
    savedPassengers: [
      {
        name: { type: String, required: true },
        age: { type: Number, min: 1, max: 120 },
        gender: { type: String, enum: ['male', 'female', 'other'] },
      },
    ],
    searchHistory: [
      {
        source: String,
        destination: String,
        date: String,
        searchedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, 10);

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    phone: this.phone,
    gender: this.gender,
    loyaltyPoints: this.loyaltyPoints,
    savedPassengers: this.savedPassengers,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('User', userSchema);
