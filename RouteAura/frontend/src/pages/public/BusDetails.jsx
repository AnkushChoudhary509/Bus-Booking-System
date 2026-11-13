import { Link, useParams } from 'react-router-dom';
import { Star, Radio } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { Badge, Button, Card, ErrorState, SkeletonList, StatusPill, Empty } from '../../components/ui';
import { Amenities } from '../../components/BusCard';
import MapView from '../../components/MapView';
import { fmtDateTime, fmtDuration, fmtTime, inr } from '../../utils/format';

export default function BusDetails() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch(`/journeys/${id}`);
  const pts = useFetch(`/journeys/${id}/boarding-points`);
  if (loading) return <div className="max-w-5xl mx-auto px-4 py-8"><SkeletonList n={3} h="h-48" /></div>;
  if (error) return <div className="max-w-5xl mx-auto px-4 py-8"><ErrorState message={error} onRetry={reload} /></div>;
  const j = data.journey;
  const open = ['scheduled', 'boarding', 'delayed'].includes(j.status) && j.availableSeats > 0;
  const mapPts = [...(pts.data?.boarding || []), ...(pts.data?.dropping || [])].map((p) => ({ lat: p.lat, lng: p.lng, label: p.name }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap"><h1 className="text-2xl font-bold">{j.route.source} → {j.route.destination}</h1><StatusPill status={j.status} /></div>
            <p className="text-slate-aura mt-1">{j.operator.orgName} · {j.bus.name} · {j.bus.type} · Reg. {j.bus.regNo}</p>
            {j.statusNote && <p className="text-sm text-[#9a6200] mt-2">{j.statusNote}</p>}
          </div>
          <div className="text-right"><div className="font-display text-3xl font-bold">{inr(j.baseFare)}</div><div className="text-xs text-slate-aura">base fare per seat</div></div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-6 text-sm">
          <div><div className="text-slate-aura">Departure</div><div className="font-semibold">{fmtDateTime(j.departure)}</div>{j.delayMin > 0 && <div className="text-[#9a6200]">Now ≈ {fmtTime(j.estimatedDeparture)} (+{j.delayMin} min)</div>}</div>
          <div><div className="text-slate-aura">Arrival</div><div className="font-semibold">{fmtDateTime(j.arrival)}</div></div>
          <div><div className="text-slate-aura">Duration</div><div className="font-semibold">{fmtDuration(j.durationMin)} · {j.route.distanceKm} km</div></div>
        </div>
        <div className="mt-5"><Amenities list={j.bus.amenities} /></div>
        <div className="flex flex-wrap gap-3 mt-6">
          {open ? <Button as={Link} to={`/journey/${id}/seats`} size="lg">Choose seats ({j.availableSeats} left)</Button> : <Button size="lg" disabled>{j.availableSeats === 0 ? 'Sold out' : 'Not bookable'}</Button>}
          <Button as={Link} to={`/journey/${id}/tracking`} variant="outline" size="lg"><Radio className="h-4 w-4" />Journey status</Button>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-3">Boarding points</h2>
          {pts.loading ? <SkeletonList n={2} h="h-12" /> : !pts.data?.boarding?.length ? <p className="text-sm text-slate-aura">None published yet.</p> : (
            <ul className="space-y-3">{pts.data.boarding.map((p) => <li key={p._id} className="text-sm"><div className="flex justify-between gap-2"><span className="font-medium">{p.name}</span><span className="text-slate-aura">{fmtTime(p.estimatedTime)}</span></div><div className="text-slate-aura text-xs">{p.landmark || p.city}</div></li>)}</ul>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-3">Dropping points</h2>
          {!pts.data?.dropping?.length ? <p className="text-sm text-slate-aura">None published yet.</p> : (
            <ul className="space-y-3">{pts.data.dropping.map((p) => <li key={p._id} className="text-sm"><div className="flex justify-between gap-2"><span className="font-medium">{p.name}</span><span className="text-slate-aura">{fmtTime(p.estimatedTime)}</span></div><div className="text-slate-aura text-xs">{p.landmark || p.city}</div></li>)}</ul>
          )}
        </Card>
      </div>

      <MapView points={mapPts} height={280} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-3">Cancellation policy</h2>
          <ul className="text-sm space-y-1.5">{j.cancellationPolicy.map((p, i) => <li key={i} className="flex justify-between"><span>{p.hoursBefore > 0 ? `${p.hoursBefore}+ hours before departure` : 'Less than 4 hours before'}</span><b>{p.refundPercent}% refund</b></li>)}</ul>
          <p className="text-xs text-slate-aura mt-3">If the operator cancels, you always get a full refund.</p>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-3">Reliability <Badge tone="amber">Sample data</Badge></h2>
          <p className="text-sm">{j.reliability?.onTimePercent}% of past trips on time</p>
          <p className="text-xs text-slate-aura mt-2">{j.reliability?.note || 'Illustrative figure for this demonstration, not measured history.'}</p>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="font-semibold text-lg mb-3">Recent reviews</h2>
        {!j.recentReviews?.length ? <Empty icon={Star} title="No reviews yet" text="Reviews appear after completed journeys." /> : (
          <ul className="divide-y divide-slate-100">{j.recentReviews.map((r, i) => <li key={i} className="py-3 text-sm"><div className="flex items-center gap-1 text-amber-aura">{'★'.repeat(r.rating)}<span className="text-slate-300">{'★'.repeat(5 - r.rating)}</span><span className="ml-2 text-midnight font-medium">{r.name}</span></div>{r.comment && <p className="text-slate-aura mt-1">{r.comment}</p>}</li>)}</ul>
        )}
      </Card>
    </div>
  );
}
