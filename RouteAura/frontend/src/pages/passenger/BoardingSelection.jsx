import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Crosshair } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import useDraft from '../../hooks/useDraft';
import LockTimer from '../../components/LockTimer';
import MapView from '../../components/MapView';
import { Badge, Button, Card, ErrorState, Field, Input, Notice, Select, SkeletonList, cx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fmtTime } from '../../utils/format';

function PointList({ title, points, value, onChange, estimate }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold mb-3">{title}</h2>
      {!points?.length ? <p className="text-sm text-slate-aura">No points published for this journey.</p> : (
        <div className="space-y-2" role="radiogroup" aria-label={title}>
          {points.map((p) => (
            <button key={p._id} type="button" role="radio" aria-checked={value === p._id} onClick={() => onChange(p._id)}
              className={cx('w-full text-left rounded-xl p-3.5 ring-1 transition-all', value === p._id ? 'ring-2 ring-teal-dark bg-teal-aura/10' : 'ring-slate-200 hover:bg-slate-50')}>
              <div className="flex justify-between gap-3"><span className="font-medium">{p.name}</span><span className="font-semibold text-sm whitespace-nowrap">{fmtTime(p.estimatedTime)}</span></div>
              <div className="text-xs text-slate-aura mt-0.5">{p.landmark || p.city}{typeof p.distanceKm === 'number' && ` · ${p.distanceKm.toFixed(1)} km from you`}</div>
              {p.instructions && <div className="text-xs text-slate-aura mt-1">{p.instructions}</div>}
              {estimate && <div className="mt-1.5"><Badge tone="slate">Convenience {p.convenienceScore}/100 (estimate)</Badge></div>}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function BoardingSelection() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useDraft();
  const [ref, setRef] = useState(null);
  const pts = useFetch(`/journeys/${id}/boarding-points`, ref || undefined);
  const [board, setBoard] = useState(draft?.boardingPointId || '');
  const [drop, setDrop] = useState(draft?.droppingPointId || '');
  const [phone, setPhone] = useState(draft?.contactPhone || user?.phone || '');
  const [paxs, setPaxs] = useState(() => (draft?.seats || []).map((s, i) => draft.passengers?.[i] || { name: i === 0 ? user?.name || '' : '', age: '', gender: 'male' }));
  const [err, setErr] = useState('');

  useEffect(() => { if (pts.data) { if (!board && pts.data.boarding[0]) setBoard(pts.data.boarding[0]._id); if (!drop && pts.data.dropping[0]) setDrop(pts.data.dropping[0]._id); } }, [pts.data]); // eslint-disable-line

  if (!draft || draft.journeyId !== id || !draft.seats?.length) return <Navigate to={`/journey/${id}/seats`} replace />;

  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setRef({ lat: p.coords.latitude, lng: p.coords.longitude }), () => toast.error('Could not get your location. You can still pick a point manually.'), { timeout: 8000 }) || toast.error('Location is not available in this browser');
  const setPax = (i, k, v) => setPaxs(paxs.map((p, x) => (x === i ? { ...p, [k]: v } : p)));

  const next = () => {
    setErr('');
    for (const [i, p] of paxs.entries()) {
      if (p.name.trim().length < 2) return setErr(`Enter a name for passenger ${i + 1}`);
      const a = Number(p.age); if (!(a >= 1 && a <= 120)) return setErr(`Enter a valid age for passenger ${i + 1}`);
    }
    if (phone && !/^[0-9+\-\s]{7,15}$/.test(phone)) return setErr('Enter a valid phone number');
    setDraft({ ...draft, boardingPointId: board || undefined, droppingPointId: drop || undefined, contactPhone: phone || undefined, passengers: paxs.map((p) => ({ name: p.name.trim(), age: Number(p.age), gender: p.gender })) });
    nav(`/journey/${id}/confirm`);
  };

  const mapPts = [...(pts.data?.boarding || []), ...(pts.data?.dropping || [])].map((p) => ({ lat: p.lat, lng: p.lng, label: p.name }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div><Link to={`/journey/${id}/seats`} className="text-sm text-teal-dark font-semibold">← Change seats</Link><h1 className="text-2xl font-bold mt-1">Boarding, dropping and passengers</h1></div>
        <LockTimer expiresAt={draft.lockExpiresAt} onExpire={() => { toast.error('Your seat hold expired. Please choose seats again.'); nav(`/journey/${id}/seats`); }} />
      </div>
      {pts.loading ? <SkeletonList n={2} h="h-56" /> : pts.error ? <ErrorState message={pts.error} onRetry={pts.reload} /> : (
        <div className="space-y-6">
          <div className="flex justify-end"><Button variant="outline" size="sm" onClick={locate}><Crosshair className="h-4 w-4" />Use my location for distances</Button></div>
          <div className="grid gap-6 md:grid-cols-2">
            <PointList title="Boarding point" points={pts.data.boarding} value={board} onChange={setBoard} estimate />
            <PointList title="Dropping point" points={pts.data.dropping} value={drop} onChange={setDrop} />
          </div>
          <MapView points={mapPts} height={240} />
          <p className="text-xs text-slate-aura">{pts.data.note}</p>

          <Card className="p-5">
            <h2 className="font-semibold mb-4">Passenger details</h2>
            <div className="space-y-4">
              {paxs.map((p, i) => (
                <div key={i} className="grid gap-3 sm:grid-cols-[6rem_1fr_6rem_9rem] items-end">
                  <div className="text-sm font-semibold pb-2.5">Seat {draft.seats[i]}</div>
                  <Field label={i === 0 ? 'Full name' : undefined}><Input aria-label={`Passenger ${i + 1} name`} value={p.name} onChange={(e) => setPax(i, 'name', e.target.value)} placeholder="Full name" /></Field>
                  <Field label={i === 0 ? 'Age' : undefined}><Input aria-label={`Passenger ${i + 1} age`} type="number" min="1" max="120" value={p.age} onChange={(e) => setPax(i, 'age', e.target.value)} /></Field>
                  <Field label={i === 0 ? 'Gender' : undefined}><Select aria-label={`Passenger ${i + 1} gender`} value={p.gender} onChange={(e) => setPax(i, 'gender', e.target.value)}><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></Select></Field>
                </div>
              ))}
              <Field label="Contact phone" className="max-w-xs"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="For trip updates" /></Field>
            </div>
          </Card>
          {err && <Notice tone="coral">{err}</Notice>}
          <div className="flex justify-end"><Button size="lg" onClick={next}>Review booking</Button></div>
        </div>
      )}
    </div>
  );
}
