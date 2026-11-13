import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { inr, fmtShortDate } from '../utils/format';

const axis = { fontSize: 11, fill: '#64748B' };
export function RevenueChart({ data, height = 240 }) {
  if (!data?.length) return <p className="text-sm text-slate-aura py-10 text-center">No revenue yet.</p>;
  return (
    <div role="img" aria-label="Revenue by day">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14E0C3" stopOpacity={0.35} /><stop offset="100%" stopColor="#14E0C3" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="date" tick={axis} tickFormatter={fmtShortDate} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={axis} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} tickLine={false} axisLine={false} width={40} />
          <Tooltip formatter={(v) => [inr(v), 'Revenue']} labelFormatter={fmtShortDate} />
          <Area type="monotone" dataKey="revenue" stroke="#0AA893" strokeWidth={2} fill="url(#rev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data, xKey, yKey = 'revenue', height = 240, money = true }) {
  if (!data?.length) return <p className="text-sm text-slate-aura py-10 text-center">No data yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid stroke="#E2E8F0" horizontal={false} />
        <XAxis type="number" tick={axis} tickFormatter={(v) => (money && v >= 1000 ? `${Math.round(v / 1000)}k` : v)} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey={xKey} tick={axis} width={130} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => [money ? inr(v) : v, money ? 'Revenue' : 'Count']} />
        <Bar dataKey={yKey} fill="#0B1426" radius={[0, 6, 6, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
