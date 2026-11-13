import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Banknote, Ticket, Bus, Building2, LifeBuoy, Play, FastForward, RotateCcw, Clock, Pause, Zap } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { RevenueChart, BarsChart } from '../../components/Charts';
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonList, StatCard, StatusPill, Tabs, Textarea } from '../../components/ui';
import { patch, post, errMsg } from '../../services/api';
import RouteForm from '../../components/RouteForm';
import { useToast } from '../../context/ToastContext';
import { fmtDateTime, inr, ago, todayISO } from '../../utils/format';

const Table = ({ cols, rows, empty = 'Nothing here.' }) => !rows?.length ? <Empty title={empty} /> : (
  <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]"><thead className="text-left text-slate-aura"><tr>{cols.map((c) => <th key={c.h} className="py-2.5 px-3 font-medium">{c.h}</th>)}</tr></thead>
    <tbody className="divide-y divide-slate-100">{rows.map((r, i) => <tr key={r._id || i} className="hover:bg-slate-50">{cols.map((c) => <td key={c.h} className="py-3 px-3 align-top">{c.v(r)}</td>)}</tr>)}</tbody></table></div>
);

function Overview() {
  const st = useFetch('/admin/stats');
  const rv = useFetch('/admin/revenue');
  if (st.loading) return <SkeletonList n={3} />;
  if (st.error) return <ErrorState message={st.error} onRetry={st.reload} />;
  const s = st.data;
  const users = Object.values(s.users || {}).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Banknote} label="Total revenue" value={inr(s.revenue)} sub={`${s.paidBookings} paid bookings`} />
        <StatCard icon={Ticket} label="Bookings today" value={s.bookingsToday} tone="blue" />
        <StatCard icon={Users} label="Users" value={users} sub={`${s.users?.passenger || 0} passengers`} tone="navy" />
        <StatCard icon={Bus} label="Active buses" value={s.activeBuses} tone="amber" />
        <StatCard icon={Building2} label="Operators pending" value={s.pendingOperators} tone={s.pendingOperators ? 'amber' : 'teal'} />
        <StatCard icon={Banknote} label="Refunds pending" value={s.pendingRefunds} tone={s.pendingRefunds ? 'coral' : 'teal'} />
        <StatCard icon={LifeBuoy} label="Open support tickets" value={s.openTickets} tone={s.openTickets ? 'amber' : 'teal'} />
        <StatCard icon={Clock} label="Journeys running" value={s.journeys?.running || 0} sub={`${s.journeys?.scheduled || 0} scheduled`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="p-5"><h2 className="font-semibold mb-3">Revenue, last 30 days</h2>{rv.loading ? <SkeletonList n={1} h="h-56" /> : <RevenueChart data={rv.data?.byDay} />}</Card>
        <Card className="p-5"><h2 className="font-semibold mb-3">Revenue by operator</h2><BarsChart data={(rv.data?.byOperator || []).map((o) => ({ name: o.operator, revenue: o.revenue }))} xKey="name" /></Card>
      </div>
      <Card className="p-5"><h2 className="font-semibold mb-3">Top routes by revenue</h2><BarsChart data={rv.data?.byRoute || []} xKey="route" height={260} /></Card>
    </div>
  );
}

function Operators() {
  const { data, loading, error, reload } = useFetch('/admin/operators');
  const toast = useToast();
  const [rej, setRej] = useState(null);
  const approve = async (id) => { try { await patch(`/admin/operators/${id}/approve`); toast.success('Operator approved'); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const reject = async () => { try { await patch(`/admin/operators/${rej.id}/reject`, { reason: rej.reason || undefined }); toast.success('Operator rejected'); setRej(null); reload(); } catch (e) { toast.error(errMsg(e)); } };
  if (loading) return <SkeletonList />; if (error) return <ErrorState message={error} onRetry={reload} />;
  return (<>
    <Table rows={data.operators} empty="No operators" cols={[
      { h: 'Organisation', v: (o) => <div><b>{o.orgName}</b><div className="text-xs text-slate-aura">{o.user?.email}</div></div> }, { h: 'Licence', v: (o) => o.licenseNo }, { h: 'Applied', v: (o) => ago(o.createdAt) },
      { h: 'Status', v: (o) => <StatusPill status={o.approvalStatus} /> },
      { h: '', v: (o) => <div className="flex gap-2">{o.approvalStatus !== 'approved' && <Button size="sm" onClick={() => approve(o._id)}>Approve</Button>}{o.approvalStatus !== 'rejected' && <Button size="sm" variant="outline" onClick={() => setRej({ id: o._id, reason: '' })}>Reject</Button>}</div> },
    ]} />
    <Modal open={!!rej} onClose={() => setRej(null)} title="Reject application"><Field label="Reason (shown to the operator)"><Textarea value={rej?.reason || ''} maxLength={200} onChange={(e) => setRej({ ...rej, reason: e.target.value })} /></Field><div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setRej(null)}>Cancel</Button><Button variant="danger" onClick={reject}>Reject</Button></div></Modal>
  </>);
}

function UsersTab() {
  const { data, loading, error, reload } = useFetch('/admin/users');
  const toast = useToast();
  const toggle = async (u) => { try { await patch(`/admin/users/${u._id}/active?activate=${!u.isActive}`); reload(); } catch (e) { toast.error(errMsg(e)); } };
  if (loading) return <SkeletonList />; if (error) return <ErrorState message={error} onRetry={reload} />;
  return <Table rows={data.users} cols={[{ h: 'Name', v: (u) => <div><b>{u.name}</b><div className="text-xs text-slate-aura">{u.email}</div></div> }, { h: 'Role', v: (u) => <Badge tone="navy" className="capitalize">{u.role}</Badge> }, { h: 'Joined', v: (u) => ago(u.createdAt) }, { h: 'Points', v: (u) => u.loyaltyPoints ?? 0 }, { h: 'Status', v: (u) => <Badge tone={u.isActive ? 'teal' : 'coral'}>{u.isActive ? 'Active' : 'Disabled'}</Badge> }, { h: '', v: (u) => u.role !== 'admin' && <Button size="sm" variant="outline" onClick={() => toggle(u)}>{u.isActive ? 'Disable' : 'Enable'}</Button> }]} />;
}

function Journeys() {
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useFetch('/admin/journeys', status ? { status } : undefined);
  const toast = useToast();
  const [auto, setAuto] = useState(null); // journey id being auto-driven
  const timer = useRef(null);
  const stopAuto = () => { clearInterval(timer.current); timer.current = null; setAuto(null); };
  useEffect(() => stopAuto, []); // stop driving when leaving the page
  const sim = async (id, action, value, quiet) => { try { const r = await post(`/admin/simulation/${id}`, { action, ...(value !== undefined && { value }) }); if (!quiet) toast.success(`Simulation: ${action}`); reload(); return r.data?.journey; } catch (e) { stopAuto(); toast.error(errMsg(e)); return null; } };
  // Auto-run: the browser asks the server to advance 2% every 2 seconds until the trip completes (about 100 s end to end).
  const startAuto = async (j) => {
    stopAuto();
    if (!(j.simulation?.progressPct > 0)) { if (!(await sim(j._id, 'start', undefined, true))) return; }
    setAuto(j._id);
    timer.current = setInterval(async () => {
      const r = await sim(j._id, 'advance', 2, true);
      if (r && (r.status === 'completed' || r.simulation?.progressPct >= 100)) { stopAuto(); toast.success('Journey completed'); }
    }, 2000);
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2"><p className="text-sm text-slate-aura">Simulation moves a demo bus along the road route (no real GPS). Auto-run drives the whole trip; passengers watching the tracking page see it live.</p>
        <Select className="!w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{['scheduled', 'boarding', 'running', 'delayed', 'completed', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</Select></div>
      {loading ? <SkeletonList /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <Table rows={data.journeys} cols={[
          { h: 'Route', v: (j) => <div><b>{j.route?.source} → {j.route?.destination}</b><div className="text-xs text-slate-aura">{j.operator?.orgName} · {j.bus?.name}</div></div> }, { h: 'Departure', v: (j) => fmtDateTime(j.departure) },
          { h: 'Load', v: (j) => `${j.bookedSeats}/${j.totalSeats}` }, { h: 'Status', v: (j) => <div className="space-y-1"><StatusPill status={j.status} />{j.simulation?.progressPct > 0 && <div className="text-xs text-slate-aura">{Math.round(j.simulation.progressPct)}% simulated</div>}</div> },
          { h: 'Simulation', v: (j) => !['completed', 'cancelled'].includes(j.status) && <div className="flex flex-wrap gap-1.5"><Button size="sm" variant="outline" title="Start" aria-label="Start simulation" onClick={() => sim(j._id, 'start')}><Play className="h-3.5 w-3.5" /></Button>{auto === j._id ? <Button size="sm" variant="dark" title="Pause auto-run" aria-label="Pause auto-run" onClick={stopAuto}><Pause className="h-3.5 w-3.5" />Pause</Button> : <Button size="sm" variant="dark" title="Auto-run: bus drives the whole route" aria-label="Auto-run simulation" onClick={() => startAuto(j)}><Zap className="h-3.5 w-3.5" />Auto-run</Button>}<Button size="sm" variant="outline" title="Advance 10%" aria-label="Advance simulation 10 percent" onClick={() => sim(j._id, 'advance', 10)}><FastForward className="h-3.5 w-3.5" />10%</Button><Button size="sm" variant="outline" title="Delay 75 min" aria-label="Delay 75 minutes" onClick={() => sim(j._id, 'delay', 75)}><Clock className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" title="Reset" aria-label="Reset simulation" onClick={() => { stopAuto(); sim(j._id, 'reset'); }}><RotateCcw className="h-3.5 w-3.5" /></Button><Button as={Link} to={`/journey/${j._id}/tracking`} size="sm" variant="ghost">View</Button></div> },
        ]} />
      )}
    </div>
  );
}

function Bookings() {
  const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useFetch('/admin/bookings', { ...(q && { q }), ...(status && { status }) });
  return (<div>
    <div className="flex gap-2 mb-4"><Input placeholder="Search booking reference" aria-label="Search booking reference" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" /><Select className="!w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{['pending_payment', 'confirmed', 'completed', 'cancelled', 'replaced', 'expired'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select></div>
    {loading ? <SkeletonList /> : error ? <ErrorState message={error} onRetry={reload} /> : <Table rows={data.bookings} cols={[{ h: 'Ref', v: (b) => <Link className="font-mono text-xs text-teal-dark" to={`/booking/${b._id}`}>{b.bookingRef}</Link> }, { h: 'Passenger', v: (b) => b.user?.name }, { h: 'Route', v: (b) => `${b.journey?.route?.source} → ${b.journey?.route?.destination}` }, { h: 'Operator', v: (b) => b.operator?.orgName }, { h: 'Amount', v: (b) => inr(b.fare.seatTotal - b.fare.discount) }, { h: 'Status', v: (b) => <div className="flex gap-1 flex-wrap"><StatusPill status={b.status} /><StatusPill status={b.paymentStatus} /></div> }]} />}
  </div>);
}

function Refunds() {
  const [status, setStatus] = useState('pending');
  const { data, loading, error, reload } = useFetch('/admin/refunds', { status });
  const toast = useToast();
  const decide = async (id, action) => { try { await patch(`/admin/refunds/${id}`, { action }); toast.success(action === 'approve' ? 'Refund processed' : 'Refund rejected'); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (<div>
    <Tabs tabs={['pending', 'processed', 'rejected'].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1) }))} value={status} onChange={setStatus} />
    {loading ? <SkeletonList /> : error ? <ErrorState message={error} onRetry={reload} /> : <Table empty={`No ${status} refunds`} rows={data.refunds} cols={[{ h: 'Booking', v: (p) => <span className="font-mono text-xs">{p.booking?.bookingRef}</span> }, { h: 'Passenger', v: (p) => p.user?.name }, { h: 'Amount', v: (p) => inr(p.refundAmount) }, { h: 'Status', v: (p) => <StatusPill status={p.refundStatus} /> }, { h: '', v: (p) => p.refundStatus === 'pending' && <div className="flex gap-2"><Button size="sm" onClick={() => decide(p._id, 'approve')}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide(p._id, 'reject')}>Reject</Button></div> }]} />}
  </div>);
}

function Support() {
  const { data, loading, error, reload } = useFetch('/admin/support');
  const toast = useToast();
  const [t, setT] = useState(null); const [msg, setMsg] = useState(''); const [st, setSt] = useState('in_progress');
  const send = async () => { try { await post(`/support/${t._id}/replies`, { message: msg, status: st }); toast.success('Reply sent'); setT(null); setMsg(''); reload(); } catch (e) { toast.error(errMsg(e)); } };
  if (loading) return <SkeletonList />; if (error) return <ErrorState message={error} onRetry={reload} />;
  return (<>
    <Table empty="No support tickets" rows={data.tickets} cols={[{ h: 'From', v: (x) => <div><b>{x.user?.name}</b><div className="text-xs text-slate-aura">{x.user?.email}</div></div> }, { h: 'Subject', v: (x) => <div><b>{x.subject}</b><div className="text-xs text-slate-aura capitalize">{x.category} · {ago(x.updatedAt)}</div></div> }, { h: 'Status', v: (x) => <StatusPill status={x.status} /> }, { h: '', v: (x) => <Button size="sm" variant="outline" onClick={() => { setT(x); setSt(x.status === 'resolved' ? 'resolved' : 'in_progress'); }}>Open</Button> }]} />
    <Modal open={!!t} onClose={() => setT(null)} title={t?.subject || ''}>
      {t && <div className="space-y-3 text-sm"><div className="rounded-lg bg-slate-50 p-3">{t.message}</div>{t.replies.map((r, i) => <div key={i} className={`rounded-lg p-3 ${r.authorRole === 'admin' ? 'bg-teal-aura/10' : 'bg-slate-50'}`}><div className="text-xs text-slate-aura mb-1 capitalize">{r.authorRole} · {ago(r.at)}</div>{r.message}</div>)}
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write a reply" aria-label="Reply" /><div className="flex gap-2 justify-end items-center"><Select className="!w-40" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Set status"><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="open">Open</option></Select><Button disabled={!msg.trim()} onClick={send}>Send reply</Button></div></div>}
    </Modal>
  </>);
}

function Coupons() {
  const { data, loading, error, reload } = useFetch('/admin/coupons');
  const toast = useToast();
  const [f, setF] = useState(null);
  const create = async (e) => {
    e.preventDefault();
    try { await post('/admin/coupons', { code: f.code, description: f.description || undefined, discountType: f.discountType, value: Number(f.value), minAmount: Number(f.minAmount) || 0, ...(f.maxDiscount && { maxDiscount: Number(f.maxDiscount) }), validTo: new Date(`${f.validTo}T23:59:59+05:30`).toISOString(), usageLimit: Number(f.usageLimit) || 0 }); toast.success('Coupon created'); setF(null); reload(); } catch (x) { toast.error(errMsg(x)); }
  };
  const toggle = async (c) => { try { await patch(`/admin/coupons/${c._id}/active?activate=${!c.isActive}`); reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (<div>
    <div className="flex justify-end mb-4"><Button onClick={() => setF({ code: '', description: '', discountType: 'percent', value: 10, minAmount: 0, maxDiscount: '', validTo: todayISO(60), usageLimit: 0 })}>New coupon</Button></div>
    {loading ? <SkeletonList /> : error ? <ErrorState message={error} onRetry={reload} /> : <Table empty="No coupons" rows={data.coupons} cols={[{ h: 'Code', v: (c) => <b className="font-mono">{c.code}</b> }, { h: 'Offer', v: (c) => <div>{c.discountType === 'percent' ? `${c.value}% off` : `${inr(c.value)} off`}{c.maxDiscount ? ` (max ${inr(c.maxDiscount)})` : ''}<div className="text-xs text-slate-aura">{c.description}</div></div> }, { h: 'Min', v: (c) => inr(c.minAmount) }, { h: 'Used', v: (c) => `${c.usedCount || 0}${c.usageLimit ? ` / ${c.usageLimit}` : ''}` }, { h: 'Valid to', v: (c) => fmtDateTime(c.validTo) }, { h: '', v: (c) => <Button size="sm" variant="outline" onClick={() => toggle(c)}>{c.isActive ? 'Deactivate' : 'Activate'}</Button> }]} />}
    <Modal open={!!f} onClose={() => setF(null)} title="Create coupon">
      {f && <form onSubmit={create} className="grid grid-cols-2 gap-3">
        <Field label="Code"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} required minLength={3} maxLength={20} /></Field>
        <Field label="Type"><Select value={f.discountType} onChange={(e) => setF({ ...f, discountType: e.target.value })}><option value="percent">Percent</option><option value="flat">Flat ₹</option></Select></Field>
        <Field label="Value"><Input type="number" min="1" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} required /></Field>
        <Field label="Max discount (₹)"><Input type="number" min="0" value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} /></Field>
        <Field label="Minimum amount (₹)"><Input type="number" min="0" value={f.minAmount} onChange={(e) => setF({ ...f, minAmount: e.target.value })} /></Field>
        <Field label="Usage limit (0 = unlimited)"><Input type="number" min="0" value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: e.target.value })} /></Field>
        <Field label="Valid until" className="col-span-2"><Input type="date" value={f.validTo} min={todayISO(0)} onChange={(e) => setF({ ...f, validTo: e.target.value })} required /></Field>
        <Field label="Description" className="col-span-2"><Input value={f.description} maxLength={150} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setF(null)}>Cancel</Button><Button type="submit">Create</Button></div>
      </form>}
    </Modal>
  </div>);
}

function AddBus({ onClose, onDone }) {
  const toast = useToast();
  const meta = useFetch('/buses/meta');
  const ops = useFetch('/admin/operators');
  const [f, setF] = useState({ operator: '', name: '', regNo: '', type: 'AC Seater', layoutType: 'seater-2x2', amenities: [] });
  const [busy, setBusy] = useState(false);
  const approved = (ops.data?.operators || []).filter((o) => o.approvalStatus === 'approved');
  const am = (a) => setF({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] });
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await post('/buses', { ...f, regNo: f.regNo.toUpperCase().replace(/\s/g, '') }); toast.success('Bus added'); onDone(); } catch (x) { toast.error(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <Field label="Operator" hint="The bus is registered under this operator"><Select value={f.operator} onChange={(e) => setF({ ...f, operator: e.target.value })} required><option value="">Select an approved operator</option>{approved.map((o) => <option key={o._id} value={o._id}>{o.orgName}</option>)}</Select></Field>
      <Field label="Bus name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></Field>
      <Field label="Registration number" hint="e.g. PB08AB1234"><Input value={f.regNo} onChange={(e) => setF({ ...f, regNo: e.target.value })} required minLength={5} maxLength={14} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bus type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{(meta.data?.types || []).map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <Field label="Seat layout"><Select value={f.layoutType} onChange={(e) => setF({ ...f, layoutType: e.target.value })}>{(meta.data?.layouts || []).map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</Select></Field>
      </div>
      <fieldset><legend className="text-sm font-medium mb-2">Amenities</legend><div className="grid grid-cols-2 gap-2">{(meta.data?.amenities || []).map((a) => <label key={a} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-teal-600" checked={f.amenities.includes(a)} onChange={() => am(a)} />{a}</label>)}</div></fieldset>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Add bus</Button></div>
    </form>
  );
}

function Inventory() {
  const buses = useFetch('/admin/buses'); const routes = useFetch('/admin/routes'); const cities = useFetch('/routes/cities');
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const toggleRoute = async (r) => { try { await patch(`/routes/${r._id}/active?activate=${!r.isActive}`); routes.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (<div className="grid gap-6 lg:grid-cols-2">
    <Card className="p-4"><div className="flex items-center justify-between mb-2"><h2 className="font-semibold">Buses</h2><Button size="sm" onClick={() => setModal('bus')}>Add bus</Button></div>{buses.loading ? <SkeletonList n={2} h="h-10" /> : <Table rows={buses.data?.buses} cols={[{ h: 'Bus', v: (b) => <div><b>{b.name}</b><div className="text-xs text-slate-aura">{b.regNo}</div></div> }, { h: 'Operator', v: (b) => b.operator?.orgName }, { h: 'Type', v: (b) => b.type }, { h: 'Active', v: (b) => <Badge tone={b.isActive ? 'teal' : 'slate'}>{b.isActive ? 'Yes' : 'No'}</Badge> }]} />}</Card>
    <Card className="p-4"><div className="flex items-center justify-between mb-2"><h2 className="font-semibold">Routes</h2><Button size="sm" onClick={() => setModal('route')}>Add route</Button></div>{routes.loading ? <SkeletonList n={2} h="h-10" /> : <Table rows={routes.data?.routes} cols={[{ h: 'Route', v: (r) => <b>{r.source} → {r.destination}</b> }, { h: 'Distance', v: (r) => `${r.distanceKm} km` }, { h: 'Map', v: (r) => <Badge tone={r.sourceCoords?.lat != null ? 'teal' : 'amber'}>{r.sourceCoords?.lat != null ? 'Yes' : 'No coords'}</Badge> }, { h: 'Active', v: (r) => <Button size="sm" variant="outline" onClick={() => toggleRoute(r)}>{r.isActive ? 'Disable' : 'Enable'}</Button> }]} />}</Card>
    <Modal open={modal === 'bus'} onClose={() => setModal(null)} title="Add a bus" wide><AddBus onClose={() => setModal(null)} onDone={() => { setModal(null); buses.reload(); }} /></Modal>
    <Modal open={modal === 'route'} onClose={() => setModal(null)} title="Add a route" wide><RouteForm cities={cities.data?.cities || []} onCancel={() => setModal(null)} onSaved={(r, msg) => { setModal(null); routes.reload(); toast.success(msg || 'Route created'); }} /></Modal>
  </div>);
}

const TABS = [['overview', 'Overview', Overview], ['operators', 'Operators', Operators], ['journeys', 'Journeys', Journeys], ['bookings', 'Bookings', Bookings], ['refunds', 'Refunds', Refunds], ['support', 'Complaints', Support], ['coupons', 'Offers', Coupons], ['users', 'Users', UsersTab], ['inventory', 'Buses & routes', Inventory]];

export default function AdminDashboard() {
  const [tab, setTab] = useState('overview');
  const stats = useFetch('/admin/stats');
  const badge = { operators: stats.data?.pendingOperators, refunds: stats.data?.pendingRefunds, support: stats.data?.openTickets };
  const Active = TABS.find((t) => t[0] === tab)[2];
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader title="Administration" subtitle="Platform health, approvals, refunds and journeys" />
      <Tabs tabs={TABS.map(([key, label]) => ({ key, label, count: badge[key] }))} value={tab} onChange={setTab} />
      <Card className="p-4 sm:p-5 bg-transparent ring-0 shadow-none !p-0"><Active /></Card>
    </div>
  );
}
