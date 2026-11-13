import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, Printer, Radio, LifeBuoy, MapPin, Star } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import useSocketEvent from '../../hooks/useSocketEvent';
import { Badge, Button, Card, ErrorState, Field, Modal, Notice, SkeletonList, StatusPill, Textarea } from '../../components/ui';
import api, { post, errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fmtDate, fmtTime, fmtDateTime, inr } from '../../utils/format';

export default function Ticket() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(`/bookings/${id}`);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [rv, setRv] = useState({ rating: 5, comment: '' });
  const [reviewed, setReviewed] = useState(false);
  useSocketEvent('booking:update', (p) => { if (String(p?.bookingId) === id) reload(); });

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-8"><SkeletonList n={2} h="h-64" /></div>;
  if (error) return <div className="max-w-3xl mx-auto px-4 py-8"><ErrorState message={error} onRetry={reload} /></div>;
  const { booking: b, payment, qr, refundPercentIfCancelledNow: refundPct } = data;
  const j = b.journey;
  const mine = user?.role === 'passenger';
  const confirmed = b.status === 'confirmed';
  const past = j && new Date(j.arrival) < new Date();

  const download = async () => {
    try {
      const r = await api.get(`/bookings/${id}/ticket.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = `RouteAura-${b.bookingRef}.pdf`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const cancel = async () => {
    setBusy(true);
    try { const r = await post(`/bookings/${id}/cancel`, { reason: reason || undefined }); toast.success(`Cancelled. Refund: ${inr(r.data.refundAmount)}`); setCancelOpen(false); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const review = async () => {
    try { await post('/reviews', { bookingId: id, ...rv }); setReviewed(true); toast.success('Thanks for your review!'); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      {b.rescueStatus === 'offered' && mine && confirmed && (
        <Notice className="flex flex-wrap items-center justify-between gap-3"><span><b>Your journey was disrupted.</b> {b.rescueReason || 'See alternatives.'} Your booking stays valid until you decide.</span><Button as={Link} to={`/booking/${id}/rescue`} size="sm" variant="dark"><LifeBuoy className="h-4 w-4" />See options</Button></Notice>
      )}
      <Card className="overflow-hidden">
        <div className="bg-midnight text-white p-6 flex flex-wrap justify-between gap-4">
          <div><div className="text-xs text-slate-400">Digital ticket</div><div className="font-display text-2xl font-bold mt-1">{j?.route?.source} → {j?.route?.destination}</div><div className="text-slate-300 text-sm mt-1">{b.operator?.orgName} · {j?.bus?.name} · {j?.bus?.type}</div></div>
          <div className="text-right"><StatusPill status={b.status} /><div className="font-mono text-lg mt-2 text-teal-aura">{b.bookingRef}</div></div>
        </div>
        <div className="p-6 grid gap-6 sm:grid-cols-[1fr_auto]">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-slate-aura">Date</div><b>{fmtDate(j?.departure)}</b></div>
              <div><div className="text-slate-aura">Departure</div><b>{fmtTime(j?.departure)}</b>{j?.delayMin > 0 && <span className="text-[#9a6200]"> (+{j.delayMin} min)</span>}</div>
              <div><div className="text-slate-aura">Seats</div><b>{b.seats.join(', ')}</b></div>
              <div><div className="text-slate-aura">Paid</div><b>{inr(b.fare.seatTotal - b.fare.discount)}</b> {payment && <StatusPill status={b.paymentStatus} />}</div>
            </div>
            <div className="text-sm space-y-2">
              {b.boardingPoint && <div className="flex gap-2"><MapPin className="h-4 w-4 mt-0.5 text-teal-dark shrink-0" /><div><b>Board:</b> {b.boardingPoint.name}<div className="text-xs text-slate-aura">{b.boardingPoint.landmark} {b.boardingPoint.instructions && `· ${b.boardingPoint.instructions}`}</div></div></div>}
              {b.droppingPoint && <div className="flex gap-2"><MapPin className="h-4 w-4 mt-0.5 text-coral-aura shrink-0" /><div><b>Drop:</b> {b.droppingPoint.name}</div></div>}
            </div>
            <div><div className="text-xs font-semibold text-slate-aura uppercase tracking-wide mb-1">Passengers</div><ul className="text-sm space-y-0.5">{b.passengers.map((p, i) => <li key={i}>{p.name} <span className="text-slate-aura">({p.age}, {p.gender}) · Seat {p.seatNumber}</span></li>)}</ul></div>
          </div>
          <div className="text-center">
            {qr ? <><img src={qr} alt={`QR code for ticket ${b.bookingRef}`} className="h-40 w-40 mx-auto rounded-lg ring-1 ring-slate-200" /><p className="text-xs text-slate-aura mt-2">Show this at boarding</p></> : <div className="h-40 w-40 rounded-lg bg-slate-100 grid place-items-center text-xs text-slate-aura p-4">QR appears once the booking is confirmed</div>}
            {b.checkedInAt && <Badge tone="teal" className="mt-2">Checked in {fmtTime(b.checkedInAt)}</Badge>}
          </div>
        </div>
        {payment?.refundStatus && payment.refundStatus !== 'none' && <div className="px-6 pb-5"><Notice tone="teal">Refund {payment.refundStatus.replace('_', ' ')}{payment.refundAmount ? `: ${inr(payment.refundAmount)}` : ''}</Notice></div>}
        <div className="border-t border-slate-100 p-4 flex flex-wrap gap-2 no-print">
          {['confirmed', 'completed'].includes(b.status) && <Button variant="outline" size="sm" onClick={download}><Download className="h-4 w-4" />PDF ticket</Button>}
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
          {j && <Button as={Link} to={`/journey/${j._id}/tracking`} variant="outline" size="sm"><Radio className="h-4 w-4" />Journey status</Button>}
          {b.status === 'pending_payment' && mine && <Button as={Link} to={`/booking/${id}/pay`} size="sm">Complete payment</Button>}
          {(confirmed || b.status === 'pending_payment') && mine && !past && <Button variant="danger" size="sm" className="ml-auto" onClick={() => setCancelOpen(true)}>{confirmed ? 'Cancel booking' : 'Abandon'}</Button>}
        </div>
      </Card>

      {mine && (b.status === 'completed' || (confirmed && past)) && !reviewed && (
        <Card className="p-5"><h2 className="font-semibold mb-3 flex items-center gap-2"><Star className="h-4 w-4 text-amber-aura" />How was your journey?</h2>
          <div className="flex gap-1 mb-3" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={rv.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRv({ ...rv, rating: n })} className={`text-3xl leading-none ${n <= rv.rating ? 'text-amber-aura' : 'text-slate-300'}`}>★</button>)}</div>
          <Textarea value={rv.comment} onChange={(e) => setRv({ ...rv, comment: e.target.value })} placeholder="Optional comment" maxLength={500} />
          <Button className="mt-3" onClick={review}>Submit review</Button></Card>
      )}

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={confirmed ? 'Cancel this booking?' : 'Abandon this booking?'}>
        {confirmed && <p className="text-sm mb-3">If you cancel now you will receive a <b>{refundPct}% refund</b> ({inr(((b.fare.seatTotal - b.fare.discount) * (refundPct || 0)) / 100)}) based on the cancellation policy. This cannot be undone.</p>}
        {confirmed && <Field label="Reason (optional)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></Field>}
        <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setCancelOpen(false)}>Keep booking</Button><Button variant="danger" loading={busy} onClick={cancel}>Yes, cancel</Button></div>
      </Modal>
    </div>
  );
}
