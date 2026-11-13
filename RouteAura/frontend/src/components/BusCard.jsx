import { Link } from 'react-router-dom';
import { Wifi, BatteryCharging, Droplet, BedDouble, Lightbulb, Cookie, Camera, Radio, Star, ShieldCheck, MapPin } from 'lucide-react';
import { Badge, Button, Card, cx } from './ui';
import { fmtTime, fmtDuration, inr, cap } from '../utils/format';

export const AMENITY_ICON = { wifi: Wifi, charging: BatteryCharging, water: Droplet, blanket: BedDouble, 'reading-light': Lightbulb, snacks: Cookie, cctv: Camera, 'live-tracking': Radio };
const LABEL_TONE = { 'Budget Friendly': 'amber', 'Best Overall Value': 'teal', 'Comfort Priority': 'blue' };

export const Amenities = ({ list = [], max = 8 }) => (
  <div className="flex flex-wrap gap-1.5">
    {list.slice(0, max).map((a) => { const I = AMENITY_ICON[a] || Star; return <span key={a} title={cap(a)} className="inline-flex items-center gap-1 text-xs text-slate-aura bg-slate-100 rounded-md px-2 py-1"><I className="h-3 w-3" />{cap(a)}</span>; })}
  </div>
);

export default function BusCard({ j, passengers = 1, selected, onSelect, canSelect = true }) {
  const soldOut = j.availableSeats < passengers;
  const closed = !['scheduled', 'boarding', 'delayed'].includes(j.status) || soldOut;
  const dur = j.durationMin;
  return (
    <Card className={cx('p-5 transition-shadow hover:shadow-md', selected && 'ring-2 ring-teal-dark')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-lg">{j.operator.orgName}</h3>
            {j.labels?.map((l) => <Badge key={l} tone={LABEL_TONE[l] || 'teal'}>{l}</Badge>)}
            {j.status === 'delayed' && <Badge tone="amber">Delayed</Badge>}
          </div>
          <p className="text-sm text-slate-aura">{j.bus.name} · {j.bus.type}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold">{inr(j.baseFare)}</div>
          <div className="text-xs text-slate-aura">per seat, from</div>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 my-5">
        <div><div className="font-display text-xl font-semibold">{fmtTime(j.departure)}</div><div className="text-xs text-slate-aura">Departs</div></div>
        <div className="flex items-center gap-2 text-xs text-slate-aura"><span className="h-px flex-1 bg-slate-300" /><span className="whitespace-nowrap">{fmtDuration(dur)}</span><span className="h-px flex-1 bg-slate-300" /></div>
        <div className="text-right"><div className="font-display text-xl font-semibold">{fmtTime(j.arrival)}</div><div className="text-xs text-slate-aura">Arrives</div></div>
      </div>

      <Amenities list={j.bus.amenities} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm text-slate-aura">
        <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 text-amber-aura fill-amber-aura" />{j.operator.ratingCount ? `${j.operator.ratingAvg.toFixed(1)} (${j.operator.ratingCount})` : 'No ratings yet'}</span>
        <span className="inline-flex items-center gap-1" title="Sample reliability data for this demonstration"><ShieldCheck className="h-4 w-4 text-teal-dark" />{j.reliability?.onTimePercent ?? '—'}% on time <em className="not-italic text-xs">(sample data)</em></span>
        <span className={cx('font-medium', j.availableSeats <= 5 ? 'text-coral-aura' : 'text-teal-dark')}>{j.availableSeats} seats left</span>
        {j.boardingPoints?.length > 0 && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{j.boardingPoints.length} boarding · {j.droppingPoints?.length || 0} dropping</span>}
      </div>

      {j.score !== undefined && (
        <div className="mt-4 text-xs text-slate-aura flex items-center gap-3">
          <span>Value score <b className="text-midnight">{Math.round(j.score)}</b>/100</span>
          <span>Comfort score <b className="text-midnight">{Math.round(j.comfortScore ?? 0)}</b>/100</span>
        </div>
      )}
      {j.cancellationPolicy?.length > 0 && <p className="text-xs text-slate-aura mt-3">Cancellation: {j.cancellationPolicy.filter((p) => p.refundPercent > 0).map((p) => `${p.refundPercent}% refund ≥${p.hoursBefore}h before`).join(' · ') || 'No refund'}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-slate-100">
        {canSelect ? (
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={!!selected} onChange={() => onSelect?.(j._id)} />Compare</label>
        ) : <span />}
        <div className="flex gap-2">
          <Button as={Link} to={`/journey/${j._id}`} variant="outline" size="sm">Details</Button>
          {closed ? <Button size="sm" disabled>{soldOut ? 'Sold out' : 'Unavailable'}</Button> : <Button as={Link} to={`/journey/${j._id}/seats?passengers=${passengers}`} size="sm">Select seats</Button>}
        </div>
      </div>
    </Card>
  );
}
