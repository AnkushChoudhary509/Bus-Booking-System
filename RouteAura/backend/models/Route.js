import mongoose from 'mongoose';

const routeSchema = new mongoose.Schema(
  {
    source: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    distanceKm: { type: Number, required: true, min: 1 },
    durationMin: { type: Number, required: true, min: 10 },
    // intermediate stops used by Journey Health (offsetMin = minutes after departure, estimated)
    stops: [
      {
        name: { type: String, required: true },
        offsetMin: { type: Number, required: true, min: 0 },
        lat: Number,
        lng: Number,
      },
    ],
    sourceCoords: { lat: Number, lng: Number },
    destinationCoords: { lat: Number, lng: Number },
    // Road geometry cached from OpenStreetMap routing (OSRM): [[lat, lng], ...]. Loaded on demand, see roadRouteService.
    geometry: { type: [[Number]], select: false, default: undefined },
    geometrySource: { type: String, enum: ['osrm'], select: false },
    roadDistanceKm: { type: Number, select: false },
    roadDurationMin: { type: Number, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

routeSchema.pre('validate', function () {
  if (this.source && this.destination && this.source.toLowerCase() === this.destination.toLowerCase()) {
    throw new Error('Source and destination must differ');
  }
});

routeSchema.index({ source: 1, destination: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default mongoose.model('Route', routeSchema);
