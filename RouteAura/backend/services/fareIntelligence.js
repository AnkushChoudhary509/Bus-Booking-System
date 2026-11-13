/**
 * Fare Intelligence: transparent weighted comparison of journeys.
 * All inputs are normalised to 0..1 (1 = best) within the compared set, then combined with configurable weights.
 * Reliability and (when no reviews exist) ratings come from SAMPLE data and are flagged as such.
 */
export const DEFAULT_WEIGHTS = { price: 0.3, duration: 0.2, departure: 0.1, amenities: 0.15, rating: 0.15, reliability: 0.1 };
export const COMFORT_WEIGHTS = { price: 0.05, duration: 0.15, departure: 0.05, amenities: 0.3, rating: 0.25, reliability: 0.2 };

const norm = (value, min, max, invert = false) => {
  if (max === min) return 0.5;
  const n = (value - min) / (max - min);
  return invert ? 1 - n : n;
};

export function normalizeWeights(w = {}, base = DEFAULT_WEIGHTS) {
  const merged = { ...base };
  for (const k of Object.keys(base)) {
    const v = Number(w[k]);
    if (Number.isFinite(v) && v >= 0) merged[k] = v;
  }
  const total = Object.values(merged).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, v / total]));
}

/** items: [{ id, fare, durationMin, departureHour, amenityCount, rating, ratingIsSample, onTimePercent }] */
export function scoreItems(items, weights, preferredHour = null) {
  if (!items.length) return [];
  const range = (key) => [Math.min(...items.map((i) => i[key])), Math.max(...items.map((i) => i[key]))];
  const [fMin, fMax] = range('fare');
  const [dMin, dMax] = range('durationMin');
  const [aMin, aMax] = range('amenityCount');

  return items.map((i) => {
    const parts = {
      price: norm(i.fare, fMin, fMax, true),
      duration: norm(i.durationMin, dMin, dMax, true),
      // closeness to the preferred hour if provided; otherwise neutral
      departure: preferredHour == null ? 0.5 : 1 - Math.min(Math.abs(i.departureHour - preferredHour), 12) / 12,
      amenities: norm(i.amenityCount, aMin, aMax),
      rating: Math.max(0, Math.min(1, (i.rating || 0) / 5)),
      reliability: Math.max(0, Math.min(1, (i.onTimePercent || 0) / 100)),
    };
    const total = Object.entries(weights).reduce((sum, [k, w]) => sum + parts[k] * w, 0);
    return { id: i.id, score: Math.round(total * 100), parts };
  });
}

/**
 * Computes score under default weights and assigns the 3 recommendation labels.
 *  - Budget Friendly: lowest fare
 *  - Best Overall Value: highest score under the (configurable) default weights
 *  - Comfort Priority: highest score under comfort-heavy weights
 */
export function labelJourneys(items, userWeights, preferredHour = null) {
  const weights = normalizeWeights(userWeights, DEFAULT_WEIGHTS);
  const comfortWeights = normalizeWeights({}, COMFORT_WEIGHTS);
  const value = scoreItems(items, weights, preferredHour);
  const comfort = scoreItems(items, comfortWeights, preferredHour);

  const labels = new Map(items.map((i) => [i.id, []]));
  if (items.length) {
    const cheapest = items.reduce((a, b) => (b.fare < a.fare ? b : a));
    labels.get(cheapest.id).push('Budget Friendly');
    const bestValue = value.reduce((a, b) => (b.score > a.score ? b : a));
    labels.get(bestValue.id).push('Best Overall Value');
    const bestComfort = comfort.reduce((a, b) => (b.score > a.score ? b : a));
    labels.get(bestComfort.id).push('Comfort Priority');
  }
  return {
    weights,
    comfortWeights,
    results: items.map((i, idx) => ({
      id: i.id,
      score: value[idx].score,
      comfortScore: comfort[idx].score,
      breakdown: value[idx].parts,
      labels: labels.get(i.id),
    })),
  };
}

export const FARE_DATA_NOTE =
  'Fares are set by operators. Ratings come from RouteAura reviews where available; reliability figures are sample data for this demo.';
