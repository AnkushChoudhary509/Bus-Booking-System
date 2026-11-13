import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, Scale, Bus, History } from 'lucide-react';
import SearchForm from '../../components/SearchForm';
import BusCard, { Amenities } from '../../components/BusCard';
import { Button, Card, Empty, Input, Modal, Notice, Select, SkeletonList, Badge, Field } from '../../components/ui';
import useFetch from '../../hooks/useFetch';
import { post, errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { fmtDateTime, fmtDuration, fmtShortDate, inr, cap } from '../../utils/format';
import { useToast } from '../../context/ToastContext';

const BUS_TYPES = ['AC Seater', 'Non-AC Seater', 'Semi-Sleeper', 'AC Sleeper', 'Volvo Multi-Axle'];
const AMEN = ['wifi', 'charging', 'water', 'blanket', 'reading-light', 'snacks', 'cctv', 'live-tracking'];
const WINDOWS = [['', 'Any time'], ['0-6', 'Early (12am-6am)'], ['6-12', 'Morning (6am-12pm)'], ['12-18', 'Afternoon (12pm-6pm)'], ['18-24', 'Evening (6pm-12am)']];

export default function SearchPage() {
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const source = sp.get('source') || '', destination = sp.get('destination') || '', date = sp.get('date') || '';
  const passengers = Number(sp.get('passengers') || 1);
  const ready = source && destination && date;

  const [flt, setFlt] = useState({ busType: '', maxFare: '', window: '', minRating: '', amenities: [], sort: 'recommended' });
  const [weights, setWeights] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [picked, setPicked] = useState([]);
  const [cmp, setCmp] = useState(null);
  const [cmpBusy, setCmpBusy] = useState(false);

  const params = useMemo(() => {
    const [a, b] = flt.window ? flt.window.split('-') : [];
    return {
      source, destination, date, passengers, sort: flt.sort,
      ...(flt.busType && { busType: flt.busType }), ...(flt.maxFare && { maxFare: flt.maxFare }), ...(flt.minRating && { minRating: flt.minRating }),
      ...(a !== undefined && { departureAfter: a, departureBefore: b }),
      ...(flt.amenities.length && { amenities: flt.amenities.join(',') }),
      ...(weights && { weights: JSON.stringify(weights) }),
    };
  }, [source, destination, date, passengers, flt, weights]);

  const { data, loading, error, reload } = useFetch('/journeys/search', params, { skip: !ready });
  const hist = useFetch('/users/me/search-history', undefined, { skip: !user });
  const defaults = data?.defaultWeights;
  const w = weights || data?.weights || defaults;

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? (toast.info('Compare up to 4 buses'), p) : [...p, id]));
  const runCompare = async () => {
    setCmpBusy(true);
    try { setCmp((await post('/journeys/compare', { journeyIds: picked, ...(weights && { weights }) })).data); } catch (e) { toast.error(errMsg(e)); } finally { setCmpBusy(false); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <SearchForm initial={{ source, destination, date, passengers }} />
      {!ready && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Empty icon={Bus} title="Where to next?" text="Enter your cities and date above to see buses." />
          {user && hist.data?.history?.length > 0 && (
            <Card className="p-5"><h3 className="font-semibold flex items-center gap-2 mb-3"><History className="h-4 w-4" />Recent searches</h3>
              <ul className="divide-y divide-slate-100">{hist.data.history.map((h, i) => <li key={i}><a className="flex justify-between py-2.5 text-sm hover:text-teal-dark" href={`/search?source=${h.source}&destination=${h.destination}&date=${h.date}`}><span>{h.source} → {h.destination}</span><span className="text-slate-aura">{h.date}</span></a></li>)}</ul></Card>
          )}
        </div>
      )}

      {ready && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[17rem_1fr]">
          <aside className={`${showFilters ? 'block' : 'hidden'} lg:block`}>
            <Card className="p-5 space-y-4 lg:sticky lg:top-20">
              <h2 className="font-semibold">Filters</h2>
              <Field label="Sort by"><Select value={flt.sort} onChange={(e) => setFlt({ ...flt, sort: e.target.value })}><option value="recommended">Recommended</option><option value="price">Lowest price</option><option value="departure">Earliest departure</option><option value="duration">Shortest duration</option><option value="rating">Highest rated</option></Select></Field>
              <Field label="Bus type"><Select value={flt.busType} onChange={(e) => setFlt({ ...flt, busType: e.target.value })}><option value="">All types</option>{BUS_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
              <Field label="Departure time"><Select value={flt.window} onChange={(e) => setFlt({ ...flt, window: e.target.value })}>{WINDOWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
              <Field label="Max fare (₹)"><Input type="number" min="0" value={flt.maxFare} onChange={(e) => setFlt({ ...flt, maxFare: e.target.value })} placeholder="No limit" /></Field>
              <Field label="Minimum rating"><Select value={flt.minRating} onChange={(e) => setFlt({ ...flt, minRating: e.target.value })}><option value="">Any</option><option value="3">3+</option><option value="4">4+</option><option value="4.5">4.5+</option></Select></Field>
              <fieldset><legend className="text-sm font-medium mb-1.5">Amenities</legend>
                <div className="grid grid-cols-2 gap-1.5">{AMEN.map((a) => <label key={a} className="flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" className="accent-teal-600" checked={flt.amenities.includes(a)} onChange={() => setFlt({ ...flt, amenities: flt.amenities.includes(a) ? flt.amenities.filter((x) => x !== a) : [...flt.amenities, a] })} />{cap(a)}</label>)}</div>
              </fieldset>
              {w && (
                <fieldset><legend className="text-sm font-medium mb-1">Fare Intelligence weights</legend>
                  <p className="text-xs text-slate-aura mb-2">Adjust what matters. Scores update live.</p>
                  {Object.keys(w).map((k) => (
                    <label key={k} className="block text-xs mb-2"><span className="flex justify-between"><span>{cap(k)}</span><span>{Number(w[k]).toFixed(2)}</span></span>
                      <input type="range" min="0" max="1" step="0.05" value={w[k]} onChange={(e) => setWeights({ ...w, [k]: Number(e.target.value) })} className="w-full accent-teal-600" aria-label={`${cap(k)} weight`} /></label>
                  ))}
                  {weights && <Button variant="ghost" size="sm" onClick={() => setWeights(null)}>Reset weights</Button>}
                </fieldset>
              )}
            </Card>
          </aside>

          <section aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div><h1 className="text-xl font-bold">{data?.route ? `${data.route.source} → ${data.route.destination}` : `${source} → ${destination}`}</h1><p className="text-sm text-slate-aura">{fmtShortDate(date)} · {passengers} passenger{passengers > 1 ? 's' : ''}{data?.journeys && ` · ${data.journeys.length} bus${data.journeys.length === 1 ? '' : 'es'}`}</p></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal className="h-4 w-4" />Filters</Button>
                <Button size="sm" variant="dark" disabled={picked.length < 2} loading={cmpBusy} onClick={runCompare}><Scale className="h-4 w-4" />Compare{picked.length ? ` (${picked.length})` : ''}</Button>
              </div>
            </div>
            {data?.note && <Notice className="mb-4">{data.note}</Notice>}
            {loading ? <SkeletonList n={3} h="h-56" /> : error ? <Notice tone="coral">{error} <button onClick={reload} className="underline font-semibold">Retry</button></Notice> : !data?.journeys?.length ? (
              <Card><Empty icon={Bus} title="No buses found" text={data?.note || 'Try another date, relax your filters, or check the city names.'} /></Card>
            ) : (
              <div className="space-y-4">{data.journeys.map((j) => <BusCard key={j._id} j={j} passengers={passengers} selected={picked.includes(j._id)} onSelect={toggle} />)}</div>
            )}
          </section>
        </div>
      )}

      <Modal open={!!cmp} onClose={() => setCmp(null)} title="Compare journeys" wide>
        {cmp && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="text-left text-slate-aura"><th className="py-2 pr-3 font-medium w-32"></th>{cmp.journeys.map((j) => <th key={j._id} className="py-2 pr-3 font-semibold text-midnight">{j.operator.orgName}<div className="font-normal text-xs text-slate-aura">{j.bus.type}</div></th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  ['Labels', (j) => <div className="flex flex-wrap gap-1">{j.labels.length ? j.labels.map((l) => <Badge key={l} tone="teal">{l}</Badge>) : <span className="text-slate-aura">None</span>}</div>],
                  ['Fare', (j) => <b>{inr(j.baseFare)}</b>], ['Departs', (j) => fmtDateTime(j.departure)], ['Duration', (j) => fmtDuration(j.durationMin)],
                  ['Rating', (j) => (j.operator.ratingCount ? j.operator.ratingAvg.toFixed(1) : 'None yet')], ['On-time (sample)', (j) => `${j.reliability?.onTimePercent ?? '—'}%`],
                  ['Seats left', (j) => j.availableSeats], ['Amenities', (j) => <Amenities list={j.bus.amenities} max={4} />],
                  ['Value score', (j) => Math.round(j.score ?? 0)], ['Comfort score', (j) => Math.round(j.comfortScore ?? 0)],
                ].map(([label, fn]) => <tr key={label}><td className="py-2.5 pr-3 text-slate-aura align-top">{label}</td>{cmp.journeys.map((j) => <td key={j._id} className="py-2.5 pr-3 align-top">{fn(j)}</td>)}</tr>)}
              </tbody>
            </table>
            <p className="text-xs text-slate-aura mt-4">{cmp.note}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
