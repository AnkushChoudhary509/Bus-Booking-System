import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import SeatMap, { SeatLegend } from '../../components/SeatMap';
import { Badge, Button, Card, Empty, ErrorState, Modal, Notice, SkeletonList } from '../../components/ui';
import { post, errMsg } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { fmtDateTime, fmtTime, inr, uid } from '../../utils/format';

function SeatPick({ opt, need, onDone, onClose }) {
  const sm = useFetch(`/journeys/${opt.journeyId}/seats`);
  const [sel, setSel] = useState([]);
  const toast = useToast();
  const toggle = (s) => setSel((c) => (c.includes(s.number) ? c.filter((x) => x !== s.number) : c.length >= need ? (toast.info(`Select ${need} seat(s)`), c) : [...c, s.number]));
  const total = sel.reduce((a, n) => a + (sm.data?.seats.find((s) => s.number === n)?.price || 0), 0);
  return (
    <div>
      {sm.loading ? <SkeletonList n={1} h="h-60" /> : sm.error ? <ErrorState message={sm.error} onRetry={sm.reload} /> : <SeatMap seats={sm.data.seats} layoutType={sm.data.layoutType} selected={sel} onToggle={toggle} />}
      <div className="mt-4"><SeatLegend /></div>
      <div className="flex flex-wrap justify-between items-center gap-3 mt-5"><span className="text-sm">Select {need} seat{need > 1 ? 's' : ''} · {sel.length} chosen · {inr(total)}</span>
        <div className="flex gap-2"><Button variant="outline" onClick={onClose}>Back</Button><Button disabled={sel.length !== need} onClick={() => onDone(sel)}>Continue</Button></div></div>
    </div>
  );
}

export default function Rescue() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(`/bookings/${id}/rescue-options`);
  const bk = useFetch(`/bookings/${id}`);
  const [pick, setPick] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: 'replace'|'cancel', opt?, seats? }
  const [busy, setBusy] = useState(false);
  const need = bk.data?.booking?.seats?.length || 1;

  const submit = async () => {
    setBusy(true);
    try {
      const body = confirm.type === 'cancel' ? { action: 'cancel' } : { action: 'replace', journeyId: confirm.opt.journeyId, seats: confirm.seats, idempotencyKey: uid() };
      const r = (await post(`/bookings/${id}/rescue/confirm`, body)).data;
      if (confirm.type === 'cancel') { toast.success('Booking cancelled with a full refund.'); nav(`/booking/${id}`); }
      else if (r.needsPayment) { toast.info(`Pay ${inr(r.booking.fare.amountDue)} to confirm your replacement.`); nav(`/booking/${r.booking._id}/pay`); }
      else { toast.success('Replacement confirmed!'); nav(`/booking/${r.booking._id}`); }
    } catch (e) { toast.error(errMsg(e)); setConfirm(null); reload(); } finally { setBusy(false); }
  };

  if (loading || bk.loading) return <div className="max-w-4xl mx-auto px-4 py-8"><SkeletonList n={3} /></div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-8"><ErrorState message={error} onRetry={reload} /><div className="mt-4"><Button as={Link} to={`/booking/${id}`} variant="outline">Back to ticket</Button></div></div>;
  const o = data.original;
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><LifeBuoy className="h-6 w-6 text-teal-dark" />Journey Rescue</h1>
        <p className="text-slate-aura mt-1">{o.route.source} → {o.route.destination} is {o.status}{o.delayMin ? ` (delayed ${o.delayMin} min)` : ''}. Nothing changes and nothing is charged until you confirm below.</p></div>
      <Notice tone="teal">Your original booking stays valid until you confirm a replacement or a cancellation. You paid {inr(data.paidValue)}.</Notice>

      <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
        <div><div className="font-semibold">Cancel and get a full refund</div><div className="text-sm text-slate-aura">The operator caused this disruption, so you get 100% back.</div></div>
        <Button variant="danger" onClick={() => setConfirm({ type: 'cancel' })}>Cancel with full refund</Button>
      </Card>

      <h2 className="font-semibold text-lg pt-2">Alternative journeys, same route and day</h2>
      {!data.options.length ? <Card><Empty icon={LifeBuoy} title="No alternatives with enough seats" text="Try the full refund option, or search another date." action={<Button as={Link} to="/search" variant="outline">Search buses</Button>} /></Card> : (
        <div className="space-y-3">{data.options.map((opt) => (
          <Card key={opt.journeyId} className="p-5 flex flex-wrap items-center justify-between gap-4">
            <div><div className="font-semibold">{opt.operator}</div><div className="text-sm text-slate-aura">{opt.bus?.name} · {opt.bus?.type}</div><div className="text-sm mt-1">{fmtDateTime(opt.departure)} → {fmtTime(opt.arrival)} · {opt.availableSeats} seats left</div></div>
            <div className="text-right"><div className="text-sm text-slate-aura">Estimated {inr(opt.estimatedTotal)}</div>{opt.extraFare > 0 ? <Badge tone="amber">Extra {inr(opt.extraFare)}</Badge> : <Badge tone="teal">{opt.refundDifference > 0 ? `${inr(opt.refundDifference)} difference` : 'No extra fare'}</Badge>}
              <div className="mt-3"><Button size="sm" onClick={() => setPick(opt)}>Choose seats</Button></div></div>
          </Card>))}</div>
      )}

      <Modal open={!!pick} onClose={() => setPick(null)} title={`Seats on ${pick?.operator || ''}`} wide>
        {pick && <SeatPick opt={pick} need={need} onClose={() => setPick(null)} onDone={(seats) => { setConfirm({ type: 'replace', opt: pick, seats }); setPick(null); }} />}
      </Modal>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Please confirm">
        {confirm?.type === 'cancel' ? <p className="text-sm">Your booking will be cancelled and {inr(data.paidValue)} refunded in full.</p> : <p className="text-sm">Switch to <b>{confirm?.opt?.operator}</b> departing {fmtDateTime(confirm?.opt?.departure)}, seats <b>{confirm?.seats?.join(', ')}</b>. {confirm?.opt?.extraFare > 0 ? `You will pay about ${inr(confirm.opt.extraFare)} more.` : 'No extra payment is expected.'} Your original booking is replaced only once this one is confirmed.</p>}
        <div className="flex justify-end gap-2 mt-5"><Button variant="outline" onClick={() => setConfirm(null)}>Go back</Button><Button variant={confirm?.type === 'cancel' ? 'danger' : 'primary'} loading={busy} onClick={submit}>Confirm</Button></div>
      </Modal>
    </div>
  );
}
