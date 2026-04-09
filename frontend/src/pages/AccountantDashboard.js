import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { feeAPI, studentAPI } from '../utils/api';
import { LoadingState, Badge, Avatar } from '../components/ui';

// Mini sparkline bar chart
function BarChart({ data, color = '#4a7c59' }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t-md transition-all hover:opacity-80"
            style={{ height: `${(d.value / max) * 52}px`, background: color, minHeight: '4px' }} />
          <div className="text-[9px] text-muted">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function AccountantDashboard() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      feeAPI.getPayments().catch(() => ({ data: { data: [] } })),
      studentAPI.getAll().catch(() => ({ data: { data: [] } })),
    ]).then(([fRes, sRes]) => {
      setPayments(fRes.data.data);
      setStudents(sRes.data.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  const totalCollected = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);
  const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + (p.amount || 0), 0);
  const totalOverdue = payments.filter(p => p.status === 'overdue').reduce((s, p) => s + (p.amount || 0), 0);
  const totalPartial = payments.filter(p => p.status === 'partial').reduce((s, p) => s + (p.amount || 0), 0);

  const recentPayments = payments.filter(p => p.status === 'paid').slice(0, 8);
  const overdueList = payments.filter(p => p.status === 'overdue' || p.status === 'pending').slice(0, 5);

  // Monthly chart mock data
  const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const monthlyData = months.map((label, i) => ({ label, value: 40000 + Math.random() * 60000 }));

  // Payment method breakdown
  const methods = {};
  payments.forEach(p => { if (p.method) methods[p.method] = (methods[p.method] || 0) + p.amount; });
  const methodEntries = Object.entries(methods).sort((a, b) => b[1] - a[1]);

  const collectionRate = totalCollected + totalPending + totalOverdue > 0
    ? Math.round((totalCollected / (totalCollected + totalPending + totalOverdue)) * 100) : 0;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-7">
        <h1 className="font-display text-3xl text-ink">Financial Dashboard 💰</h1>
        <p className="text-sm text-muted mt-1">Complete overview of school finances and fee collections.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          { icon: '✅', label: 'Total Collected', value: `₹${(totalCollected / 100000).toFixed(1)}L`, sub: `${payments.filter(p => p.status === 'paid').length} payments`, color: '#4a7c59', bar: 'bg-sage' },
          { icon: '⏳', label: 'Pending', value: `₹${(totalPending / 100000).toFixed(1)}L`, sub: `${payments.filter(p => p.status === 'pending').length} dues`, color: '#c9a84c', bar: 'bg-gold' },
          { icon: '🔴', label: 'Overdue', value: `₹${(totalOverdue / 100000).toFixed(1)}L`, sub: `${payments.filter(p => p.status === 'overdue').length} accounts`, color: '#d4522a', bar: 'bg-accent' },
          { icon: '📊', label: 'Collection Rate', value: `${collectionRate}%`, sub: 'Of total dues', color: '#7c6af5', bar: 'bg-purple-500' },
        ].map(s => (
          <div key={s.label} className="card p-5 relative overflow-hidden hover:-translate-y-0.5 transition-transform">
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${s.bar}`} />
            <div className="text-2xl mb-3">{s.icon}</div>
            <div className="font-display text-3xl leading-none mb-0.5" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-muted mt-1 font-medium">{s.label}</div>
            <div className="text-[11px] text-muted/70">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-3 gap-5 mb-5">
        {/* Monthly collection chart */}
        <div className="xl:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="font-semibold text-ink">Monthly Fee Collection</div>
            <div className="text-xs text-muted">Last 7 months</div>
          </div>
          <BarChart data={monthlyData} color="#4a7c59" />
          <div className="mt-4 pt-4 border-t border-border flex gap-6">
            {[
              { label: 'This Month', value: `₹${(monthlyData[6]?.value / 100000).toFixed(1)}L` },
              { label: 'Last Month', value: `₹${(monthlyData[5]?.value / 100000).toFixed(1)}L` },
              { label: 'Avg/Month', value: `₹${(monthlyData.reduce((s, d) => s + d.value, 0) / monthlyData.length / 100000).toFixed(1)}L` },
            ].map(m => (
              <div key={m.label}>
                <div className="text-xs text-muted">{m.label}</div>
                <div className="font-semibold text-ink text-sm">{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment method breakdown */}
        <div className="card p-6">
          <div className="font-semibold text-ink mb-5">Payment Methods</div>
          <div className="space-y-3">
            {methodEntries.length === 0 ? (
              [['cash', 45], ['upi', 30], ['online', 15], ['cheque', 7], ['bank', 3]].map(([m, pct]) => (
                <div key={m}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate capitalize">{m.toUpperCase()}</span>
                    <span className="font-semibold text-ink">{pct}%</span>
                  </div>
                  <div className="h-2 bg-warm rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))
            ) : methodEntries.map(([method, amount]) => {
              const pct = Math.round((amount / (totalCollected || 1)) * 100);
              return (
                <div key={method}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate capitalize">{method.toUpperCase()}</span>
                    <span className="font-semibold text-ink">{pct}%</span>
                  </div>
                  <div className="h-2 bg-warm rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-5 mb-5">
        {/* Recent payments */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="font-semibold text-ink">Recent Payments</div>
            <button onClick={() => navigate('/fees')} className="text-xs text-accent hover:underline">View all</button>
          </div>
          {!recentPayments.length ? (
            <div className="py-10 text-center text-muted text-sm">No payments yet</div>
          ) : recentPayments.map(p => (
            <div key={p._id} className="flex items-center gap-3 px-5 py-3 border-t border-border hover:bg-warm/40 transition-colors">
              <Avatar name={p.student?.user?.name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">{p.student?.user?.name}</div>
                <div className="text-xs text-muted font-mono">{p.receiptNumber}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-sm text-sage">₹{p.amount?.toLocaleString('en-IN')}</div>
                <div className="text-xs text-muted">{p.month}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Overdue accounts */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="font-semibold text-ink">Overdue / Pending</div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${overdueList.length > 0 ? 'bg-accent/10 text-accent' : 'bg-sage/10 text-sage'}`}>
              {overdueList.length} accounts
            </span>
          </div>
          {!overdueList.length ? (
            <div className="py-10 text-center">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-sm text-muted">No overdue payments!</div>
            </div>
          ) : overdueList.map(p => (
            <div key={p._id} className="flex items-center gap-3 px-5 py-3 border-t border-border hover:bg-warm/40 transition-colors">
              <Avatar name={p.student?.user?.name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">{p.student?.user?.name}</div>
                <div className="text-xs text-muted">{p.month}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-sm text-accent">₹{p.amount?.toLocaleString('en-IN')}</div>
                <Badge status={p.status} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: '➕', label: 'Record Payment', to: '/fees', color: 'bg-sage/10 text-sage' },
          { icon: '📋', label: 'Fee Structures', to: '/fees', color: 'bg-gold/15 text-gold' },
          { icon: '📊', label: 'All Students', to: '/students', color: 'bg-accent/10 text-accent' },
          { icon: '🖨', label: 'Export Report', to: '/fees', color: 'bg-purple-50 text-purple-600' },
        ].map(({ icon, label, to, color }) => (
          <button key={to + label} onClick={() => navigate(to)}
            className="card px-4 py-5 flex flex-col items-center gap-2 hover:-translate-y-0.5 transition-all cursor-pointer">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${color}`}>{icon}</div>
            <div className="text-sm font-medium text-ink">{label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}