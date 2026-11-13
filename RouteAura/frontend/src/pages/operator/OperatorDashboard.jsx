import { Link } from 'react-router-dom';
import { Banknote, Ticket, Bus, CalendarClock, Gauge, Star } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { RevenueChart, BarsChart } from '../../components/Charts';
import { Button, Card, Empty, ErrorState, Notice, PageHeader, SkeletonList, StatCard, StatusPill } from '../../components/ui';
import { fmtDateTime, inr } from '../../utils/format';

export default function OperatorDashboard() {
  const { data, loading, error, reload } = useFetch('/operator/dashboard');
  const bk = useFetch('/operator/bookings');
  if (loading) return <div className="max-w-6xl mx-auto px-4 py-8"><SkeletonList n={3} /></div>;
  if (error) return <div className="max-w-6xl mx-auto px-4 py-8"><ErrorState message={error} onRetry={reload} /></div>;
  const s = data.summary;
  const approved = data.approvalStatus === 'approved';
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <PageHeader title="Operator overview" subtitle="Revenue, bookings and fleet at a glance" actions={<><Button as={Link} to="/operator/buses" variant="outline">Buses</Button><Button as={Link} to="/operator/journeys" disabled={!approved}>Journeys</Button></>} />
      {!approved && <Notice tone={data.approvalStatus === 'rejected' ? 'coral' : 'amber'}>{data.approvalStatus === 'rejected' ? `Your application was rejected${data.rejectionReason ? `: ${data.rejectionReason}` : '.'}` : 'Your application is awaiting administrator approval. You can browse, but you cannot add buses or publish journeys yet.'}</Notice>}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Banknote} label="Revenue" value={inr(s.revenue)} />
        <StatCard icon={Ticket} label="Bookings" value={s.bookings} sub={`${s.seatsSold} seats sold`} tone="blue" />
        <StatCard icon={Bus} label="Active buses" value={s.activeBuses} tone="navy" />
        <StatCard icon={CalendarClock} label="Upcoming journeys" value={s.upcomingJourneys} tone="amber" />
        <StatCard icon={Gauge} label="Upcoming occupancy" value={`${s.upcomingOccupancyPct}%`} />
        <StatCard icon={Star} label="Rating" value={s.rating.count ? s.rating.avg.toFixed(1) : '—'} sub={`${s.rating.count} review${s.rating.count === 1 ? '' : 's'}`} tone="amber" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="p-5"><h2 className="font-semibold mb-3">Revenue, last 30 days</h2><RevenueChart data={data.revenueByDay} /></Card>
        <Card className="p-5"><h2 className="font-semibold mb-3">Top routes</h2><BarsChart data={data.revenueByRoute} xKey="route" /></Card>
      </div>
      <Card className="p-5">
        <h2 className="font-semibold mb-3">Recent bookings</h2>
        {bk.loading ? <SkeletonList n={2} h="h-12" /> : !bk.data?.bookings?.length ? <Empty icon={Ticket} title="No bookings yet" text="Bookings on your journeys appear here." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]"><thead className="text-left text-slate-aura"><tr><th className="py-2 font-medium">Ref</th><th className="font-medium">Passenger</th><th className="font-medium">Route</th><th className="font-medium">Departure</th><th className="font-medium">Seats</th><th className="font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{bk.data.bookings.slice(0, 10).map((b) => <tr key={b._id}><td className="py-2.5 font-mono text-xs">{b.bookingRef}</td><td>{b.user?.name}</td><td>{b.journey?.route?.source} → {b.journey?.route?.destination}</td><td>{fmtDateTime(b.journey?.departure)}</td><td>{b.seats.join(', ')}</td><td><StatusPill status={b.status} /></td></tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
