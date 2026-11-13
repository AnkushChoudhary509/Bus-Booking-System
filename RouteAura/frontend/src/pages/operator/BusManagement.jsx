import { useState } from 'react';
import { Plus, Pencil, Power } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { Amenities } from '../../components/BusCard';
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, SkeletonList, cx } from '../../components/ui';
import { patch, post, put, errMsg } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { cap } from '../../utils/format';

const blank = { name: '', regNo: '', type: 'AC Seater', layoutType: 'seater-2x2', amenities: [] };

export default function BusManagement() {
  const { operator } = useAuth();
  const { data, loading, error, reload } = useFetch('/buses');
  const meta = useFetch('/buses/meta');
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const approved = operator?.approvalStatus === 'approved';

  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { name: form.name, regNo: form.regNo.toUpperCase().replace(/\s/g, ''), type: form.type, layoutType: form.layoutType, amenities: form.amenities };
      form._id ? await put(`/buses/${form._id}`, body) : await post('/buses', body);
      toast.success(form._id ? 'Bus updated' : 'Bus added'); setForm(null); reload();
    } catch (x) { toast.error(errMsg(x)); } finally { setBusy(false); }
  };
  const toggle = async (b) => { try { await patch(`/buses/${b._id}/active?activate=${!b.isActive}`); reload(); } catch (x) { toast.error(errMsg(x)); } };
  const am = (a) => setForm({ ...form, amenities: form.amenities.includes(a) ? form.amenities.filter((x) => x !== a) : [...form.amenities, a] });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <PageHeader title="Buses" subtitle="Your fleet and seat layouts" actions={<Button disabled={!approved} onClick={() => setForm({ ...blank })}><Plus className="h-4 w-4" />Add bus</Button>} />
      {!approved && <Notice className="mb-4">Adding buses unlocks once an administrator approves your account.</Notice>}
      {loading ? <SkeletonList n={3} h="h-28" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data.buses.length ? <Card><Empty title="No buses yet" text="Add a bus, choose its seat layout, then publish journeys." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">{data.buses.map((b) => (
          <Card key={b._id} className={cx('p-5', !b.isActive && 'opacity-60')}>
            <div className="flex justify-between gap-2"><div><h3 className="font-semibold">{b.name}</h3><p className="text-sm text-slate-aura">{b.regNo} · {b.type}</p></div><Badge tone={b.isActive ? 'teal' : 'slate'}>{b.isActive ? 'Active' : 'Inactive'}</Badge></div>
            <p className="text-sm mt-3">{b.totalSeats} seats · {(meta.data?.layouts || []).find((l) => l.key === b.layoutType)?.label || b.layoutType}</p>
            <div className="mt-3"><Amenities list={b.amenities} max={6} /></div>
            <div className="flex gap-2 mt-4"><Button size="sm" variant="outline" onClick={() => setForm({ ...b })}><Pencil className="h-3.5 w-3.5" />Edit</Button><Button size="sm" variant="ghost" onClick={() => toggle(b)}><Power className="h-3.5 w-3.5" />{b.isActive ? 'Deactivate' : 'Activate'}</Button></div>
          </Card>))}</div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?._id ? 'Edit bus' : 'Add bus'}>
        {form && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Bus name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></Field>
            <Field label="Registration number" hint="e.g. PB08AB1234"><Input value={form.regNo} onChange={(e) => setForm({ ...form, regNo: e.target.value })} required minLength={5} maxLength={14} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bus type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{(meta.data?.types || []).map((t) => <option key={t}>{t}</option>)}</Select></Field>
              <Field label="Seat layout" hint={form._id ? 'Layout cannot change after creation' : undefined}><Select value={form.layoutType} disabled={!!form._id} onChange={(e) => setForm({ ...form, layoutType: e.target.value })}>{(meta.data?.layouts || []).map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</Select></Field>
            </div>
            <fieldset><legend className="text-sm font-medium mb-2">Amenities</legend><div className="grid grid-cols-2 gap-2">{(meta.data?.amenities || []).map((a) => <label key={a} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-teal-600" checked={form.amenities.includes(a)} onChange={() => am(a)} />{cap(a)}</label>)}</div></fieldset>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" loading={busy}>Save bus</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
