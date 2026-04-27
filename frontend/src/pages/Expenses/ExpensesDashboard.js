// frontend/src/pages/Expenses/ExpensesDashboard.js
import React, { useEffect, useState } from 'react';
import { expenseAPI } from '../../utils/api';
import { LoadingState } from '../../components/ui';
import toast from 'react-hot-toast';

const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const METHOD_COLORS = { cash:'#16A34A', upi:'#7C3AED', bank:'#2563EB', cheque:'#D97706', online:'#0891B2' };

// ── SVG bar chart ─────────────────────────────────────────────────────────────
function BarChart({ data, colorKey = 'total' }) {
  if (!data?.length) return <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF', fontSize:12 }}>No data</div>;
  const max = Math.max(...data.map(d => d.total || d[colorKey] || 0), 1);
  const W = 500, H = 100;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 22}`} style={{ display:'block' }}>
      {data.map((d, i) => {
        const bW  = Math.max(4, Math.floor((W - 20) / data.length) - 4);
        const x   = 10 + i * ((W - 20) / data.length);
        const bH  = Math.max(2, ((d.total || 0) / max) * H);
        const y   = H - bH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bW} height={bH} rx={3} fill="#DC2626" opacity={0.8} />
            <text x={x + bW / 2} y={H + 14} textAnchor="middle" fontSize={8} fill="#9CA3AF">
              {d.label || d._id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ segments, centerLabel }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const R = 40, cx = 50, cy = 50, circ = 2 * Math.PI * R;
  let offset = circ * 0.25;
  return (
    <svg width={100} height={100} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#F3F4F6" strokeWidth={14} />
      {segments.map((s, i) => {
        const dash = (s.value / total) * circ;
        const el = <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.color || '#DC2626'} strokeWidth={14} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} />;
        offset += dash;
        return el;
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={9} fill="#6B7280">Total</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={10} fontWeight="800" fill="#111">{centerLabel || ''}</text>
    </svg>
  );
}

// ── Profit/Loss indicator ─────────────────────────────────────────────────────
function PLCard({ income, expenses }) {
  const profit   = income - expenses;
  const isProfit = profit >= 0;
  const pct      = income > 0 ? Math.abs(Math.round((profit / income) * 100)) : 0;

  return (
    <div style={{
      padding: 20, borderRadius: 12,
      background: isProfit ? 'linear-gradient(135deg, #F0FDF4, #DCFCE7)' : 'linear-gradient(135deg, #FEF2F2, #FEE2E2)',
      border: `1.5px solid ${isProfit ? '#22C55E' : '#EF4444'}`,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: isProfit ? '#16A34A' : '#DC2626', marginBottom: 8 }}>
        {isProfit ? '📈 PROFIT' : '📉 DEFICIT'}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: isProfit ? '#15803D' : '#B91C1C' }}>
        {isProfit ? '+' : '-'}{fmt(Math.abs(profit))}
      </div>
      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
        {pct}% {isProfit ? 'surplus' : 'over budget'}
      </div>
      <div style={{ height: 4, background: '#E5E7EB', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3,
          width: `${Math.min(100, (expenses / Math.max(income, 1)) * 100)}%`,
          background: isProfit ? '#22C55E' : '#EF4444',
          transition: 'width 0.8s',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#9CA3AF' }}>
        <span>Income: {fmt(income)}</span>
        <span>Expenses: {fmt(expenses)}</span>
      </div>
    </div>
  );
}

export default function ExpensesDashboard({ onAdd, onNavigate }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    expenseAPI.getDashboard()
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  const t = data?.totals;
  const iv = data?.incomeVsExpense;

  const STAT_CARDS = [
    { icon: '💸', label: 'Total Expenses',  val: fmt(t?.allTime?.amount),   sub: `${t?.allTime?.count || 0} entries`,  color: '#DC2626', bg: '#FEF2F2', onClick: ()=>onNavigate('list','all')    },
    { icon: '📅', label: 'This Month',       val: fmt(t?.thisMonth?.amount), sub: `${t?.thisMonth?.count || 0} entries`, color: '#D97706', bg: '#FFFBEB', onClick: ()=>onNavigate('list','month') },
    { icon: '🗓',  label: 'Today',            val: fmt(t?.today?.amount),     sub: `${t?.today?.count || 0} today`,      color: '#7C3AED', bg: '#F5F3FF', onClick: ()=>onNavigate('list','today') },
    { icon: '📆', label: 'This Year',        val: fmt(t?.thisYear?.amount),  sub: `${t?.thisYear?.count || 0} entries`, color: '#0891B2', bg: '#F0F9FF', onClick: ()=>onNavigate('list','year')  },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">💸 Expenses Dashboard</h2>
          <p className="text-sm text-muted mt-0.5">School financial overview</p>
        </div>
        <button onClick={onAdd} className="btn-primary" style={{ background: '#DC2626', borderColor: '#DC2626' }}>
          ➕ Add Expense
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12, marginBottom:20 }}>
        {STAT_CARDS.map(c => (
          <div key={c.label} className="card" onClick={c.onClick}
            style={{ padding:'16px 18px', borderLeft:`4px solid ${c.color}`, cursor:'pointer', transition:'all 0.15s' }}
            onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=`0 6px 20px ${c.color}30`; }}
            onMouseLeave={e=>{ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
            <div style={{ fontSize:22, marginBottom:8 }}>{c.icon}</div>
            <div style={{ fontSize:22, fontWeight:900, color:c.color }}>{c.val}</div>
            <div style={{ fontSize:11, color:'#6B7280', marginTop:3, fontWeight:600 }}>{c.label}</div>
            <div style={{ fontSize:10, color:'#9CA3AF', marginTop:2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        {/* Income vs Expense P&L */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>📊 Income vs Expenses</div>
          <PLCard income={iv?.totalIncome || 0} expenses={iv?.totalExpenses || 0} />
        </div>

        {/* Monthly trend */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>📈 Monthly Trend</div>
          <BarChart data={data?.monthlyTrend || []} />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:16, marginBottom:20 }}>
        {/* Category donut */}
        <div className="card" style={{ padding:20, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>By Category</div>
          <DonutChart
            segments={(data?.categoryBreakdown || []).slice(0,6).map((c, i) => ({
              value: c.total,
              color: c.color || ['#DC2626','#F97316','#EAB308','#22C55E','#3B82F6','#8B5CF6'][i % 6],
            }))}
            centerLabel={fmt(t?.allTime?.amount).replace('₹', '').replace(',', '')}
          />
        </div>

        {/* Category breakdown table */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:13 }}>Category Breakdown</div>
          {data?.categoryBreakdown?.length ? (
            <div>
              {data.categoryBreakdown.map((c, i) => {
                const pct = t?.allTime?.amount > 0 ? Math.round((c.total / t.allTime.amount) * 100) : 0;
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #F3F4F6' }}>
                    <span style={{ fontSize:16 }}>{c.icon || '💰'}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:700 }}>{c.name}</div>
                      <div style={{ height:4, background:'#F3F4F6', borderRadius:3, marginTop:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background: c.color || '#DC2626', borderRadius:3, transition:'width 0.6s' }} />
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:13, fontWeight:800, color:'#DC2626' }}>{fmt(c.total)}</div>
                      <div style={{ fontSize:10, color:'#9CA3AF' }}>{pct}% · {c.count} entries</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <div style={{ padding:24, textAlign:'center', color:'#9CA3AF', fontSize:12 }}>No expenses yet</div>}
        </div>
      </div>
    </div>
  );
}