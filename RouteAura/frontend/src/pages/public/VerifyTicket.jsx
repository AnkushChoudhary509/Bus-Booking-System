import { useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { Card, Spinner, StatusPill } from '../../components/ui';
import { fmtDateTime } from '../../utils/format';

export default function VerifyTicket() {
  const { token } = useParams();
  const { data, loading, error } = useFetch(`/tickets/verify/${token}`);
  if (loading) return <Spinner />;
  const v = data;
  const valid = v?.valid;
  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <Card className="p-8 text-center">
        {valid ? <CheckCircle2 className="h-14 w-14 text-teal-dark mx-auto" /> : <XCircle className="h-14 w-14 text-coral-aura mx-auto" />}
        <h1 className="text-2xl font-bold mt-3">{valid ? 'Valid ticket' : 'Ticket not valid'}</h1>
        {error && <p className="text-coral-aura mt-2">{error}</p>}
        {!valid && v?.reason && <p className="text-slate-aura mt-2">{v.reason}</p>}
        {v && Object.keys(v).length > 1 && (
          <dl className="mt-6 text-left text-sm space-y-2">
            {v.bookingRef && <div className="flex justify-between"><dt className="text-slate-aura">Booking</dt><dd className="font-mono font-semibold">{v.bookingRef}</dd></div>}
            {v.status && <div className="flex justify-between"><dt className="text-slate-aura">Status</dt><dd><StatusPill status={v.status} /></dd></div>}
            {v.route && <div className="flex justify-between"><dt className="text-slate-aura">Route</dt><dd>{typeof v.route === 'string' ? v.route : `${v.route.source} → ${v.route.destination}`}</dd></div>}
            {v.departure && <div className="flex justify-between"><dt className="text-slate-aura">Departure</dt><dd>{fmtDateTime(v.departure)}</dd></div>}
            {v.seats && <div className="flex justify-between"><dt className="text-slate-aura">Seats</dt><dd>{[].concat(v.seats).join(', ')}</dd></div>}
            {v.passengerInitials && <div className="flex justify-between"><dt className="text-slate-aura">Passengers</dt><dd>{[].concat(v.passengerInitials).join(', ')}</dd></div>}
            {v.checkedInAt && <div className="flex justify-between"><dt className="text-slate-aura">Checked in</dt><dd>{fmtDateTime(v.checkedInAt)}</dd></div>}
          </dl>
        )}
      </Card>
    </div>
  );
}
