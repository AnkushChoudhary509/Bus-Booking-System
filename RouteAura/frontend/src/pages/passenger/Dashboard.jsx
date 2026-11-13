import { Link } from 'react-router-dom';
import { Plane, Route as RouteIcon, Star, Ticket, LifeBuoy, Heart } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import SearchForm from '../../components/SearchForm';
import { Badge, Button, Card, Empty, SkeletonList, StatCard, StatusPill } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { fmtDateTime } from '../../utils/format';

export default function Dashboard() {
  const { user } = useAuth();
  const pp = useFetch('/users/me/passport');
  const bk = useFetch('/bookings/mine');
  const s = pp.data?.stats;
  const upcoming = (bk.data?.bookings || []).filter((b) => b.status === 'confirmed' && new Date(b.journey?.arrival) > new Date()).sort((a, b) => new Date(a.journey.departure) - new Date(b.journey.departure));
  const pending = (bk.data?.bookings || []).filter((b) => b.status === 'pending_payment');
  const rescue = (bk.data?.bookings || []).filter((b) => b.rescueStatus === 'offered' && b.status === 'confirmed');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div><h1 className="text-3xl font-bold">Hello, {user.name.split(' ')[0]}</h1><p className="text-slate-aura mt-1">Where are you heading next?</p></div>
      <SearchForm />
      {rescue.map((b) => (
        <Card key={b._id} className="p-4 bg-amber-aura/10 ring-amber-aura/40 flex flex-wrap items-center justify-between gap-3"><div className="text-sm"><b>Journey disrupted:</b> {b.journey?.route?.source} → {b.journey?.route?.destination}. Review your options.</div><Button as={Link} to={`/booking/${b._id}/rescue`} size="sm" variant="dark"><LifeBuoy className="h-4 w-4" />Rescue options</Button></Card>
      ))}
      {pending.length > 0 && <Card className="p-4 bg-teal-aura/10 flex flex-wrap items-center justify-between gap-3"><span className="text-sm">You have {pending.length} booking{pending.length > 1 ? 's' : ''} awaiting payment.</span><Button as={Link} to={`/booking/${pending[0]._id}/pay`} size="sm">Complete payment</Button></Card>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Plane} label="Journeys completed" value={s?.totalJourneys ?? '—'} />
        <StatCard icon={RouteIcon} label="Distance travelled" value={s ? `${Math.round(s.totalDistanceKm).toLocaleString('en-IN')} km` : '—'} tone="blue" />
        <StatCard icon={Ticket} label="Upcoming trips" value={s?.upcomingJourneys ?? '—'} tone="amber" />
        <StatCard icon={Star} label="Loyalty points" value={s?.loyaltyPoints ?? '—'} sub={s ? `${s.tier} tier` : ''} tone="navy" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section>
          <div className="flex justify-between items-center mb-3"><h2 className="font-semibold text-lg">Upcoming trips</h2><Link to="/bookings" className="text-sm font-semibold text-teal-dark">All trips</Link></div>
          {bk.loading ? <SkeletonList n={2} h="h-24" /> : !upcoming.length ? <Card><Empty icon={Ticket} title="No upcoming trips" text="Book a bus and it will show up here." action={<Button as={Link} to="/search">Find a bus</Button>} /></Card> : (
            <div className="space-y-3">{upcoming.slice(0, 4).map((b) => (
              <Link key={b._id} to={`/booking/${b._id}`}><Card className="p-4 hover:shadow-md transition-shadow flex flex-wrap justify-between gap-2"><div><div className="font-semibold">{b.journey.route.source} → {b.journey.route.destination}</div><div className="text-sm text-slate-aura">{fmtDateTime(b.journey.departure)} · Seats {b.seats.join(', ')}</div></div><div className="flex items-center gap-2">{b.journey.status !== 'scheduled' && <StatusPill status={b.journey.status} />}<Badge tone="teal">{b.operator?.orgName}</Badge></div></Card></Link>
            ))}</div>
          )}
        </section>
        <aside>
          <h2 className="font-semibold text-lg mb-3 flex items-center gap-2"><Heart className="h-4 w-4" />Saved routes</h2>
          <Card className="p-4">{!pp.data?.savedRoutes?.length ? <p className="text-sm text-slate-aura">Save routes from your Travel Passport for one-tap searches.</p> : <ul className="divide-y divide-slate-100 text-sm">{pp.data.savedRoutes.map((r) => <li key={r._id || r.source + r.destination}><Link className="block py-2.5 hover:text-teal-dark" to={`/search?source=${r.source}&destination=${r.destination}&date=${new Date(Date.now() + 330 * 60000 + 86400000).toISOString().slice(0, 10)}`}>{r.source} → {r.destination}</Link></li>)}</ul>}</Card>
        </aside>
      </div>
    </div>
  );
}
