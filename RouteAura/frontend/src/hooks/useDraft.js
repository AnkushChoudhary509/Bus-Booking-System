import { useCallback, useState } from 'react';

const KEY = 'ra_booking_draft';
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; } };

/** The in-progress booking (seats, passengers, points). Kept in sessionStorage so a refresh does not lose it. */
export default function useDraft() {
  const [draft, setDraft] = useState(read);
  const save = useCallback((next) => {
    setDraft((cur) => {
      const v = typeof next === 'function' ? next(cur) : next;
      try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      return v;
    });
  }, []);
  return [draft, save];
}
