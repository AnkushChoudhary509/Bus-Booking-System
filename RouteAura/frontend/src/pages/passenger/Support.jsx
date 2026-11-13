import { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { Button, Card, Empty, Field, Input, Notice, PageHeader, Select, SkeletonList, StatusPill, Textarea } from '../../components/ui';
import { post, errMsg } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { ago } from '../../utils/format';

const FAQ = [['How do seat holds work?', 'When you continue from seat selection, the seats are held for 10 minutes. If you do not pay in time they are released automatically.'], ['How do refunds work?', 'Refunds follow the cancellation policy shown on the journey. If the operator cancels, you get a full refund.'], ['What if my bus is cancelled?', 'You are notified and offered alternatives on the same route and day through Journey Rescue. Nothing changes without your confirmation.']];

export default function Support() {
  const { data, loading, reload } = useFetch('/support/mine');
  const toast = useToast();
  const [f, setF] = useState({ category: 'other', subject: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [reply, setReply] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await post('/support', f); toast.success('Request submitted. We will reply here.'); setF({ category: 'other', subject: '', message: '' }); reload(); } catch (x) { toast.error(errMsg(x)); } finally { setBusy(false); }
  };
  const send = async (id) => { if (!reply.trim()) return; try { await post(`/support/${id}/replies`, { message: reply }); setReply(''); reload(); } catch (x) { toast.error(errMsg(x)); } };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <PageHeader title="Customer support" subtitle="We usually reply within one working day (demo)" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold mb-4">New request</h2>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Topic"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['booking', 'payment', 'refund', 'journey', 'account', 'other'].map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</Select></Field>
              <Field label="Subject"><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required minLength={3} maxLength={120} /></Field>
              <Field label="How can we help?"><Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} required minLength={5} maxLength={1500} /></Field>
              <Button type="submit" loading={busy}><Send className="h-4 w-4" />Submit</Button>
            </form>
          </Card>
          <Card className="p-6"><h2 className="font-semibold mb-3">Quick answers</h2><div className="space-y-2">{FAQ.map(([q, a]) => <details key={q} className="group rounded-lg ring-1 ring-slate-200 p-3"><summary className="cursor-pointer font-medium text-sm">{q}</summary><p className="text-sm text-slate-aura mt-2">{a}</p></details>)}</div></Card>
        </div>
        <section>
          <h2 className="font-semibold mb-3">Your requests</h2>
          {loading ? <SkeletonList n={2} h="h-24" /> : !data?.tickets?.length ? <Card><Empty icon={MessageSquare} title="No requests yet" text="Your conversations with support appear here." /></Card> : (
            <div className="space-y-3">{data.tickets.map((t) => (
              <Card key={t._id} className="p-4">
                <button className="w-full text-left" onClick={() => setOpen(open === t._id ? null : t._id)}><div className="flex justify-between gap-2"><b>{t.subject}</b><StatusPill status={t.status} /></div><div className="text-xs text-slate-aura mt-1">{t.category} · {ago(t.updatedAt)}{t.booking && ` · ${t.booking.bookingRef}`}</div></button>
                {open === t._id && (
                  <div className="mt-4 space-y-3 text-sm"><div className="rounded-lg bg-slate-50 p-3">{t.message}</div>
                    {t.replies.map((r, i) => <div key={i} className={`rounded-lg p-3 ${r.authorRole === 'admin' ? 'bg-teal-aura/10' : 'bg-slate-50'}`}><div className="text-xs text-slate-aura mb-1 capitalize">{r.authorRole === 'admin' ? 'Support' : 'You'} · {ago(r.at)}</div>{r.message}</div>)}
                    {t.status !== 'resolved' ? <div className="flex gap-2"><Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply" aria-label="Reply" /><Button onClick={() => send(t._id)}>Send</Button></div> : <Notice tone="teal">Resolved. Reply to reopen.</Notice>}
                  </div>)}
              </Card>))}</div>
          )}
        </section>
      </div>
    </div>
  );
}
