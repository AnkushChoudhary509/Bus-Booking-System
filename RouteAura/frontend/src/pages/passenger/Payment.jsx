import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck, CreditCard } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import useDraft from '../../hooks/useDraft';
import { Badge, Button, Card, ErrorState, Notice, SkeletonList } from '../../components/ui';
import { get, post, errMsg } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { fmtDateTime, inr } from '../../utils/format';

const loadRazorpay = () => new Promise((res, rej) => {
  if (window.Razorpay) return res();
  const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load Razorpay checkout')); document.body.appendChild(s);
});

export default function Payment() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [, setDraft] = useDraft();
  const bk = useFetch(`/bookings/${id}`);
  const cfg = useFetch('/payments/config');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const b = bk.data?.booking;

  useEffect(() => { if (b && ['confirmed', 'completed'].includes(b.status)) nav(`/booking/${id}`, { replace: true }); }, [b, id, nav]);

  const done = () => { setDraft(null); toast.success('Payment verified. Your booking is confirmed!'); nav(`/booking/${id}`, { replace: true }); };
  const fail = (e) => { setMsg(errMsg(e)); toast.error(errMsg(e)); if (e?.response?.status === 409) setTimeout(() => nav('/bookings'), 2500); };

  const startOrder = () => post('/payments/create-order', { bookingId: id });

  const payMock = async (outcome) => {
    setBusy(outcome); setMsg('');
    try {
      const o = await startOrder();
      await post('/payments/mock', { bookingId: id, outcome });
      done();
    } catch (e) { fail(e); } finally { setBusy(''); }
  };

  const payRazorpay = async () => {
    setBusy('razorpay'); setMsg('');
    try {
      const o = (await startOrder()).data;
      if (o.mode !== 'razorpay') throw new Error('Payment gateway not configured');
      await loadRazorpay();
      const rz = new window.Razorpay({
        key: o.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID, amount: Math.round(o.amount * 100), currency: o.currency || 'INR', order_id: o.orderId, name: 'RouteAura', description: `Booking ${o.bookingRef}`,
        theme: { color: '#0AA893' },
        handler: async (r) => { try { await post('/payments/verify', { bookingId: id, ...r }); done(); } catch (e) { fail(e); } finally { setBusy(''); } },
        modal: { ondismiss: () => { setBusy(''); post('/payments/fail', { bookingId: id }).catch(() => {}); } },
      });
      rz.on('payment.failed', () => { setMsg('Payment failed. You can try again.'); post('/payments/fail', { bookingId: id }).catch(() => {}); setBusy(''); });
      rz.open();
    } catch (e) { fail(e); setBusy(''); }
  };

  const free = async () => { setBusy('free'); try { const r = await startOrder(); if (r.data?.booking || r.data?.alreadyProcessed !== undefined) done(); else done(); } catch (e) { fail(e); } finally { setBusy(''); } };

  if (bk.loading || cfg.loading) return <div className="max-w-2xl mx-auto px-4 py-8"><SkeletonList n={2} /></div>;
  if (bk.error) return <div className="max-w-2xl mx-auto px-4 py-8"><ErrorState message={bk.error} onRetry={bk.reload} /></div>;
  if (b.status !== 'pending_payment') return <div className="max-w-2xl mx-auto px-4 py-8"><Notice>This booking is {b.status.replace('_', ' ')} and cannot be paid. <Link to="/bookings" className="underline font-semibold">My trips</Link></Notice></div>;

  const mock = cfg.data?.mode !== 'razorpay';
  const zero = b.fare.amountDue === 0;
  const j = b.journey;
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Payment</h1>
      <Card className="p-5 mb-5">
        <div className="flex justify-between"><div><div className="font-semibold">{j?.route?.source} → {j?.route?.destination}</div><div className="text-sm text-slate-aura">{fmtDateTime(j?.departure)} · Seats {b.seats.join(', ')}</div><div className="text-xs text-slate-aura mt-1">Ref {b.bookingRef}</div></div>
          <div className="text-right"><div className="text-xs text-slate-aura">Amount due</div><div className="font-display text-2xl font-bold">{inr(b.fare.amountDue)}</div></div></div>
        {b.fare.credit > 0 && <p className="text-xs text-slate-aura mt-2">Includes {inr(b.fare.credit)} credit from your original booking.</p>}
      </Card>
      <Card className="p-6">
        {zero ? (
          <><p className="text-sm mb-4">Nothing to pay. Your credit covers this booking.</p><Button size="lg" className="w-full" loading={busy === 'free'} onClick={free}>Confirm booking</Button></>
        ) : mock ? (
          <>
            <div className="flex items-center gap-2 mb-2"><Badge tone="amber">Mock gateway</Badge><span className="text-sm text-slate-aura">Demonstration only. No real money moves.</span></div>
            <p className="text-sm mb-5">Choose an outcome to simulate. Either way the server verifies the result before confirming anything.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Button size="lg" loading={busy === 'success'} disabled={!!busy} onClick={() => payMock('success')}><CreditCard className="h-4 w-4" />Pay {inr(b.fare.amountDue)}</Button>
              <Button size="lg" variant="outline" loading={busy === 'failure'} disabled={!!busy} onClick={() => payMock('failure')}>Simulate failure</Button>
            </div>
          </>
        ) : (
          <><div className="flex items-center gap-2 mb-4 text-sm text-slate-aura"><ShieldCheck className="h-4 w-4 text-teal-dark" />Secure checkout by Razorpay (test mode). We never see or store card details.</div>
            <Button size="lg" className="w-full" loading={busy === 'razorpay'} onClick={payRazorpay}>Pay {inr(b.fare.amountDue)} with Razorpay</Button></>
        )}
        {msg && <Notice tone="coral" className="mt-4">{msg}</Notice>}
        <p className="text-xs text-slate-aura mt-4">Retrying is safe: duplicate attempts never create a second booking or charge.</p>
      </Card>
    </div>
  );
}
