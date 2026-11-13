import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket as TicketIcon, LifeBuoy } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { Button, Card, Empty, ErrorState, PageHeader, SkeletonList, StatusPill, Tabs } from '../../components/ui';
import { fmtDateTime, inr } from '../../utils/format';

const TABS = [['all', 'All'], ['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];

export default function History() {
  const { data, loading, error, reload } = useFetch('/bookings/mine');
  const [tab, setTab] = useState('all');
  const now = Date.now();
  const list = (data?.bookings || []).filter((b) => {
    const done = b.status === 'completed' || (b.status === 'confirmed' && new Date(b.journey?.arrival) < now);
    if (tab === 'upcoming') return b.status === 'confirmed' && !done;
    if (tab === 'completed') return done;
    if (tab === 'cancelled') return ['cancelled', 'replaced', 'expired'].includes(b.status);
    return true;
  });
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <PageHeader title="My trips" subtitle="Bookings, tickets and refunds" actions={<Button as={Link} to="/search">Book a trip</Button>} />
      <Tabs tabs={TABS.map(([key, label]) => ({ key, label }))} value={tab} onChange={setTab} />
      {loading ? <SkeletonList n={3} /> : error ? <ErrorState message={error} onRetry={reload} /> : !list.length ? <Card><Empty icon={TicketIcon} title="No trips here yet" text="Your bookings will appear here." action={<Button as={Link} to="/search">Search buses</Button>} /></Card> : (
        <div className="space-y-3">{list.map((b) => (
          <Card key={b._id} className="p-5 hover:shadow-md transition-shadow">
            <div className="flex flex-wrap justify-between gap-3">
              <div><Link to={`/booking/${b._id}`} className="font-semibold text-lg hover:text-teal-dark">{b.journey?.route?.source} → {b.journey?.route?.destination}</Link>
                <div className="text-sm text-slate-aura">{fmtDateTime(b.journey?.departure)} · Seats {b.seats.join(', ')} · {b.operator?.orgName}</div>
                <div className="text-xs font-mono text-slate-aura mt-1">{b.bookingRef}</div></div>
              <div className="text-right space-y-1"><StatusPill status={b.status} /><div className="font-semibold">{inr(b.fare.seatTotal - b.fare.discount)}</div>{b.payment?.refundStatus && b.payment.refundStatus !== 'none' && <div className="text-xs text-slate-aura">Refund {b.payment.refundStatus.replace('_', ' ')}</div>}</div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button as={Link} to={`/booking/${b._id}`} variant="outline" size="sm">View ticket</Button>
              {b.status === 'pending_payment' && <Button as={Link} to={`/booking/${b._id}/pay`} size="sm">Pay now</Button>}
              {b.rescueStatus === 'offered' && b.status === 'confirmed' && <Button as={Link} to={`/booking/${b._id}/rescue`} size="sm" variant="dark"><LifeBuoy className="h-4 w-4" />Rescue options</Button>}
            </div>
          </Card>))}</div>
      )}
    </div>
  );
}
