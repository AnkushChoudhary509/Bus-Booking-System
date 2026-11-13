import { useState } from 'react';
import { MapPin, Plus, Search, X } from 'lucide-react';
import { Button, Field, Input, Notice } from './ui';
import { get, post, errMsg } from '../services/api';

const blankEnd = { name: '', lat: '', lng: '', picks: null, looking: false, manual: false };

/** One end of the route: free-text city name, optional map lookup, optional manual coordinates. */
function End({ label, v, set, listId }) {
  const [err, setErr] = useState('');
  const find = async () => {
    setErr(''); set({ ...v, looking: true, picks: null });
    try { const d = await get('/routes/lookup', { q: v.name }); set({ ...v, looking: false, picks: d.places }); if (!d.places.length) setErr('Nothing found. Check the spelling or enter coordinates manually.'); }
    catch (e) { set({ ...v, looking: false, manual: true }); setErr(errMsg(e)); }
  };
  const has = v.lat !== '' && v.lng !== '';
  return (
    <div className="space-y-2">
      <Field label={label}>
        <div className="flex gap-2">
          <Input list={listId} placeholder="Type any city or town" value={v.name} onChange={(e) => set({ ...v, name: e.target.value, picks: null })} />
          <Button type="button" size="sm" variant="outline" disabled={v.name.trim().length < 2} loading={v.looking} onClick={find} title="Find coordinates on OpenStreetMap"><Search className="h-3.5 w-3.5" />Find</Button>
        </div>
      </Field>
      {v.picks?.length > 0 && (
        <ul className="rounded-xl ring-1 ring-slate-200 bg-white text-xs divide-y max-h-40 overflow-auto">
          {v.picks.map((p, i) => <li key={i}><button type="button" className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={() => set({ ...v, lat: p.lat, lng: p.lng, picks: null })}>{p.name}</button></li>)}
        </ul>
      )}
      {has && <p className="text-xs text-teal-dark flex items-center gap-1"><MapPin className="h-3 w-3" />Map point set: {Number(v.lat).toFixed(4)}, {Number(v.lng).toFixed(4)}</p>}
      {err && <p className="text-xs text-coral-aura">{err}</p>}
      {v.manual || has ? (
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" step="any" placeholder="Latitude" value={v.lat} onChange={(e) => set({ ...v, lat: e.target.value })} />
          <Input type="number" step="any" placeholder="Longitude" value={v.lng} onChange={(e) => set({ ...v, lng: e.target.value })} />
        </div>
      ) : <button type="button" className="text-xs text-teal-dark underline" onClick={() => set({ ...v, manual: true })}>Enter coordinates manually</button>}
    </div>
  );
}

/**
 * Create a route with any cities (not limited to the seeded list). Coordinates, distance and duration can be left blank:
 * the server then looks the places up on OpenStreetMap and estimates distance and time from the road route.
 */
export default function RouteForm({ cities = [], onSaved, onCancel }) {
  const [a, setA] = useState({ ...blankEnd });
  const [b, setB] = useState({ ...blankEnd });
  const [distanceKm, setDistanceKm] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [stops, setStops] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // NOT a <form>: this component is also used inside the "Publish journey" form, and nested forms break in browsers
  // (the outer form's required Route field would block saving a new route).
  const submit = async () => {
    setErr('');
    if (a.name.trim().length < 2 || b.name.trim().length < 2) return setErr('Enter both places.');
    if (a.name.trim().toLowerCase() === b.name.trim().toLowerCase()) return setErr('From and To must be different.');
    setBusy(true);
    const coords = (v) => (v.lat !== '' && v.lng !== '' ? { lat: Number(v.lat), lng: Number(v.lng) } : undefined);
    try {
      const body = {
        source: a.name.trim(), destination: b.name.trim(),
        ...(distanceKm && { distanceKm: Number(distanceKm) }), ...(durationMin && { durationMin: Number(durationMin) }),
        ...(coords(a) && { sourceCoords: coords(a) }), ...(coords(b) && { destinationCoords: coords(b) }),
        stops: stops.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), offsetMin: Number(s.offsetMin) || 0 })),
      };
      const r = await post('/routes', body);
      onSaved(r.data.route, r.message);
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); if (e.target.list == null) submit(); } }}>
      <datalist id="route-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="grid gap-4 sm:grid-cols-2">
        <End label="From" v={a} set={setA} listId="route-cities" />
        <End label="To" v={b} set={setB} listId="route-cities" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Distance (km)" hint="Leave blank to estimate from the road"><Input type="number" min="1" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} /></Field>
        <Field label="Duration (minutes)" hint="Leave blank to estimate"><Input type="number" min="10" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} /></Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium mb-2">Stops on the way (optional)</legend>
        {stops.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-2 mb-2">
            <Input placeholder="Stop name" value={s.name} onChange={(e) => setStops(stops.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input type="number" min="0" placeholder="Min after start" value={s.offsetMin} onChange={(e) => setStops(stops.map((x, j) => (j === i ? { ...x, offsetMin: e.target.value } : x)))} />
            <button type="button" aria-label="Remove stop" className="px-2 text-slate-aura hover:text-coral-aura" onClick={() => setStops(stops.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => setStops([...stops, { name: '', offsetMin: '' }])}><Plus className="h-3.5 w-3.5" />Add stop</Button>
        <p className="text-xs text-slate-aura mt-1">Stops are placed on the map by their time along the route. They only turn green once the bus has really passed that point.</p>
      </fieldset>
      {err && <Notice tone="coral">{err}</Notice>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="button" loading={busy} onClick={submit}>Create route</Button>
      </div>
    </div>
  );
}
