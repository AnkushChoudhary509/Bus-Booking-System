import { cx } from './ui';

const seatState = (s, selected, rec) => {
  if (selected.has(s.number)) return 'selected';
  if (s.status === 'booked') return 'booked';
  if (s.status === 'locked' && !s.lockedByMe) return 'locked';
  if (rec?.has(s.number)) return 'recommended';
  return 'available';
};

const STYLE = {
  available: 'bg-white ring-2 ring-teal-dark/60 text-midnight hover:bg-teal-aura/15 cursor-pointer',
  selected: 'bg-teal-aura ring-2 ring-teal-dark text-midnight font-bold cursor-pointer',
  booked: 'bg-slate-300 text-slate-500 cursor-not-allowed',
  locked: 'bg-amber-aura/20 ring-2 ring-amber-aura/60 seat-hatch text-[#7a4f00] cursor-not-allowed',
  recommended: 'bg-white ring-2 ring-teal-aura shadow-[0_0_0_4px_rgba(20,224,195,.35)] text-midnight cursor-pointer',
};

function Seat({ s, selected, rec, onToggle, sleeper }) {
  const st = seatState(s, selected, rec);
  const disabled = st === 'booked' || st === 'locked';
  return (
    <button type="button" disabled={disabled} onClick={() => onToggle(s)} aria-pressed={st === 'selected'}
      aria-label={`Seat ${s.number}, ${st}, ₹${s.price}${s.isWindow ? ', window' : ''}${s.isAisle ? ', aisle' : ''}${s.extraLegroom ? ', extra legroom' : ''}`}
      title={`${s.number} · ₹${s.price}${s.extraLegroom ? ' · extra legroom' : ''}`}
      className={cx('relative rounded-lg text-[11px] sm:text-xs grid place-items-center transition-all', sleeper ? 'h-12 w-full' : 'h-10 w-full', STYLE[st])}>
      {s.number}
      {st === 'recommended' && <span className="absolute -top-1.5 -right-1.5 text-[10px] bg-teal-dark text-white rounded-full h-4 w-4 grid place-items-center" aria-hidden="true">★</span>}
    </button>
  );
}

function Grid({ seats, selected, rec, onToggle, sleeper }) {
  const rows = Math.max(...seats.map((s) => s.row)) + 1;
  const cells = Array.from({ length: rows }, () => Array(5).fill(null));
  seats.forEach((s) => { cells[s.row][s.col] = s; });
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: sleeper ? '1fr 1fr 0.5fr 1fr' : '1fr 1fr 0.55fr 1fr 1fr' }}>
      {cells.flatMap((row, r) => (sleeper ? [0, 1, 2, 3] : [0, 1, 2, 3, 4]).map((c) => {
        const s = row[c];
        return s ? <Seat key={s.number} s={s} selected={selected} rec={rec} onToggle={onToggle} sleeper={sleeper} /> : <div key={`${r}-${c}`} />;
      }))}
    </div>
  );
}

export function SeatLegend() {
  const items = [['available', 'Available'], ['selected', 'Selected'], ['recommended', 'Recommended'], ['locked', 'Held by someone'], ['booked', 'Booked']];
  return <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-aura">{items.map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={cx('h-4 w-4 rounded', STYLE[k].split(' cursor')[0])} />{l}</span>)}</div>;
}

export default function SeatMap({ seats, layoutType, selected, recommended, onToggle }) {
  const sleeper = layoutType?.startsWith('sleeper');
  const sel = new Set(selected);
  const rec = new Set(recommended || []);
  if (!seats?.length) return null;
  const decks = sleeper ? ['lower', 'upper'] : ['single'];
  return (
    <div className={cx('grid gap-6', sleeper && 'sm:grid-cols-2')}>
      {decks.map((d) => (
        <div key={d} className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4 max-w-sm mx-auto w-full">
          <div className="flex items-center justify-between text-xs text-slate-aura mb-3">
            <span className="font-semibold uppercase tracking-wide">{sleeper ? `${d} deck` : 'Seats'}</span>
            <span className="rounded-md bg-slate-200 px-2 py-0.5">Front ↑ {d !== 'upper' && 'Door'}</span>
          </div>
          <Grid seats={seats.filter((s) => (sleeper ? s.deck === d : true))} selected={sel} rec={rec} onToggle={onToggle} sleeper={sleeper} />
        </div>
      ))}
    </div>
  );
}
