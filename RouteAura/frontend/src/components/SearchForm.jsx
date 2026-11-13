import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Search } from 'lucide-react';
import { Button, Field, Input, Select } from './ui';
import useSocketEvent from '../hooks/useSocketEvent';
import { get } from '../services/api';
import { todayISO } from '../utils/format';

export default function SearchForm({ initial = {}, dark = false }) {
  const nav = useNavigate();
  const [cities, setCities] = useState([]);
  const [f, setF] = useState({ source: initial.source || '', destination: initial.destination || '', date: initial.date || todayISO(1), passengers: initial.passengers || 1 });
  const [err, setErr] = useState('');
  const loadCities = () => get('/routes/cities').then((d) => setCities(d.cities)).catch(() => {});
  useEffect(() => { loadCities(); }, []);
  useSocketEvent('catalog:update', loadCities);
  useEffect(() => { setF((s) => ({ ...s, ...Object.fromEntries(Object.entries(initial).filter(([, v]) => v)) })); }, [initial.source, initial.destination, initial.date]); // eslint-disable-line

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const swap = () => setF({ ...f, source: f.destination, destination: f.source });
  const submit = (e) => {
    e.preventDefault();
    if (f.source.trim().length < 2 || f.destination.trim().length < 2) return setErr('Enter both cities');
    if (f.source.trim().toLowerCase() === f.destination.trim().toLowerCase()) return setErr('Source and destination must differ');
    setErr('');
    nav(`/search?${new URLSearchParams({ source: f.source.trim(), destination: f.destination.trim(), date: f.date, passengers: f.passengers })}`);
  };

  return (
    <form onSubmit={submit} className={`rounded-2xl p-4 sm:p-5 shadow-xl ${dark ? 'bg-white' : 'bg-white ring-1 ring-slate-200'}`} aria-label="Search buses">
      <datalist id="city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_11rem_7rem_auto] items-end">
        <Field label="From"><Input list="city-list" value={f.source} onChange={set('source')} placeholder="e.g. Jalandhar" autoComplete="off" required /></Field>
        <button type="button" onClick={swap} aria-label="Swap cities" className="hidden md:grid h-10 w-10 place-items-center rounded-full ring-1 ring-slate-300 hover:bg-slate-50 mb-0.5"><ArrowLeftRight className="h-4 w-4" /></button>
        <Field label="To"><Input list="city-list" value={f.destination} onChange={set('destination')} placeholder="e.g. Delhi" autoComplete="off" required /></Field>
        <Field label="Date"><Input type="date" value={f.date} min={todayISO(0)} onChange={set('date')} required /></Field>
        <Field label="Passengers"><Select value={f.passengers} onChange={set('passengers')}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
        <Button type="submit" size="lg" className="w-full md:w-auto"><Search className="h-4 w-4" />Search</Button>
      </div>
      {err && <p className="text-sm text-coral-aura mt-2" role="alert">{err}</p>}
    </form>
  );
}
