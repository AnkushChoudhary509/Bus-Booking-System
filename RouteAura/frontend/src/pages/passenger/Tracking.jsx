import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Circle, Radio } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import useSocketEvent from '../../hooks/useSocketEvent';
import TrackingMap from '../../components/TrackingMap';
import { Badge, Button, Card, ErrorState, Notice, SkeletonList, StatusPill } from '../../components/ui';
import { fmtDateTime, fmtTime } from '../../utils/format';

export default function Tracking() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch(`/journeys/${id}/tracking`);
  useSocketEvent('journey:status', (p) => { if (p?.journeyId === id) reload(); }, { journeyId: id });
  // polling fallback keeps the page fresh if the websocket is unavailable
  useSocketPoll(reload);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8"><SkeletonList n={3} /></div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-8"><ErrorState message={error} onRetry={reload} /></div>;
  const t = data;
  const pct = Math.round(t.progressPct || 0);
  const label = t.completed ? 'Journey completed' : t.status === 'cancelled' ? 'Cancelled' : t.status === 'running' ? 'On the road' : t.status === 'boarding' ? 'Boarding now' : t.status === 'delayed' ? `Delayed ${t.delayMin} min` : 'Scheduled';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{t.route.source} → {t.route.destination}</h1><p className="text-slate-aura">{t.operator} · {t.bus?.name} ({t.bus?.regNo})</p></div>
        <div className="flex items-center gap-2"><Badge tone="teal"><Radio className="h-3 w-3" />Live updates</Badge><StatusPill status={t.status} /></div>
      </div>
      <Notice>{t.disclaimer}</Notice>

      <Card className="p-6">
        <div className="flex flex-wrap justify-between gap-4 mb-5">
          <div><div className="text-sm text-slate-aura">Status</div><div className="font-display text-xl font-bold">{label}</div>{t.statusNote && <div className="text-sm text-slate-aura mt-1">{t.statusNote}</div>}</div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div><div className="text-slate-aura">Scheduled departure</div><b>{fmtDateTime(t.scheduledDeparture)}</b></div>
            <div><div className="text-slate-aura">Estimated departure</div><b className={t.delayMin ? 'text-[#9a6200]' : ''}>{fmtDateTime(t.estimatedDeparture)}</b></div>
            <div><div className="text-slate-aura">Scheduled arrival</div><b>{fmtDateTime(t.scheduledArrival)}</b></div>
            <div><div className="text-slate-aura">Estimated arrival</div><b className={t.delayMin ? 'text-[#9a6200]' : ''}>{fmtDateTime(t.estimatedArrival)}</b></div>
          </div>
        </div>
        <div className="flex justify-between text-xs text-slate-aura mb-1.5"><span>Journey progress <Badge tone={t.trackingType === 'gps' && !t.map?.offRoute ? 'teal' : 'amber'} className="ml-1">{t.trackingType === 'gps' ? (t.map?.offRoute ? 'Live GPS - off route' : 'Live GPS') : t.trackingType === 'gps-lost' ? 'GPS lost' : 'Simulated'}</Badge></span><span>{pct}%</span></div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Journey progress"><div className="h-full bg-teal-aura rounded-full transition-all duration-700" style={{ width: `${pct}%` }} /></div>
      </Card>

      {t.map && <Card className="p-4"><TrackingMap map={t.map} stops={t.stops} /></Card>}

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Stops</h2>
        <ol className="relative">
          {t.stops.map((s, i) => (
            <li key={i} className="flex gap-4 pb-6 last:pb-0 relative">
              {i < t.stops.length - 1 && <span className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${s.passed ? 'bg-teal-aura' : 'bg-slate-200'}`} aria-hidden="true" />}
              {s.passed ? <CheckCircle2 className="h-6 w-6 text-teal-dark shrink-0 bg-white" /> : <Circle className="h-6 w-6 text-slate-300 shrink-0 bg-white" />}
              <div className="flex-1 flex flex-wrap justify-between gap-2"><div><div className="font-medium">{s.name}</div><div className="text-xs text-slate-aura capitalize">{s.kind}</div></div>
                <div className="text-sm text-right"><div className="text-slate-aura line-through text-xs">{t.delayMin ? fmtTime(s.scheduledTime) : ''}</div><b>{fmtTime(s.estimatedTime)}</b></div></div>
            </li>
          ))}
        </ol>
        {!t.completed && t.upcomingStops?.length > 0 && <p className="text-xs text-slate-aura mt-4">{t.upcomingStops.length} stop{t.upcomingStops.length > 1 ? 's' : ''} remaining</p>}
      </Card>
      <Button as={Link} to={`/journey/${id}`} variant="outline">Bus details</Button>
    </div>
  );
}

import { useEffect } from 'react';
function useSocketPoll(fn) { useEffect(() => { const t = setInterval(fn, 15000); return () => clearInterval(t); }, []); } // eslint-disable-line
