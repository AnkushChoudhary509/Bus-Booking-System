import { useEffect, useState } from 'react';
import RouteForm from '../../components/RouteForm';
import { Link } from 'react-router-dom';
import { Plus, Users, Radio, Navigation } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, SkeletonList, StatusPill, Tabs, cx } from '../../components/ui';
import { get, patch, post, errMsg } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { fmtDateTime, fmtTime, inr } from '../../utils/format';

const toLocalInput = (d) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 16); };

function CreateJourney({ onClose, onDone }) {
  const toast = useToast();
  const buses = useFetch('/buses');
  const routes = useFetch('/routes');
  const cities = useFetch('/routes/cities');
  const [f, setF] = useState({ bus: '', route: '', departure: toLocalInput(new Date(Date.now() + 2 * 86400000)), baseFare: '', boardingPoints: [], droppingPoints: [] });
  const [points, setPoints] = useState([]);
  const [newRoute, setNewRoute] = useState(null);
  const [np, setNp] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadPoints = (rid) => rid ? get(`/routes/${rid}/boarding-points`).then((d) => setPoints(d.points)).catch(() => setPoints([])) : setPoints([]);
  useEffect(() => { loadPoints(f.route); }, [f.route]);

  const toggle = (k, id) => setF({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] });
  const savePoint = async (e) => {
    e.preventDefault();
    try { await post(`/routes/${f.route}/boarding-points`, { kind: np.kind, name: np.name, city: np.city, landmark: np.landmark || undefined, offsetMin: Number(np.offsetMin) || 0, nearTransit: !!np.nearTransit, hasWaitingArea: !!np.hasWaitingArea, wellLit: !!np.wellLit }); setNp(null); loadPoints(f.route); toast.success('Point added'); } catch (x) { toast.error(errMsg(x)); }
  };
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await post('/journeys', { bus: f.bus, route: f.route, departure: new Date(f.departure).toISOString(), baseFare: Number(f.baseFare), boardingPoints: f.boardingPoints, droppingPoints: f.droppingPoints }); toast.success('Journey published'); onDone(); } catch (x) { toast.error(errMsg(x)); } finally { setBusy(false); }
  };
  const ptsOf = (k) => points.filter((p) => p.kind === k);

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Bus"><Select value={f.bus} onChange={(e) => setF({ ...f, bus: e.target.value })} required><option value="">Select a bus</option>{(buses.data?.buses || []).filter((b) => b.isActive).map((b) => <option key={b._id} value={b._id}>{b.name} ({b.type})</option>)}</Select></Field>
      <Field label="Route">
        <div className="flex gap-2"><Select value={f.route} onChange={(e) => setF({ ...f, route: e.target.value, boardingPoints: [], droppingPoints: [] })} required><option value="">Select a route</option>{(routes.data?.routes || []).map((r) => <option key={r._id} value={r._id}>{r.source} → {r.destination} ({r.distanceKm} km)</option>)}</Select><Button type="button" variant="outline" onClick={() => setNewRoute({ source: '', destination: '', distanceKm: '', durationMin: '' })}>New</Button></div>
      </Field>
      {newRoute && <Card className="p-4 bg-slate-50"><RouteForm cities={cities.data?.cities || []} onCancel={() => setNewRoute(null)} onSaved={async (r, msg) => { await routes.reload(); setF({ ...f, route: r._id }); setNewRoute(null); toast.success(msg || 'Route ready'); }} /></Card>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Departure (your local time)"><Input type="datetime-local" value={f.departure} min={toLocalInput(new Date())} onChange={(e) => setF({ ...f, departure: e.target.value })} required /></Field>
        <Field label="Base fare (₹)"><Input type="number" min="1" value={f.baseFare} onChange={(e) => setF({ ...f, baseFare: e.target.value })} required /></Field>
      </div>
      {f.route && (
        <div className="space-y-3">
          {['boarding', 'dropping'].map((k) => (
            <fieldset key={k}><legend className="text-sm font-medium mb-1.5 capitalize">{k} points</legend>
              {!ptsOf(k).length ? <p className="text-xs text-slate-aura">None yet for this route. Add one below.</p> : <div className="flex flex-wrap gap-2">{ptsOf(k).map((p) => { const key = k === 'boarding' ? 'boardingPoints' : 'droppingPoints'; const on = f[key].includes(p._id); return <button type="button" key={p._id} onClick={() => toggle(key, p._id)} aria-pressed={on} className={cx('rounded-full px-3 py-1.5 text-xs ring-1', on ? 'bg-teal-aura/20 ring-teal-dark font-semibold' : 'ring-slate-300 hover:bg-slate-50')}>{p.name} (+{p.offsetMin}m)</button>; })}</div>}
            </fieldset>
          ))}
          {!np ? <Button type="button" variant="outline" size="sm" onClick={() => setNp({ kind: 'boarding', name: '', city: '', landmark: '', offsetMin: 0 })}><Plus className="h-3.5 w-3.5" />Add boarding/dropping point</Button> : (
            <Card className="p-4 bg-slate-50"><div className="grid grid-cols-2 gap-3">
              <Select aria-label="Kind" value={np.kind} onChange={(e) => setNp({ ...np, kind: e.target.value })}><option value="boarding">Boarding</option><option value="dropping">Dropping</option></Select>
              <Input placeholder="Point name" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} required />
              <Input placeholder="City" value={np.city} onChange={(e) => setNp({ ...np, city: e.target.value })} required />
              <Input placeholder="Minutes after departure" type="number" min="0" value={np.offsetMin} onChange={(e) => setNp({ ...np, offsetMin: e.target.value })} />
              <Input className="col-span-2" placeholder="Landmark (optional)" value={np.landmark} onChange={(e) => setNp({ ...np, landmark: e.target.value })} />
              {['nearTransit', 'hasWaitingArea', 'wellLit'].map((k) => <label key={k} className="text-xs flex gap-1.5 items-center"><input type="checkbox" className="accent-teal-600" checked={!!np[k]} onChange={(e) => setNp({ ...np, [k]: e.target.checked })} />{k === 'nearTransit' ? 'Near transit' : k === 'hasWaitingArea' ? 'Waiting area' : 'Well lit'}</label>)}
              <div className="col-span-2 flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setNp(null)}>Cancel</Button><Button type="button" size="sm" onClick={savePoint}>Save point</Button></div>
            </div></Card>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Publish journey</Button></div>
    </form>
  );
}

function Reservations({ journey, onClose }) {
  const { data, loading } = useFetch(`/journeys/${journey._id}/reservations`);
  return (
    <div>
      {loading ? <SkeletonList n={2} h="h-12" /> : !data?.reservations?.length ? <Empty icon={Users} title="No confirmed reservations" /> : (
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[480px]"><thead className="text-left text-slate-aura"><tr><th className="py-2 font-medium">Ref</th><th className="font-medium">Passengers</th><th className="font-medium">Seats</th><th className="font-medium">Board</th><th className="font-medium">Checked in</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{data.reservations.map((r) => <tr key={r._id}><td className="py-2.5 font-mono text-xs">{r.bookingRef}</td><td>{r.passengers.map((p) => p.name).join(', ')}<div className="text-xs text-slate-aura">{r.contact}</div></td><td>{r.seats.join(', ')}</td><td>{r.boardingPoint || '—'}</td><td>{r.checkedInAt ? fmtTime(r.checkedInAt) : '—'}</td></tr>)}</tbody></table></div>
      )}
      <div className="flex justify-end mt-4"><Button variant="outline" onClick={onClose}>Close</Button></div>
    </div>
  );
}

export default function JourneyManagement() {
  const { operator } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('upcoming');
  const { data, loading, error, reload } = useFetch('/operator/journeys', tab === 'upcoming' ? { upcoming: 'true' } : undefined);
  const [create, setCreate] = useState(false);
  const [res, setRes] = useState(null);
  const [st, setSt] = useState(null); // { journey, status, delayMin, note }
  const [busy, setBusy] = useState(false);
  const approved = operator?.approvalStatus === 'approved';

  const updateStatus = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await patch(`/journeys/${st.journey._id}/status`, { status: st.status, ...(st.status === 'delayed' && { delayMin: Number(st.delayMin) }), ...(st.note && { note: st.note }) }); toast.success('Status updated. Passengers have been notified.'); setSt(null); reload(); } catch (x) { toast.error(errMsg(x)); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader title="Journeys" subtitle="Schedules, prices, reservations and live status" actions={<Button disabled={!approved} onClick={() => setCreate(true)}><Plus className="h-4 w-4" />Publish journey</Button>} />
      {!approved && <Notice className="mb-4">Publishing unlocks once an administrator approves your account.</Notice>}
      <Tabs tabs={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'all', label: 'All' }]} value={tab} onChange={setTab} />
      {loading ? <SkeletonList n={3} h="h-24" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data.journeys.length ? <Card><Empty title="No journeys" text="Publish a journey to start taking bookings." /></Card> : (
        <div className="space-y-3">{data.journeys.map((j) => (
          <Card key={j._id} className="p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div><div className="flex items-center gap-2"><h3 className="font-semibold">{j.route?.source} → {j.route?.destination}</h3><StatusPill status={j.status} />{j.delayMin > 0 && <Badge tone="amber">+{j.delayMin} min</Badge>}</div><p className="text-sm text-slate-aura">{j.bus?.name} · {fmtDateTime(j.departure)}</p></div>
              <div className="text-right text-sm"><div className="font-semibold">{inr(j.baseFare)}</div><div className="text-slate-aura">{j.bookedSeats}/{j.totalSeats} booked · {j.availableSeats} free</div></div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={() => setRes(j)}><Users className="h-3.5 w-3.5" />Reservations</Button>
              {!['completed', 'cancelled'].includes(j.status) && <Button size="sm" variant="dark" onClick={() => setSt({ journey: j, status: j.status === 'scheduled' ? 'boarding' : j.status, delayMin: 30, note: '' })}>Update status</Button>}
              {!['completed', 'cancelled'].includes(j.status) && <Button as={Link} to={`/operator/drive/${j._id}`} size="sm" variant="outline"><Navigation className="h-3.5 w-3.5" />Driver mode (GPS)</Button>}
              <Button as={Link} to={`/journey/${j._id}/tracking`} size="sm" variant="ghost"><Radio className="h-3.5 w-3.5" />Tracking</Button>
            </div>
          </Card>))}</div>
      )}
      <Modal open={create} onClose={() => setCreate(false)} title="Publish a journey" wide>{create && <CreateJourney onClose={() => setCreate(false)} onDone={() => { setCreate(false); reload(); }} />}</Modal>
      <Modal open={!!res} onClose={() => setRes(null)} title={`Reservations: ${res?.route?.source} → ${res?.route?.destination}`} wide>{res && <Reservations journey={res} onClose={() => setRes(null)} />}</Modal>
      <Modal open={!!st} onClose={() => setSt(null)} title="Update journey status">
        {st && <form onSubmit={updateStatus} className="space-y-4">
          <Field label="New status"><Select value={st.status} onChange={(e) => setSt({ ...st, status: e.target.value })}>{['scheduled', 'boarding', 'running', 'delayed', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</Select></Field>
          {st.status === 'delayed' && <Field label="Delay (minutes)" hint="60+ minutes triggers Journey Rescue for passengers"><Input type="number" min="1" max="1440" value={st.delayMin} onChange={(e) => setSt({ ...st, delayMin: e.target.value })} required /></Field>}
          {st.status === 'cancelled' && <Notice tone="coral">Cancelling refunds every confirmed booking in full and notifies passengers. This cannot be undone.</Notice>}
          <Field label="Note for passengers (optional)"><Input value={st.note} maxLength={200} onChange={(e) => setSt({ ...st, note: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSt(null)}>Cancel</Button><Button type="submit" variant={st.status === 'cancelled' ? 'danger' : 'primary'} loading={busy}>Apply</Button></div>
        </form>}
      </Modal>
    </div>
  );
}
