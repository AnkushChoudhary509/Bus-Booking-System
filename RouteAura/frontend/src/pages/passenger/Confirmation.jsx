import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Tag } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import useDraft from '../../hooks/useDraft';
import LockTimer from '../../components/LockTimer';
import { Button, Card, Input, Notice, SkeletonList } from '../../components/ui';
import { post, errMsg } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { fmtDateTime, inr } from '../../utils/format';

export default function Confirmation() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useDraft();
  const jr = useFetch(`/journeys/${id}`);
  const [code, setCode] = useState(draft?.couponCode || '');
  const [coupon, setCoupon] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!draft || draft.journeyId !== id || !draft.passengers?.length) return <Navigate to={`/journey/${id}/seats`} replace />;
  const subtotal = Object.values(draft.seatPrices || {}).reduce((a, b) => a + (b || 0), 0);
  const discount = coupon?.discount || 0;

  const applyCoupon = async () => {
    if (!code.trim()) return;
    try { const r = await post('/coupons/validate', { code: code.trim(), amount: subtotal }); setCoupon(r.data); toast.success(`${r.data.code} applied`); setDraft({ ...draft, couponCode: r.data.code }); }
    catch (e) { setCoupon(null); toast.error(errMsg(e)); }
  };

  const proceed = async () => {
    setBusy(true);
    try {
      const body = { journeyId: id, seats: draft.seats, passengers: draft.passengers, idempotencyKey: draft.idempotencyKey, ...(draft.boardingPointId && { boardingPointId: draft.boardingPointId }), ...(draft.droppingPointId && { droppingPointId: draft.droppingPointId }), ...(coupon && { couponCode: coupon.code }), ...(draft.contactPhone && { contactPhone: draft.contactPhone }) };
      const r = await post('/bookings', body);
      nav(`/booking/${r.data.booking._id}/pay`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const j = jr.data?.journey;
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div><Link to={`/journey/${id}/boarding`} className="text-sm text-teal-dark font-semibold">← Edit details</Link><h1 className="text-2xl font-bold mt-1">Review your booking</h1></div>
        <LockTimer expiresAt={draft.lockExpiresAt} onExpire={() => { toast.error('Your seat hold expired.'); nav(`/journey/${id}/seats`); }} />
      </div>
      {jr.loading ? <SkeletonList n={2} /> : j && (
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-semibold text-lg">{j.route.source} → {j.route.destination}</h2>
            <p className="text-sm text-slate-aura">{j.operator.orgName} · {j.bus.type} · departs {fmtDateTime(j.departure)}</p>
            <ul className="mt-4 divide-y divide-slate-100 text-sm">{draft.passengers.map((p, i) => <li key={i} className="flex justify-between py-2.5"><span>{p.name} <span className="text-slate-aura">({p.age}, {p.gender})</span></span><span>Seat {draft.seats[i]} · <b>{inr(draft.seatPrices?.[draft.seats[i]])}</b></span></li>)}</ul>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold mb-3 flex items-center gap-2"><Tag className="h-4 w-4" />Coupon</h2>
            <div className="flex gap-2"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter code" aria-label="Coupon code" /><Button variant="outline" onClick={applyCoupon}>Apply</Button></div>
            {coupon && <p className="text-sm text-teal-dark mt-2">{coupon.description || coupon.code}: you save {inr(coupon.discount)}</p>}
          </Card>
          <Card className="p-5">
            <div className="space-y-2 text-sm"><div className="flex justify-between"><span>Seats</span><span>{inr(subtotal)}</span></div>{discount > 0 && <div className="flex justify-between text-teal-dark"><span>Discount</span><span>- {inr(discount)}</span></div>}</div>
            <div className="flex justify-between font-display text-xl font-bold border-t border-slate-100 mt-3 pt-3"><span>To pay</span><span>{inr(Math.max(0, subtotal - discount))}</span></div>
            <Notice tone="teal" className="mt-4 !text-xs">Your booking is confirmed only after payment is verified by our server.</Notice>
            <Button size="lg" className="w-full mt-4" loading={busy} onClick={proceed}>Proceed to payment</Button>
          </Card>
        </div>
      )}
    </div>
  );
}
