import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { put, errMsg } from '../../services/api';
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select } from '../../components/ui';

export default function Profile() {
  const { user, operator, setUser } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: user.name, phone: user.phone || '', gender: user.gender || '' });
  const [saved, setSaved] = useState(user.savedPassengers || []);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(''); const [pwErr, setPwErr] = useState('');

  const save = async (e) => {
    e.preventDefault(); setBusy('p');
    try {
      const body = { name: f.name, ...(f.phone && { phone: f.phone }), gender: f.gender, ...(user.role === 'passenger' && { savedPassengers: saved.filter((p) => p.name).map((p) => ({ name: p.name, age: Number(p.age), gender: p.gender })) }) };
      const r = await put('/users/me', body); setUser(r.data.user); toast.success('Profile updated');
    } catch (x) { toast.error(errMsg(x)); } finally { setBusy(''); }
  };
  const changePw = async (e) => {
    e.preventDefault(); setPwErr(''); setBusy('w');
    try { await put('/users/me/password', pw); setPw({ currentPassword: '', newPassword: '' }); toast.success('Password changed'); } catch (x) { setPwErr(errMsg(x)); } finally { setBusy(''); }
  };
  const setP = (i, k, v) => setSaved(saved.map((p, x) => (x === i ? { ...p, [k]: v } : p)));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <PageHeader title="Your profile" subtitle={user.email} actions={<Badge tone="navy" className="capitalize">{user.role}</Badge>} />
      {operator && <Notice tone={operator.approvalStatus === 'approved' ? 'teal' : 'amber'}>{operator.orgName}: {operator.approvalStatus}{operator.rejectionReason && ` (${operator.rejectionReason})`}</Notice>}
      <Card className="p-6">
        <form onSubmit={save} className="space-y-4">
          <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" /></Field>
            <Field label="Gender"><Select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">Prefer not to say</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></Select></Field></div>
          {user.role === 'passenger' && (
            <fieldset><legend className="text-sm font-medium mb-2">Saved passengers</legend>
              <div className="space-y-2">{saved.map((p, i) => <div key={i} className="grid grid-cols-[1fr_5rem_7rem_auto] gap-2"><Input aria-label="Name" value={p.name} onChange={(e) => setP(i, 'name', e.target.value)} placeholder="Name" /><Input aria-label="Age" type="number" value={p.age} onChange={(e) => setP(i, 'age', e.target.value)} placeholder="Age" /><Select aria-label="Gender" value={p.gender} onChange={(e) => setP(i, 'gender', e.target.value)}><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></Select><Button type="button" variant="ghost" aria-label="Remove passenger" onClick={() => setSaved(saved.filter((_, x) => x !== i))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
              {saved.length < 10 && <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setSaved([...saved, { name: '', age: '', gender: 'male' }])}><Plus className="h-4 w-4" />Add passenger</Button>}
            </fieldset>)}
          <Button type="submit" loading={busy === 'p'}>Save changes</Button>
        </form>
      </Card>
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Change password</h2>
        <form onSubmit={changePw} className="space-y-4">
          <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></Field>
          <Field label="New password" hint="8+ characters, with a letter and a number"><Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></Field>
          {pwErr && <Notice tone="coral">{pwErr}</Notice>}
          <Button type="submit" variant="dark" loading={busy === 'w'}>Update password</Button>
        </form>
      </Card>
    </div>
  );
}
