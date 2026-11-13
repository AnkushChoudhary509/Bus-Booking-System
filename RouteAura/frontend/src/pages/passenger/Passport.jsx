import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Trophy, Trash2, Plus, Globe2, Compass } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { Badge, Button, Card, Empty, ErrorState, Input, PageHeader, SkeletonList, StatCard, cx } from '../../components/ui';
import { post, del, errMsg } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { fmtShortDate } from '../../utils/format';

const TIER_TONE = { Bronze: 'amber', Silver: 'slate', Gold: 'teal' };

export default function Passport() {
  const { data, loading, error, reload } = useFetch('/users/me/passport');
  const toast = useToast();
  const [fav, setFav] = useState({ source: '', destination: '' });
  if (loading) return <div className="max-w-5xl mx-auto px-4 py-8"><SkeletonList n={3} /></div>;
  if (error) return <div className="max-w-5xl mx-auto px-4 py-8"><ErrorState message={error} onRetry={reload} /></div>;
  const s = data.stats;
  const next = s.nextTierAt;
  const pct = next ? Math.min(100, Math.round((s.loyaltyPoints / next) * 100)) : 100;

  const add = async (e) => { e.preventDefault(); try { await post('/users/me/favorites', fav); setFav({ source: '', destination: '' }); toast.success('Route saved'); reload(); } catch (x) { toast.error(errMsg(x)); } };
  const remove = async (id) => { try { await del(`/users/me/favorites/${id}`); reload(); } catch (x) { toast.error(errMsg(x)); } };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <PageHeader title="Travel Passport" subtitle="Your journeys, distance and rewards" />
      <Card className="overflow-hidden">
        <div className="bg-midnight text-white p-6 sm:p-8 grid gap-6 sm:grid-cols-[1fr_auto] items-center">
          <div><div className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-teal-aura" /><span className="text-sm text-slate-300">RouteAura Passport</span></div>
            <div className="font-display text-3xl font-bold mt-2">{s.totalJourneys} journeys · {Math.round(s.totalDistanceKm).toLocaleString('en-IN')} km</div>
            <div className="text-slate-300 text-sm mt-1">{s.citiesVisited} cities reached{s.topRoute && ` · favourite route ${s.topRoute.route} (${s.topRoute.trips}x)`}</div></div>
          <div className="sm:text-right"><Badge tone={TIER_TONE[s.tier]} className="!text-sm">{s.tier} tier</Badge><div className="font-display text-3xl font-bold text-teal-aura mt-2">{s.loyaltyPoints} pts</div></div>
        </div>
        <div className="p-5"><div className="flex justify-between text-xs text-slate-aura mb-1.5"><span>{next ? `${next - s.loyaltyPoints} points to next tier` : 'Top tier reached'}</span><span>{pct}%</span></div><div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-aura transition-all" style={{ width: `${pct}%` }} /></div><p className="text-xs text-slate-aura mt-3">{data.notes.points} {data.notes.distance}</p></div>
      </Card>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Completed" value={s.totalJourneys} icon={Trophy} />
        <StatCard label="Upcoming" value={s.upcomingJourneys} icon={Compass} tone="amber" />
        <StatCard label="Cancelled" value={s.cancelledBookings} tone="coral" />
        <StatCard label="Cities visited" value={s.citiesVisited} tone="blue" icon={Globe2} />
      </div>

      <section>
        <h2 className="font-semibold text-lg mb-3">Achievements</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.achievements.map((a) => (
            <Card key={a.key} className={cx('p-5', !a.earned && 'opacity-75')}>
              <div className="flex items-start gap-3"><div className={cx('h-11 w-11 rounded-xl grid place-items-center shrink-0', a.earned ? 'bg-amber-aura/20 text-[#9a6200]' : 'bg-slate-100 text-slate-400')}><Award className="h-5 w-5" /></div>
                <div className="flex-1"><div className="flex justify-between gap-2"><h3 className="font-semibold">{a.title}</h3>{a.earned && <Badge tone="teal">Earned</Badge>}</div><p className="text-sm text-slate-aura">{a.description}</p>
                  <div className="h-1.5 rounded-full bg-slate-100 mt-3"><div className="h-full rounded-full bg-teal-aura" style={{ width: `${(a.progress / a.target) * 100}%` }} /></div><div className="text-xs text-slate-aura mt-1">{a.progress} / {a.target}</div></div></div>
            </Card>))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section><h2 className="font-semibold text-lg mb-3">Journey log</h2>
          <Card>{!data.completed.length ? <Empty title="No completed journeys yet" text="Finished trips are stamped here." action={<Button as={Link} to="/search">Book a trip</Button>} /> : <ul className="divide-y divide-slate-100">{data.completed.map((b) => <li key={b._id}><Link to={`/booking/${b._id}`} className="flex justify-between gap-3 p-4 text-sm hover:bg-slate-50"><span className="font-medium">{b.source} → {b.destination}</span><span className="text-slate-aura">{b.distanceKm} km · {fmtShortDate(b.departure)}</span></Link></li>)}</ul>}</Card></section>
        <section><h2 className="font-semibold text-lg mb-3">Saved routes</h2>
          <Card className="p-4">
            <form onSubmit={add} className="flex gap-2 mb-3"><Input placeholder="From" aria-label="From city" value={fav.source} onChange={(e) => setFav({ ...fav, source: e.target.value })} required /><Input placeholder="To" aria-label="To city" value={fav.destination} onChange={(e) => setFav({ ...fav, destination: e.target.value })} required /><Button type="submit" aria-label="Save route"><Plus className="h-4 w-4" /></Button></form>
            {!data.savedRoutes.length ? <p className="text-sm text-slate-aura">No saved routes yet.</p> : <ul className="divide-y divide-slate-100">{data.savedRoutes.map((r) => <li key={r._id} className="flex items-center justify-between py-2.5 text-sm"><Link className="hover:text-teal-dark" to={`/search?source=${r.source}&destination=${r.destination}&date=${new Date(Date.now() + 330 * 60000 + 86400000).toISOString().slice(0, 10)}`}>{r.source} → {r.destination}</Link><button onClick={() => remove(r._id)} aria-label={`Remove ${r.source} to ${r.destination}`} className="p-1.5 text-slate-aura hover:text-coral-aura"><Trash2 className="h-4 w-4" /></button></li>)}</ul>}
          </Card></section>
      </div>
    </div>
  );
}
