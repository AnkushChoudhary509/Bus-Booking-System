import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

export default function LockTimer({ expiresAt, onExpire }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) { clearInterval(t); onExpire?.(); }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, onExpire]);
  if (!expiresAt) return null;
  const m = Math.floor(left / 60), s = String(left % 60).padStart(2, '0');
  return <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${left < 120 ? 'bg-coral-aura/10 text-coral-aura' : 'bg-amber-aura/15 text-[#7a4f00]'}`} role="timer"><Timer className="h-4 w-4" />Seats held for {m}:{s}</div>;
}
