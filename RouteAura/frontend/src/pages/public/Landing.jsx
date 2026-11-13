import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Armchair, Scale, LifeBuoy, MapPinned, Radio, BookUser, Search, CreditCard, Ticket, ArrowRight, Quote } from 'lucide-react';
import SearchForm from '../../components/SearchForm';
import { Button, Card, Badge, SkeletonList, Skeleton } from '../../components/ui';
import useFetch from '../../hooks/useFetch';
import { inr, fmtDuration } from '../../utils/format';

const FEATURES = [
  { icon: Armchair, title: 'Comfort seat picks', text: 'Tell us window or aisle, legroom, calmer ride. We rank free seats with a transparent score.' },
  { icon: Scale, title: 'Fare Intelligence', text: 'Compare buses on price, time, amenities and ratings with weights you control.' },
  { icon: LifeBuoy, title: 'Journey Rescue', text: 'If a bus is cancelled or badly delayed, see alternatives. Nothing changes without your say-so.' },
  { icon: MapPinned, title: 'Smart boarding points', text: 'Pickup times, landmarks and a convenience score for every boarding and dropping point.' },
  { icon: Radio, title: 'Journey Health', text: 'Live status, delay and progress updates. Demo tracking is simulated and labelled as such.' },
  { icon: BookUser, title: 'Travel Passport', text: 'Your trips, distance, loyalty points and achievements in one place.' },
];
const STEPS = [
  { icon: Search, t: 'Search', d: 'Pick cities and a date. Filter and compare.' },
  { icon: Armchair, t: 'Choose seats', d: 'Set preferences and get recommendations. Seats are held for you.' },
  { icon: CreditCard, t: 'Pay securely', d: 'Payment is verified on the server before anything is confirmed.' },
  { icon: Ticket, t: 'Travel', d: 'Show your QR ticket and follow journey status live.' },
];
const DESTINATIONS = [['Jaipur', 'Rajasthan'], ['Amritsar', 'Punjab'], ['Pune', 'Maharashtra'], ['Chandigarh', 'Chandigarh'], ['Bengaluru', 'Karnataka'], ['Kolkata', 'West Bengal'], ['Ahmedabad', 'Gujarat'], ['Hyderabad', 'Telangana']];
const TESTIMONIALS = [
  { n: 'Demo Passenger A', q: 'Picking a window seat with extra legroom took two clicks.', r: 'Delhi to Jaipur' },
  { n: 'Demo Passenger B', q: 'My bus was cancelled and I could see other options straight away.', r: 'Mumbai to Pune' },
  { n: 'Demo Passenger C', q: 'The comparison told me why one bus was better value, not just that it was.', r: 'Jalandhar to Delhi' },
];

export default function Landing() {
  const { data, loading } = useFetch('/routes/featured');
  return (
    <>
      <section className="bg-midnight text-white relative">
        <svg className="absolute inset-0 w-full h-full opacity-[0.07] [clip-path:inset(0)]" aria-hidden="true"><defs><pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="#14E0C3" /></pattern></defs><rect width="100%" height="100%" fill="url(#dots)" /></svg>
        <div className="relative max-w-7xl mx-auto px-4 pt-16 pb-24 sm:pt-24 sm:pb-32">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-3xl">
            <Badge tone="teal" className="mb-5">Intelligent bus travel</Badge>
            <h1 className="text-4xl sm:text-6xl font-bold leading-[1.05]">Travel with <span className="text-teal-aura">confidence</span>, not guesswork.</h1>
            <p className="mt-5 text-lg text-slate-300 max-w-2xl">RouteAura helps you choose a bus on comfort, convenience and reliability, not just price, then looks after you if plans change.</p>
          </motion.div>
          <div className="mt-10 -mb-32 sm:-mb-40 relative"><SearchForm dark /></div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 pt-40 sm:pt-48 pb-16">
        <div className="flex items-end justify-between mb-6"><h2 className="text-2xl font-bold">Featured routes</h2><Link to="/search" className="text-sm font-semibold text-teal-dark inline-flex items-center gap-1">All routes <ArrowRight className="h-4 w-4" /></Link></div>
        {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(data?.routes || []).slice(0, 8).map((r) => (
              <Link key={r._id} to={`/search?source=${encodeURIComponent(r.source)}&destination=${encodeURIComponent(r.destination)}&date=${new Date(Date.now() + 330 * 60000 + 86400000).toISOString().slice(0, 10)}`}>
                <Card className="p-5 h-full hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="font-semibold">{r.source}</div><div className="text-slate-aura text-sm">to {r.destination}</div>
                  <div className="mt-4 flex items-end justify-between"><span className="text-xs text-slate-aura">{r.distanceKm} km · {fmtDuration(r.durationMin)}</span><span className="font-display font-bold text-lg">{inr(r.startingFare)}<span className="text-xs font-normal text-slate-aura"> from</span></span></div>
                </Card>
              </Link>
            ))}
            {!data?.routes?.length && <p className="text-slate-aura sm:col-span-4">Featured routes appear here once journeys are published. Run the seed script to load demo data.</p>}
          </div>
        )}
      </div>

      <section className="max-w-7xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold mb-6">Popular destinations</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {DESTINATIONS.map(([c, s], i) => (
            <Link key={c} to={`/search?destination=${c}&source=Delhi`} className="group relative overflow-hidden rounded-2xl h-28 p-4 flex flex-col justify-end text-white" style={{ background: `linear-gradient(135deg, #0B1426, ${['#0AA893', '#14203A', '#1d4e5f', '#233a63'][i % 4]})` }}>
              <span className="font-display font-semibold text-lg group-hover:translate-x-0.5 transition-transform">{c}</span><span className="text-xs text-slate-300">{s}</span>
            </Link>
          ))}
        </div>
      </section>

      <section id="how" className="bg-white border-y border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-bold mb-8">How RouteAura works</h2>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.t} className="relative"><div className="h-11 w-11 rounded-xl bg-midnight text-teal-aura grid place-items-center mb-3"><s.icon className="h-5 w-5" /></div><div className="text-xs font-semibold text-teal-dark mb-1">Step {i + 1}</div><h3 className="font-semibold">{s.t}</h3><p className="text-sm text-slate-aura mt-1">{s.d}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="max-w-7xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold mb-2">Built different</h2>
        <p className="text-slate-aura mb-8 max-w-2xl">Where we estimate something (comfort, reliability, tracking), we say so in the interface.</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-6 hover:shadow-md transition-shadow"><div className="h-11 w-11 rounded-xl bg-teal-aura/15 text-teal-dark grid place-items-center mb-4"><f.icon className="h-5 w-5" /></div><h3 className="font-semibold text-lg">{f.title}</h3><p className="text-sm text-slate-aura mt-2">{f.text}</p></Card>
          ))}
        </div>
      </section>

      <section className="bg-midnight py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-8"><h2 className="text-2xl font-bold text-white">What travellers say</h2><Badge tone="amber">Demonstration content</Badge></div>
          <div className="grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div key={t.n} className="rounded-2xl bg-midnight-2 p-6 text-slate-200"><Quote className="h-6 w-6 text-teal-aura mb-3" /><p>{t.q}</p><div className="mt-4 text-sm"><span className="font-semibold text-white">{t.n}</span><span className="text-slate-400"> · {t.r}</span></div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-bold">Ready for a calmer journey?</h2>
        <div className="mt-6 flex justify-center gap-3"><Button as={Link} to="/search" size="lg">Find a bus</Button><Button as={Link} to="/register?role=operator" variant="outline" size="lg">List your buses</Button></div>
      </section>
    </>
  );
}
