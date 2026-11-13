const TZ = 'Asia/Kolkata';
export const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ }) : '—');
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '—');
export const fmtShortDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ }) : '—');
export const fmtDateTime = (d) => (d ? `${fmtShortDate(d)}, ${fmtTime(d)}` : '—');
export const fmtDuration = (min) => { const m = Math.round(min || 0); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
export const todayISO = (offset = 0) => {
  const d = new Date(Date.now() + 330 * 60000 + offset * 86400000);
  return d.toISOString().slice(0, 10);
};
export const ago = (d) => {
  const s = Math.round((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return fmtShortDate(d);
};
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ') : '');
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(16).slice(2)}`);
