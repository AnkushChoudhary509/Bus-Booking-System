import { useCallback, useEffect, useRef, useState } from 'react';
import { get, errMsg } from '../services/api';
import { getSocket } from '../services/socket';

// Lists that change when anyone adds or edits routes, buses, journeys or operators.
const LIVE = /^\/(routes|buses|journeys\/search|operator\/(journeys|dashboard)|admin\/(buses|routes|journeys|operators|stats))/;

/** Loads GET `url` with `params`; re-runs when they change. Returns { data, loading, error, reload }. */
export default function useFetch(url, params, { skip = false } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState(null);
  const key = JSON.stringify([url, params]);
  const seq = useRef(0);

  const run = useCallback(async (silent = false) => {
    if (skip || !url) return;
    const n = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const d = await get(url, params);
      if (n === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(errMsg(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, skip]);

  useEffect(() => { run(); }, [run]);

  // refresh at once when the server announces a catalog change (any role, any screen)
  useEffect(() => {
    if (skip || !url || !LIVE.test(url)) return undefined;
    let s; let t;
    try { s = getSocket(); } catch { return undefined; }
    const fn = () => { clearTimeout(t); t = setTimeout(() => run(true), 200); };
    s.on('catalog:update', fn);
    return () => { clearTimeout(t); s.off('catalog:update', fn); };
  }, [run, url, skip]);
  return { data, loading, error, reload: () => run(true), setData };
}
