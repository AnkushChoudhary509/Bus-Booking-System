import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import SeatMap, { SeatLegend } from '../../components/SeatMap';
import { Badge, Button, Card, ErrorState, Notice, Select, SkeletonList } from '../../components/ui';
import useFetch from '../../hooks/useFetch';
import useSocketEvent from '../../hooks/useSocketEvent';
import useDraft from '../../hooks/useDraft';
import { post, errMsg } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { fmtDateTime, inr, uid } from '../../utils/format';

const Check = ({ label, checked, onChange }) => <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;

export default function SeatSelection() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [, setDraft] = useDraft();
  const want = Math.min(6, Math.max(1, Number(sp.get('passengers') || 1)));
  const jr = useFetch(`/journeys/${id}`);
  const sm = useFetch(`/journeys/${id}/seats`);
  const [sel, setSel] = useState([]);
  const [initDone, setInitDone] = useState(false);
  const [prefs, setPrefs] = useState({ window: false, aisle: false, position: 'any', legroom: false, lowVibration: false, nearEntrance: false, berth: 'any' });
  const [rec, setRec] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recBusy, setRecBusy] = useState(false);

  // keep seats this user already holds
  useEffect(() => { if (sm.data && !initDone) { setSel(sm.data.seats.filter((s) => s.lockedByMe).map((s) => s.number)); setInitDone(true); } }, [sm.data, initDone]);
  useSocketEvent('seats:update', () => sm.reload(), { journeyId: id });
  useEffect(() => { const t = setInterval(sm.reload, 20000); return () => clearInterval(t); }, []); // eslint-disable-line -- fallback polling if the websocket is down

  // drop selected seats that someone else took meanwhile
  useEffect(() => {
    if (!sm.data) return;
    const bad = sel.filter((n) => { const s = sm.data.seats.find((x) => x.number === n); return !s || s.status === 'booked' || (s.status === 'locked' && !s.lockedByMe); });
    if (bad.length) { setSel((c) => c.filter((n) => !bad.includes(n))); toast.error(`Seat ${bad.join(', ')} was just taken`); }
  }, [sm.data]); // eslint-disable-line

  const byNum = useMemo(() => new Map((sm.data?.seats || []).map((s) => [s.number, s])), [sm.data]);
  const total = sel.reduce((a, n) => a + (byNum.get(n)?.price || 0), 0);
  const sleeper = sm.data?.layoutType?.startsWith('sleeper');

  const toggle = (s) => setSel((c) => (c.includes(s.number) ? c.filter((x) => x !== s.number) : c.length >= 6 ? (toast.info('You can book up to 6 seats'), c) : [...c, s.number]));

  const recommend = async () => {
    setRecBusy(true);
    try {
      const body = { ...prefs, count: Math.max(want, 1) };
      setRec((await post(`/journeys/${id}/seats/recommend`, body)).data);
    } catch (e) { toast.error(errMsg(e)); } finally { setRecBusy(false); }
  };

  const proceed = async () => {
    setBusy(true);
    try {
      const r = await post(`/journeys/${id}/seats/lock`, { seats: sel });
      setDraft((d) => ({ journeyId: id, seats: sel, seatPrices: Object.fromEntries(sel.map((n) => [n, byNum.get(n)?.price])), lockExpiresAt: r.data.lockExpiresAt, idempotencyKey: d?.journeyId === id && d.idempotencyKey && JSON.stringify(d.seats) === JSON.stringify(sel) ? d.idempotencyKey : uid(), passengers: d?.journeyId === id ? d.passengers : [] }));
      nav(`/journey/${id}/boarding`);
    } catch (e) { toast.error(errMsg(e)); sm.reload(); } finally { setBusy(false); }
  };

  if (jr.loading || sm.loading) return <div className="max-w-6xl mx-auto px-4 py-8"><SkeletonList n={2} h="h-72" /></div>;
  if (jr.error || sm.error) return <div className="max-w-6xl mx-auto px-4 py-8"><ErrorState message={jr.error || sm.error} onRetry={() => { jr.reload(); sm.reload(); }} /></div>;
  const j = jr.data.journey;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6"><Link to={`/journey/${id}`} className="text-sm text-teal-dark font-semibold">← Bus details</Link>
        <h1 className="text-2xl font-bold mt-1">Choose your seats</h1>
        <p className="text-slate-aura">{j.route.source} → {j.route.destination} · {fmtDateTime(j.departure)} · {j.operator.orgName}</p></div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">Seat layout</h2><span className="text-sm text-slate-aura">{sm.data.availableSeats} available</span></div>
            <SeatMap seats={sm.data.seats} layoutType={sm.data.layoutType} selected={sel} recommended={rec?.recommended?.map((r) => r.number)} onToggle={toggle} />
            <div className="mt-5"><SeatLegend /></div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-teal-dark" />Comfort preferences</h2>
            <p className="text-xs text-slate-aura mt-1 mb-4">We rank free seats using the attributes below.</p>
            <div className="space-y-2.5">
              <Check label="Window seat" checked={prefs.window} onChange={(v) => setPrefs({ ...prefs, window: v })} />
              <Check label="Aisle seat" checked={prefs.aisle} onChange={(v) => setPrefs({ ...prefs, aisle: v })} />
              <Check label="Extra legroom" checked={prefs.legroom} onChange={(v) => setPrefs({ ...prefs, legroom: v })} />
              <Check label="Less vibration (estimated)" checked={prefs.lowVibration} onChange={(v) => setPrefs({ ...prefs, lowVibration: v })} />
              <Check label="Near the entrance" checked={prefs.nearEntrance} onChange={(v) => setPrefs({ ...prefs, nearEntrance: v })} />
              <Select aria-label="Front or rear" value={prefs.position} onChange={(e) => setPrefs({ ...prefs, position: e.target.value })}><option value="any">Front or rear: no preference</option><option value="front">Prefer front</option><option value="rear">Prefer rear</option></Select>
              {sleeper && <Select aria-label="Berth" value={prefs.berth} onChange={(e) => setPrefs({ ...prefs, berth: e.target.value })}><option value="any">Berth: no preference</option><option value="lower">Lower berth</option><option value="upper">Upper berth</option></Select>}
            </div>
            <Button variant="dark" className="w-full mt-4" loading={recBusy} onClick={recommend}>Recommend {want > 1 ? `${want} seats` : 'a seat'}</Button>
            {rec && (
              <div className="mt-4">
                {!rec.recommended.length ? <p className="text-sm text-slate-aura">Pick at least one preference to get recommendations.</p> : (
                  <>
                    <ul className="space-y-2">{rec.recommended.map((r) => <li key={r.number} className="text-sm rounded-lg bg-teal-aura/10 p-2.5"><div className="flex justify-between"><b>Seat {r.number}</b><span>{inr(r.price)} · score {r.score}</span></div><div className="text-xs text-slate-aura">{r.reasons.join(' · ') || 'Matches your preferences'}</div></li>)}</ul>
                    <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setSel(rec.recommended.slice(0, 6).map((r) => r.number))}>Select recommended</Button>
                  </>
                )}
                <p className="text-xs text-slate-aura mt-3"><Badge tone="amber">Estimated</Badge> {rec.disclaimer}</p>
              </div>
            )}
          </Card>

          <Card className="p-5 lg:sticky lg:top-20">
            <h2 className="font-semibold mb-3">Your selection</h2>
            {!sel.length ? <p className="text-sm text-slate-aura">Tap a seat to select it.</p> : (
              <ul className="text-sm space-y-1.5 mb-3">{sel.map((n) => <li key={n} className="flex justify-between"><span>Seat {n}{byNum.get(n)?.extraLegroom && <span className="text-xs text-slate-aura"> · extra legroom</span>}</span><b>{inr(byNum.get(n)?.price)}</b></li>)}</ul>
            )}
            <div className="flex justify-between font-display font-bold text-lg border-t border-slate-100 pt-3"><span>Total</span><span>{inr(total)}</span></div>
            <Button className="w-full mt-4" size="lg" disabled={!sel.length} loading={busy} onClick={proceed}>Hold seats and continue</Button>
            <Notice tone="teal" className="mt-3 !text-xs">Seats are held for 10 minutes after you continue. Nothing is charged until you pay.</Notice>
          </Card>
        </div>
      </div>
    </div>
  );
}
