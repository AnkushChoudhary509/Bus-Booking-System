import { forwardRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Inbox, X } from 'lucide-react';
import { cap } from '../utils/format';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function Logo({ dark = false, className = '' }) {
  return (
    <Link to="/" className={cx('inline-flex items-center gap-2 font-display font-bold text-xl', dark ? 'text-white' : 'text-midnight', className)} aria-label="RouteAura home">
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#0B1426" />
        <path d="M12 44c10 0 12-20 20-20s10 20 20 20" fill="none" stroke="#14E0C3" strokeWidth="5" strokeLinecap="round" />
        <circle cx="32" cy="16" r="5" fill="#F5A524" />
      </svg>
      <span>Route<span className="text-teal-dark">Aura</span></span>
    </Link>
  );
}

const BTN = {
  primary: 'bg-teal-aura text-midnight hover:bg-[#2cefd2] focus-visible:ring-teal-dark',
  dark: 'bg-midnight text-white hover:bg-midnight-2 focus-visible:ring-midnight',
  outline: 'bg-white text-midnight ring-1 ring-slate-300 hover:bg-slate-50 focus-visible:ring-slate-400',
  ghost: 'text-midnight hover:bg-slate-100',
  danger: 'bg-coral-aura text-white hover:bg-[#e04848] focus-visible:ring-coral-aura',
};
export const Button = forwardRef(function Button({ variant = 'primary', size = 'md', loading, className, children, as: As = 'button', ...p }, ref) {
  const sz = size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-6 py-3 text-base' : 'px-4 py-2.5 text-sm';
  return (
    <As ref={ref} disabled={loading || p.disabled} {...p}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed', sz, BTN[variant], className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </As>
  );
});

export const Card = ({ className, children, ...p }) => <div {...p} className={cx('rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-sm', className)}>{children}</div>;

const TONES = {
  teal: 'bg-teal-aura/15 text-teal-dark', amber: 'bg-amber-aura/15 text-[#9a6200]', coral: 'bg-coral-aura/10 text-coral-aura',
  slate: 'bg-slate-100 text-slate-aura', navy: 'bg-midnight text-white', blue: 'bg-blue-50 text-blue-700',
};
export const Badge = ({ tone = 'slate', className, children }) => <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', TONES[tone], className)}>{children}</span>;

const STATUS_TONE = {
  confirmed: 'teal', completed: 'teal', paid: 'teal', approved: 'teal', resolved: 'teal', scheduled: 'blue', boarding: 'blue', running: 'teal', open: 'amber', in_progress: 'amber',
  pending: 'amber', pending_payment: 'amber', unpaid: 'amber', delayed: 'amber', refund_pending: 'amber', offered: 'amber',
  cancelled: 'coral', rejected: 'coral', failed: 'coral', expired: 'slate', replaced: 'slate', refunded: 'blue',
};
export const StatusPill = ({ status }) => <Badge tone={STATUS_TONE[status] || 'slate'}>{cap(status)}</Badge>;

export const Skeleton = ({ className }) => <div className={cx('skeleton rounded-lg', className)} aria-hidden="true" />;
export const SkeletonList = ({ n = 3, h = 'h-28' }) => <div className="space-y-4" role="status" aria-label="Loading">{Array.from({ length: n }).map((_, i) => <Skeleton key={i} className={cx('w-full rounded-2xl', h)} />)}</div>;

export function Empty({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="h-16 w-16 rounded-full bg-teal-aura/10 grid place-items-center mb-4"><Icon className="h-8 w-8 text-teal-dark" /></div>
      <h3 className="font-semibold text-lg">{title}</h3>
      {text && <p className="text-slate-aura text-sm mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-aura focus:border-teal-dark disabled:bg-slate-50';
export const Input = forwardRef(function Input({ className, ...p }, ref) { return <input ref={ref} {...p} className={cx(inputCls, className)} />; });
export const Select = ({ className, children, ...p }) => <select {...p} className={cx(inputCls, className)}>{children}</select>;
export const Textarea = ({ className, ...p }) => <textarea {...p} className={cx(inputCls, 'min-h-24', className)} />;
export function Field({ label, error, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="block text-sm font-medium mb-1.5">{label}</span>}
      {children}
      {hint && !error && <span className="block text-xs text-slate-aura mt-1">{hint}</span>}
      {error && <span className="block text-xs text-coral-aura mt-1" role="alert">{error}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-midnight/60" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className={cx('w-full bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-auto', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'teal' }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-aura">{label}</span>
        {Icon && <span className={cx('h-9 w-9 rounded-xl grid place-items-center', TONES[tone])}><Icon className="h-4.5 w-4.5" /></span>}
      </div>
      <div className="font-display text-2xl font-bold mt-2">{value}</div>
      {sub && <div className="text-xs text-slate-aura mt-1">{sub}</div>}
    </Card>
  );
}

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
    <div><h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>{subtitle && <p className="text-slate-aura mt-1">{subtitle}</p>}</div>
    {actions && <div className="flex gap-2">{actions}</div>}
  </div>
);

export const Notice = ({ tone = 'amber', children, className }) => (
  <div className={cx('rounded-xl px-4 py-3 text-sm', tone === 'amber' ? 'bg-amber-aura/10 text-[#7a4f00]' : tone === 'coral' ? 'bg-coral-aura/10 text-coral-aura' : 'bg-teal-aura/10 text-teal-dark', className)}>{children}</div>
);

export const Tabs = ({ tabs, value, onChange }) => (
  <div className="flex gap-1 overflow-x-auto border-b border-slate-200 mb-5" role="tablist">
    {tabs.map((t) => (
      <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
        className={cx('px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors', value === t.key ? 'border-teal-dark text-midnight' : 'border-transparent text-slate-aura hover:text-midnight')}>
        {t.label}{t.count ? <span className="ml-1.5 rounded-full bg-amber-aura/20 text-[#9a6200] px-1.5 text-xs">{t.count}</span> : null}
      </button>
    ))}
  </div>
);

export const Spinner = () => <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-teal-dark" /></div>;

export const ErrorState = ({ message, onRetry }) => (
  <Card className="p-8 text-center"><p className="text-coral-aura font-medium">{message}</p>{onRetry && <Button variant="outline" className="mt-4" onClick={onRetry}>Try again</Button>}</Card>
);
