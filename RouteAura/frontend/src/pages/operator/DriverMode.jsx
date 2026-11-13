import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Crosshair, MapPin, Navigation, Square } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { Badge, Button, Card, ErrorState, Field, Input, Notice, PageHeader, SkeletonList } from '../../components/ui';
import { del, errMsg, post } from '../../services/api';

const SEND_EVERY_MS = 5000;
const secure = typeof window !== 'undefined' && (window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname));

/** Driver mode: the phone's real GPS position is sent to the server, which moves the bus on passengers' tracking page. */
export default function DriverMode() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch(`/journeys/${id}/tracking`);
  const [sharing, setSharing] = useState(false);
  const [fix, setFix] = useState(null);
  const [lastSent, setLastSent] = useState(null);
  const [sentCount, setSentCount] = useState(0);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState({ lat: '', lng: '' });
  const watchId = useRef(null);
  const latest = useRef(null);
  const timer = useRef(null);
  const wake = useRef(null);

  const send = useCallback(async (f) => {
    try {
      await post(`/journeys/${id}/location`, f);
      setLastSent(new Date()); setSentCount((n) => n + 1); setErr('');
      reload();
    } catch (x) { setErr(errMsg(x)); }
  }, [id, reload]);

  const stop = useCallback(async (notify = true) => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    clearInterval(timer.current);
    try { await wake.current?.release(); } catch { /* ignore */ }
    wake.current = null;
    setSharing(false);
    if (notify) { try { await del(`/journeys/${id}/location`); reload(); } catch (x) { setErr(errMsg(x)); } }
  }, [id, reload]);

  const start = async () => {
    setErr('');
    if (!navigator.geolocation) { setErr('This browser does not support geolocation.'); return; }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const c = p.coords;
        const f = { lat: c.latitude, lng: c.longitude, accuracyM: c.accuracy ?? undefined, speedKmh: c.speed != null ? Math.max(0, c.speed * 3.6) : undefined, headingDeg: c.heading != null && !Number.isNaN(c.heading) ? c.heading : undefined };
        latest.current = f; setFix(f);
      },
      (e) => setErr(e.code === 1 ? 'Location permission was denied. Allow location for this site and try again.' : e.message || 'Could not get your location.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    timer.current = setInterval(() => { if (latest.current) send(latest.current); }, SEND_EVERY_MS);
    try { wake.current = await navigator.wakeLock?.request('screen'); } catch { /* best effort */ }
    setSharing(true);
  };

  useEffect(() => () => { // leaving the page stops the GPS watch (the server falls back after 2 min of silence)
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    clearInterval(timer.current);
  }, []);

  const sendManual = async (e) => {
    e.preventDefault();
    await send({ lat: Number(manual.lat), lng: Number(manual.lng), manual: true });
  };

  if (loading && !data) return <SkeletonList n={2} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const live = data?.trackingType === 'gps';

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
      <PageHeader title="Driver mode" subtitle={data ? `${data.route?.source ?? ''} to ${data.route?.destination ?? ''}` : ''} />
      {!secure && <Notice tone="coral">Phones only share GPS on a secure (HTTPS) page. Open the deployed https:// site, or use localhost on this computer.</Notice>}
      <Notice>Share your phone's real GPS location. While fresh, passengers see your actual position labelled LIVE GPS; if signal is lost for 2 minutes the page falls back to the simulation.</Notice>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-semibold"><Navigation className="h-5 w-5 text-teal-dark" />Live location sharing</div>
          <Badge tone={sharing ? 'teal' : 'slate'}>{sharing ? 'Sharing' : 'Off'}</Badge>
        </div>
        <div className="mt-4 flex gap-2">
          {!sharing
            ? <Button onClick={start} disabled={!secure}><MapPin className="h-4 w-4" />Start sharing</Button>
            : <Button variant="dark" onClick={() => stop(true)}><Square className="h-4 w-4" />Stop sharing</Button>}
          <Button as={Link} to={`/journey/${id}/tracking`} variant="ghost">View passenger page</Button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-aura">Position</dt><dd className="font-medium">{fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}` : '-'}</dd></div>
          <div><dt className="text-slate-aura">Accuracy</dt><dd className="font-medium">{fix?.accuracyM ? `about ${Math.round(fix.accuracyM)} m` : '-'}</dd></div>
          <div><dt className="text-slate-aura">Last sent</dt><dd className="font-medium">{lastSent ? lastSent.toLocaleTimeString() : '-'} {sentCount ? `(${sentCount} updates)` : ''}</dd></div>
          <div><dt className="text-slate-aura">Passengers see</dt><dd className="font-medium">{live ? 'LIVE GPS' : 'Simulated position'}</dd></div>
        </dl>
        {live && data.map?.offRouteKm > 3 && <Notice className="mt-3">You appear to be {data.map.offRouteKm} km away from the planned road line.</Notice>}
        {err && <p role="alert" className="mt-3 text-sm text-coral-aura">{err}</p>}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 font-display font-semibold"><Crosshair className="h-5 w-5 text-slate-aura" />Test position (manual)</div>
        <p className="text-sm text-slate-aura mt-1">For testing without a moving phone: send one position by hand. It is treated as a GPS update.</p>
        <form onSubmit={sendManual} className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Latitude"><Input type="number" step="any" required value={manual.lat} onChange={(e) => setManual({ ...manual, lat: e.target.value })} /></Field>
          <Field label="Longitude"><Input type="number" step="any" required value={manual.lng} onChange={(e) => setManual({ ...manual, lng: e.target.value })} /></Field>
          <div className="col-span-2"><Button type="submit" variant="outline">Send test position</Button></div>
        </form>
      </Card>
    </div>
  );
}
