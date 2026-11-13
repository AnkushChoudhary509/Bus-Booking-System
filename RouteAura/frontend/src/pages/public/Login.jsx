import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errMsg } from '../../services/api';
import { Button, Card, Field, Input, Notice } from '../../components/ui';

const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === 'true';
const DEMOS = [['Passenger', 'passenger@routeaura.test'], ['Operator', 'operator@routeaura.test'], ['Admin', 'admin@routeaura.test']];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const u = await login(f.email, f.password);
      toast.success(`Welcome back, ${u.name.split(' ')[0]}`);
      nav(loc.state?.from || homeFor(u.role), { replace: true });
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
      <p className="text-slate-aura mb-6">Log in to manage your journeys.</p>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email"><Input type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="Password"><Input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
          {err && <Notice tone="coral">{err}</Notice>}
          <Button type="submit" loading={busy} className="w-full">Log in</Button>
        </form>
        <p className="text-sm text-slate-aura mt-5 text-center">New to RouteAura? <Link to="/register" className="font-semibold text-teal-dark">Create an account</Link></p>
      </Card>
      {SHOW_DEMO && (
        <Card className="p-4 mt-4 bg-amber-aura/5">
          <p className="text-xs font-semibold text-[#7a4f00] mb-2">DEMO ACCOUNTS (development only, password Demo@12345)</p>
          <div className="flex gap-2 flex-wrap">{DEMOS.map(([l, e]) => <Button key={e} size="sm" variant="outline" type="button" onClick={() => setF({ email: e, password: 'Demo@12345' })}>{l}</Button>)}</div>
        </Card>
      )}
    </div>
  );
}
