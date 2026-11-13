import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Ticket, CreditCard, AlertTriangle, LifeBuoy, Undo2, Info } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import useSocketEvent from '../../hooks/useSocketEvent';
import { Button, Card, Empty, ErrorState, PageHeader, SkeletonList, cx } from '../../components/ui';
import { patch, post } from '../../services/api';
import { ago } from '../../utils/format';

const ICON = { booking: Ticket, payment: CreditCard, cancellation: AlertTriangle, delay: AlertTriangle, rescue: LifeBuoy, refund: Undo2, operator: Info, support: Info, system: Bell };

export default function Notifications() {
  const nav = useNavigate();
  const { data, loading, error, reload } = useFetch('/notifications');
  useSocketEvent('notification:new', () => reload());
  const open = async (n) => { if (!n.readAt) { await patch(`/notifications/${n._id}/read`).catch(() => {}); reload(); } if (n.link) nav(n.link); };
  const all = async () => { await post('/notifications/read-all'); reload(); };
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <PageHeader title="Notifications" subtitle={data ? `${data.unread} unread` : ''} actions={data?.unread > 0 && <Button variant="outline" size="sm" onClick={all}><CheckCheck className="h-4 w-4" />Mark all read</Button>} />
      {loading ? <SkeletonList n={4} h="h-20" /> : error ? <ErrorState message={error} onRetry={reload} /> : !data.notifications.length ? <Card><Empty icon={Bell} title="You're all caught up" text="Booking, payment and journey updates will show up here." /></Card> : (
        <Card className="divide-y divide-slate-100">{data.notifications.map((n) => { const I = ICON[n.type] || Bell; return (
          <button key={n._id} onClick={() => open(n)} className={cx('w-full text-left flex gap-4 p-4 hover:bg-slate-50 first:rounded-t-2xl last:rounded-b-2xl', !n.readAt && 'bg-teal-aura/5')}>
            <span className={cx('h-10 w-10 rounded-xl grid place-items-center shrink-0', ['delay', 'cancellation', 'rescue'].includes(n.type) ? 'bg-amber-aura/15 text-[#9a6200]' : 'bg-teal-aura/15 text-teal-dark')}><I className="h-5 w-5" /></span>
            <span className="flex-1 min-w-0"><span className="flex justify-between gap-2"><b className="text-sm">{n.title}</b><span className="text-xs text-slate-aura whitespace-nowrap">{ago(n.createdAt)}</span></span><span className="block text-sm text-slate-aura mt-0.5">{n.body}</span></span>
            {!n.readAt && <span className="h-2.5 w-2.5 rounded-full bg-teal-aura mt-1.5 shrink-0" aria-label="Unread" />}
          </button>); })}</Card>
      )}
    </div>
  );
}
