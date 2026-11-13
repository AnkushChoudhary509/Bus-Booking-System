/**
 * Comfort-based seat recommendation (transparent, rule-based).
 *
 * Each available seat earns points for every preference it satisfies. Weights are listed in SEAT_WEIGHTS and
 * returned with each recommendation, together with the human-readable reasons.
 *
 * IMPORTANT: these are ESTIMATES from seat position/attributes. RouteAura has no sensor data, so "low vibration"
 * is a position-based estimate (seats near the middle of the bus are assumed to be calmer), not a measurement.
 */
export const SEAT_WEIGHTS = {
  window: 3,
  aisle: 3,
  position: 2, // front / rear
  legroom: 2.5,
  lowVibration: 2,
  nearEntrance: 2,
  berth: 2.5,
};

export const RECOMMENDATION_DISCLAIMER =
  'Recommendations are estimates based on seat position and attributes. They are not measured comfort or vibration data.';

export function scoreSeat(seat, prefs, maxRow) {
  let score = 0;
  const reasons = [];
  const rowRatio = maxRow > 0 ? seat.row / maxRow : 0;

  if (prefs.window && seat.isWindow) { score += SEAT_WEIGHTS.window; reasons.push('Window seat'); }
  if (prefs.aisle && seat.isAisle) { score += SEAT_WEIGHTS.aisle; reasons.push('Aisle seat'); }
  if (prefs.position === 'front') {
    const p = (1 - rowRatio) * SEAT_WEIGHTS.position;
    score += p;
    if (rowRatio <= 0.34) reasons.push('Towards the front');
  }
  if (prefs.position === 'rear') {
    const p = rowRatio * SEAT_WEIGHTS.position;
    score += p;
    if (rowRatio >= 0.66) reasons.push('Towards the rear');
  }
  if (prefs.legroom && seat.extraLegroom) { score += SEAT_WEIGHTS.legroom; reasons.push('Extra legroom'); }
  if (prefs.lowVibration && typeof seat.vibrationEst === 'number') {
    score += (1 - seat.vibrationEst) * SEAT_WEIGHTS.lowVibration;
    if (seat.vibrationEst <= 0.4) reasons.push('Estimated calmer ride (mid-bus position)');
  }
  if (prefs.nearEntrance && seat.nearEntrance) { score += SEAT_WEIGHTS.nearEntrance; reasons.push('Close to the entrance'); }
  if (prefs.berth && prefs.berth !== 'any' && seat.berth === prefs.berth) {
    score += SEAT_WEIGHTS.berth;
    reasons.push(`${prefs.berth === 'lower' ? 'Lower' : 'Upper'} berth`);
  }
  return { score: Math.round(score * 100) / 100, reasons };
}

/** Returns the best `count` available seats for the given preferences. */
export function recommendSeats(seats, prefs, count = 1) {
  const free = seats.filter((s) => s.status === 'available');
  const maxRow = seats.reduce((m, s) => Math.max(m, s.row), 0);
  const scored = free
    .map((s) => ({ number: s.number, price: s.price, ...scoreSeat(s, prefs, maxRow) }))
    // stable tie-break: cheaper first, then seat number
    .sort((a, b) => b.score - a.score || a.price - b.price || a.number.localeCompare(b.number, undefined, { numeric: true }));
  const hasPrefs = Object.entries(prefs).some(([k, v]) => v && v !== 'any');
  return {
    recommended: hasPrefs ? scored.filter((s) => s.score > 0).slice(0, count) : [],
    weights: SEAT_WEIGHTS,
    disclaimer: RECOMMENDATION_DISCLAIMER,
    estimated: true,
  };
}
