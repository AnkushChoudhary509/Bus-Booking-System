import mongoose from 'mongoose';

const boardingPointSchema = new mongoose.Schema(
  {
    route: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true, index: true },
    operator: { type: mongoose.Schema.Types.ObjectId, ref: 'BusOperator', required: true, index: true },
    kind: { type: String, enum: ['boarding', 'dropping'], required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    city: { type: String, required: true, trim: true },
    landmark: { type: String, trim: true, maxlength: 150 },
    instructions: { type: String, trim: true, maxlength: 300 },
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    // minutes after journey departure (boarding) or after departure (dropping)
    offsetMin: { type: Number, required: true, min: 0 },
    // inputs for the estimated convenience score
    nearTransit: { type: Boolean, default: false },
    hasWaitingArea: { type: Boolean, default: false },
    wellLit: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('BoardingPoint', boardingPointSchema);
