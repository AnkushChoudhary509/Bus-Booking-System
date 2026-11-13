import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, homeFor } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errMsg } from '../../services/api';
import { Button, Card, Field, Input, Notice, cx } from '../../components/ui';

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const [role, setRole] = useState(sp.get('role') === 'operator' ? 'operator' : 'passenger');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', orgName: '', licenseNo: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/[0-9]/.test(f.password)) return setErr('Password needs 8+ characters with a letter and a number');
    setBusy(true);
    try {
      const body = { name: f.name, email: f.email, password: f.password, role, ...(f.phone ? { phone: f.phone } : {}), ...(role === 'operator' ? { orgName: f.orgName, licenseNo: f.licenseNo } : {}) };
      const u = await register(body);
      toast.success(role === 'operator' ? 'Application submitted. An administrator will review it.' : 'Account created');
      nav(homeFor(u.role), { replace: true });
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <h1 className="text-3xl font-bold mb-2">Create your account</h1>
      <p className="text-slate-aura mb-6">Join as a traveller or register your bus company.</p>
      <div className="grid grid-cols-2 gap-2 mb-4 p-1 rounded-xl bg-slate-200/60" role="tablist">
        {['passenger', 'operator'].map((r) => <button key={r} type="button" role="tab" aria-selected={role === r} onClick={() => setRole(r)} className={cx('py-2 rounded-lg text-sm font-semibold capitalize', role === r ? 'bg-white shadow-sm' : 'text-slate-aura')}>{r === 'passenger' ? 'Passenger' : 'Bus operator'}</button>)}
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Full name"><Input value={f.name} onChange={set('name')} autoComplete="name" required /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
          <Field label="Phone (optional)"><Input value={f.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" /></Field>
          {role === 'operator' && <>
            <Field label="Organisation name"><Input value={f.orgName} onChange={set('orgName')} required /></Field>
            <Field label="Transport licence number"><Input value={f.licenseNo} onChange={set('licenseNo')} required /></Field>
            <Notice>Operator accounts need administrator approval before you can publish journeys.</Notice>
          </>}
          <Field label="Password" hint="At least 8 characters, with a letter and a number"><Input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" required /></Field>
          {err && <Notice tone="coral">{err}</Notice>}
          <Button type="submit" loading={busy} className="w-full">Create account</Button>
        </form>
        <p className="text-sm text-slate-aura mt-5 text-center">Already registered? <Link to="/login" className="font-semibold text-teal-dark">Log in</Link></p>
      </Card>
    </div>
  );
}
