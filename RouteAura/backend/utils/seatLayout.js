/**
 * Seat layout generator.
 * Every seat gets descriptive attributes used by the (transparent) recommendation engine.
 * NOTE: `vibrationEst` is an ESTIMATE derived from seat position (seats nearer the middle of the
 * bus are assumed to move less than seats over the rear axle). It is NOT measured data.
 */
export const LAYOUTS = {
  'seater-2x2': { label: 'Seater 2+2', defaultType: 'AC Seater', rows: 10, kind: 'seater' },
  'semi-sleeper-2x2': { label: 'Semi-Sleeper 2+2', defaultType: 'Semi-Sleeper', rows: 9, kind: 'seater' },
  'sleeper-2x1': { label: 'Sleeper 2+1 (two decks)', defaultType: 'AC Sleeper', rows: 6, kind: 'sleeper' },
};

export const BUS_TYPES = ['AC Seater', 'Non-AC Seater', 'Semi-Sleeper', 'AC Sleeper', 'Volvo Multi-Axle'];

export const AMENITIES = ['wifi', 'charging', 'water', 'blanket', 'reading-light', 'snacks', 'cctv', 'live-tracking'];

const round2 = (n) => Math.round(n * 100) / 100;

// vibration estimate: 0 (calmest) .. 1 (bumpiest), based on distance from bus centre along its length
const vibrationFor = (rowIdx, rows) => {
  const centre = (rows - 1) / 2;
  const dist = Math.abs(rowIdx - centre) / Math.max(centre, 1);
  return round2(0.2 + 0.7 * dist);
};

export function generateSeatTemplate(layoutType) {
  const layout = LAYOUTS[layoutType];
  if (!layout) throw new Error(`Unknown layout ${layoutType}`);
  const seats = [];

  if (layout.kind === 'seater') {
    const cols = ['A', 'B', 'C', 'D'];
    for (let r = 0; r < layout.rows; r++) {
      cols.forEach((letter, c) => {
        seats.push({
          number: `${r + 1}${letter}`,
          row: r,
          col: c < 2 ? c : c + 1, // grid column (index 2 is the aisle gap)
          deck: 'single',
          isWindow: letter === 'A' || letter === 'D',
          isAisle: letter === 'B' || letter === 'C',
          extraLegroom: r === 0 || r === 4, // first row + emergency-exit row
          nearEntrance: r <= 1,
          berth: 'none',
          vibrationEst: vibrationFor(r, layout.rows),
        });
      });
    }
  } else {
    ['lower', 'upper'].forEach((berth) => {
      const prefix = berth === 'lower' ? 'L' : 'U';
      let n = 1;
      for (let r = 0; r < layout.rows; r++) {
        [0, 1, 3].forEach((col) => {
          seats.push({
            number: `${prefix}${n++}`,
            row: r,
            col, // 0,1 = double side, 3 = single side (2 is the aisle)
            deck: berth,
            isWindow: col === 0 || col === 3,
            isAisle: col === 1 || col === 3,
            extraLegroom: r === 0 && berth === 'lower',
            nearEntrance: berth === 'lower' && r <= 1,
            berth,
            vibrationEst: round2(vibrationFor(r, layout.rows) + (berth === 'upper' ? 0.05 : 0)),
          });
        });
      }
    });
  }
  return seats;
}

/** Price a seat from the journey base fare. Simple, documented multipliers. */
export function seatPrice(baseFare, seat) {
  let mult = 1;
  if (seat.extraLegroom) mult += 0.1;
  if (seat.berth === 'lower') mult += 0.05;
  return Math.round(baseFare * mult);
}
