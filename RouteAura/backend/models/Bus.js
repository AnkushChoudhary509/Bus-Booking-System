import mongoose from 'mongoose';
import { BUS_TYPES, AMENITIES, LAYOUTS } from '../utils/seatLayout.js';

/** Seat template: static attributes of each seat on this bus (the "Seat" entity lives here + embedded in Journey). */
const seatTemplateSchema = new mongoose.Schema(
  {
    number: { type: String, required: true },
    row: { type: Number, required: true },
    col: { type: Number, required: true },
    deck: { type: String, enum: ['single', 'lower', 'upper'], default: 'single' },
    isWindow: Boolean,
    isAisle: Boolean,
    extraLegroom: Boolean,
    nearEntrance: Boolean,
    berth: { type: String, enum: ['none', 'lower', 'upper'], default: 'none' },
    vibrationEst: { type: Number, min: 0, max: 1 }, // ESTIMATED, not measured
  },
  { _id: false }
);

const busSchema = new mongoose.Schema(
  {
    operator: { type: mongoose.Schema.Types.ObjectId, ref: 'BusOperator', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    regNo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/, 'Registration like PB08AB1234'],
    },
    type: { type: String, enum: BUS_TYPES, required: true },
    layoutType: { type: String, enum: Object.keys(LAYOUTS), required: true },
    amenities: [{ type: String, enum: AMENITIES }],
    seatTemplate: { type: [seatTemplateSchema], default: [] },
    totalSeats: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Bus', busSchema);
