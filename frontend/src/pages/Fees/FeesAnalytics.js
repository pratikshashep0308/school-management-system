// frontend/src/pages/Fees/FeesAnalytics.js
// School-wide fee analytics dashboard
// Charts built with pure SVG — no external charting library needed

import React, { useEffect, useState, useCallback } from 'react';
import feeAPI from '../../utils/feeAPI';
import { LoadingState } from '../../components/ui';
import toast from 'react-hot-toast';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt   = n  => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n||0);
const fmtK  = n  => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : fmt(n);
const pct   = (a,b) => b > 0 ? Math.round((a/b)*100) : 0;

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────
function BarChart({ data, valueKey, labelKey, color = '#1D4ED8', height = 140 }) {
  if (!data?.length) return <div style={{ height, display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF', fontSize:12 }}>No data yet</div>;

  const max     = Math.max(...data.map(d => d[valueKey] || 0)) || 1;
  const W       = 480;
  const barW    = Math.max(12, Math.floor((W - 40) / data.length) - 4);
  const padding = Math.floor((W - 40 - data.length * barW) / (data.length + 1));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height + 28}`} style={{ display:'block', overflow:'visible' }}>
      {/* Gridlines */}
      {[0.25, 0.5, 0.75, 1].map(ratio => (
        <line key={ratio} x1={20} y1={height - ratio * height} x2={W - 10} y2={height - ratio * height}
          stroke="#F3F4F6" strokeWidth={1} />
      ))}

      {data.map((d, i) => {
        const val  = d[valueKey] || 0;
        const barH = Math.max(2, (val / max) * height);
        const x    = 20 + i * (barW + padding) + padding;
        const y    = height - barH;
        const isHighest = val === max;

        return (
          <g key={i}>
            {/* Bar */}
            <rect x={x} y={y} width={barW} height={barH} rx={3}
              fill={isHighest ? color : `${color}80`}
              style={{ transition: 'all 0.3s' }}
            />
            {/* Value on top of bar (only if bar is tall enough) */}
            {barH > 20 && (
              <text x={x + barW/2} y={y - 4} textAnchor="middle" fontSize={8} fill={color} fontWeight="700">
                {fmtK(val)}
              </text>
            )}
            {/* Label */}
            <text x={x + barW/2} y={height + 16} textAnchor="middle" fontSize={9} fill="#6B7280">
              {d[labelKey]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Horizontal bar (for class/fee-type breakdown) ────────────────────────────
function HBar({ label, value, max, color = '#1D4ED8', sub }) {
  const ratio = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', flex: 1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>
        <div style={{ textAlign:'right', flexShrink: 0, marginLeft: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color }}>{fmt(value)}</span>
          {sub && <span style={{ fontSize: 10, color:'#9CA3AF', marginLeft: 4 }}>{sub}</span>}
        </div>
      </div>
      <div style={{ height: 6, background: '#F3F4F6', borderRadius: 4, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${ratio}%`, background: color, borderRadius: 4, transition:'width 0.6s ease' }} />
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, bg, border, trend }) {
  return (
    <div style={{ background: bg||'#F9FAFB', border:`1.5px solid ${border||'#E5E7EB'}`, borderRadius: 14, padding:'16px 18px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ fontSize: 22 }}>{icon}</div>
        {trend != null && (
          <span style={{
            fontSize: 10, fontWeight: 800, padding:'2px 7px', borderRadius: 20,
            background: trend >= 0 ? '#F0FDF4' : '#FEF2F2',
            color: trend >= 0 ? '#16A34A' : '#DC2626',
          }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: color||'#111827', lineHeight:1, marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color:'#374151', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color:'#9CA3AF', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────
function DonutChart({ segments, size = 120 }) {
  const total  = segments.reduce((s, seg) => s + (seg.value||0), 0) || 1;
  const R      = size * 0.35;
  const cx     = size / 2;
  const cy     = size / 2;
  const circ   = 2 * Math.PI * R;
  let   offset = circ * 0.25; // start from top

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#F3F4F6" strokeWidth={size * 0.12} />
      {segments.map((seg, i) => {
        const dash = ((seg.value||0) / total) * circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={R} fill="none"
            stroke={seg.color} strokeWidth={size * 0.12}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return el;
      })}
      {/* Center text */}
      <text x={cx} y={cy - 4}  textAnchor="middle" fontSize={size * 0.13} fontWeight="900" fill="#111">
        {Math.round((segments[0]?.value||0) / total * 100)}%
      </text>
      <text x={cx} y={cy + size * 0.1} textAnchor="middle" fontSize={size * 0.08} fill="#9CA3AF">
        collected
      </text>
    </svg>
  );
}

// ─── Collection rate badge ────────────────────────────────────────────────────
function RateBadge({ rate }) {
  const color = rate >= 90 ? '#16A34A' : rate >= 75 ? '#D97706' : rate >= 50 ? '#F97316' : '#DC2626';
  return (
    <span style={{ fontSize:11, fontWeight:800, color, background:`${color}15`, padding:'2px 8px', borderRadius:10 }}>
      {rate}%
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FeesAnalytics() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState('monthly'); // 'monthly' | 'yearly'

  const load = useCallback(() => {
    setLoading(true);
    feeAPI.getAnalytics()
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;
  if (!data)   return null;

  const {
    totalFees, totalCollected, totalPending, totalOverdue,
    totalStudents, paidCount, partialCount, notPaidCount, collectionRate,
    todayCollection, todayCount, monthlyCollection, monthlyCount,
    thisYearTotal, lastYearTotal, yearGrowthPct,
    monthlyTrend, classSummary, topClasses, bottomClasses,
    feeTypeSummary, paymentMethodBreakdown,
  } = data;

  const maxClassCollection  = Math.max(...(classSummary||[]).map(c => c.totalCollected), 1);
  const maxFeeTypeAmount    = Math.max(...(feeTypeSummary||[]).map(f => f.totalAmount), 1);
  const maxMethodAmount     = Math.max(...(paymentMethodBreakdown||[]).map(m => m.total), 1);

  const METHOD_ICONS = { cash:'💵', upi:'📱', online:'🌐', cheque:'📝', bank:'🏦' };
  const METHOD_COLORS = { cash:'#16A34A', upi:'#7C3AED', online:'#1D4ED8', cheque:'#D97706', bank:'#0284C7' };
  const CATEGORY_COLORS = { tuition:'#1D4ED8', exam:'#7C3AED', transport:'#0284C7', uniform:'#D97706', library:'#9333EA', sports:'#16A34A', other:'#6B7280' };

  const SECTION = ({ title, children, action }) => (
    <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:20 }}>
      <div style={{ padding:'14px 20px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontWeight:800, fontSize:15 }}>{title}</div>
        {action}
      </div>
      <div style={{ padding:20 }}>{children}</div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      {/* ── Header ── */}
      <div className="page-header" style={{ flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">📊 Fee Analytics</h2>
          <p className="text-sm text-muted">School-wide financial overview · {new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</p>
        </div>
        <button onClick={load} style={{ padding:'8px 16px', borderRadius:8, fontSize:12, fontWeight:700, background:'#F3F4F6', border:'1px solid #E5E7EB', cursor:'pointer' }}>
          🔄 Refresh
        </button>
      </div>

      {/* ── Row 1: Core stat cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        <StatCard icon="🏫" label="Total Fees"      value={fmtK(totalFees)}      sub={`${totalStudents} students`}         color="#111827" bg="#F8FAFC"  border="#E5E7EB" />
        <StatCard icon="💰" label="Total Collected"  value={fmtK(totalCollected)} sub={`${collectionRate}% rate`}           color="#16A34A" bg="#F0FDF4"  border="#22C55E" />
        <StatCard icon="⏳" label="Total Pending"    value={fmtK(totalPending)}   sub={`${notPaidCount} unpaid students`}   color="#D97706" bg="#FFFBEB"  border="#F59E0B" />
        <StatCard icon="🔴" label="Overdue"          value={totalOverdue}         sub="Assignments past due"                color="#7F1D1D" bg="#FEF2F2"  border="#FCA5A5" />
        <StatCard icon="📅" label="Today"            value={fmtK(todayCollection)} sub={`${todayCount} payments`}          color="#1D4ED8" bg="#EFF6FF"  border="#3B82F6" />
        <StatCard icon="📆" label="This Month"       value={fmtK(monthlyCollection)} sub={`${monthlyCount} payments`}      color="#7C3AED" bg="#F5F3FF"  border="#8B5CF6"
          trend={yearGrowthPct}
        />
      </div>

      {/* ── Row 2: Donut + Yearly comparison ── */}
      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:16, marginBottom:20 }}>
        {/* Payment status donut */}
        <div className="card" style={{ padding:20, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Payment Status</div>
          <DonutChart segments={[
            { value: totalCollected, color:'#16A34A' },
            { value: totalPending,   color:'#EF4444' },
          ]} size={120} />
          <div style={{ width:'100%', marginTop:16 }}>
            {[
              { label:'Fully Paid',   val:paidCount,    color:'#16A34A' },
              { label:'Partial',      val:partialCount,  color:'#F59E0B' },
              { label:'Unpaid',       val:notPaidCount,  color:'#EF4444' },
            ].map(s => (
              <div key={s.label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #F9FAFB' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:s.color, flexShrink:0 }} />
                  <span style={{ fontSize:11, color:'#6B7280' }}>{s.label}</span>
                </div>
                <span style={{ fontSize:12, fontWeight:800, color:s.color }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Yearly comparison card */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:16 }}>Year-over-Year Comparison</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
            {[
              { label:`${new Date().getFullYear()} (This Year)`,   val:thisYearTotal, color:'#1D4ED8', bg:'#EFF6FF' },
              { label:`${new Date().getFullYear()-1} (Last Year)`, val:lastYearTotal, color:'#6B7280', bg:'#F3F4F6' },
            ].map(y => (
              <div key={y.label} style={{ background:y.bg, borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                <div style={{ fontSize:22, fontWeight:900, color:y.color }}>{fmtK(y.val)}</div>
                <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>{y.label}</div>
              </div>
            ))}
          </div>
          {yearGrowthPct != null && (
            <div style={{
              padding:'10px 14px', borderRadius:10, textAlign:'center',
              background: yearGrowthPct >= 0 ? '#F0FDF4' : '#FEF2F2',
              border:`1px solid ${yearGrowthPct>=0?'#22C55E':'#FCA5A5'}`,
              color: yearGrowthPct>=0 ? '#166534' : '#7F1D1D',
              fontSize:13, fontWeight:700,
            }}>
              {yearGrowthPct >= 0 ? '📈' : '📉'} {Math.abs(yearGrowthPct)}% {yearGrowthPct >= 0 ? 'growth' : 'decline'} vs last year
            </div>
          )}
          {yearGrowthPct == null && (
            <div style={{ padding:'10px 14px', borderRadius:10, textAlign:'center', background:'#F8FAFC', color:'#9CA3AF', fontSize:12 }}>
              Last year data not available
            </div>
          )}
        </div>
      </div>

      {/* ── Monthly Trend Chart ── */}
      <SECTION title="📈 Monthly Collection Trend" action={
        <div style={{ display:'flex', gap:4 }}>
          {['monthly','yearly'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding:'4px 12px', borderRadius:6, fontSize:11, fontWeight:700, border:'none', cursor:'pointer',
              background: period===p ? '#1D4ED8' : '#F3F4F6',
              color:      period===p ? '#fff'    : '#6B7280',
            }}>{p.charAt(0).toUpperCase()+p.slice(1)}</button>
          ))}
        </div>
      }>
        <BarChart
          data={monthlyTrend}
          valueKey="total"
          labelKey="month"
          color="#1D4ED8"
          height={140}
        />
        {/* Monthly stats row */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:14 }}>
          {monthlyTrend.filter(m => m.total > 0).slice(0,6).map(m => (
            <div key={m.month} style={{ padding:'6px 12px', borderRadius:8, background:'#F8FAFC', border:'1px solid #E5E7EB', minWidth:80 }}>
              <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:700 }}>{m.month}</div>
              <div style={{ fontSize:13, fontWeight:900, color:'#1D4ED8' }}>{fmtK(m.total)}</div>
              <div style={{ fontSize:9, color:'#6B7280' }}>{m.count} payments</div>
            </div>
          ))}
        </div>
      </SECTION>

      {/* ── Row 3: Class breakdown + Fee type ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>

        {/* Class-wise collection */}
        <SECTION title="🏛 Class-wise Collection">
          {!classSummary?.length ? (
            <div style={{ color:'#9CA3AF', fontSize:13, textAlign:'center', padding:20 }}>No data yet</div>
          ) : classSummary.map((c,i) => (
            <HBar
              key={c._id||i}
              label={c.className?.trim() || `Class ${i+1}`}
              value={c.totalCollected}
              max={maxClassCollection}
              color={c.collectionRate >= 90 ? '#16A34A' : c.collectionRate >= 75 ? '#1D4ED8' : c.collectionRate >= 50 ? '#D97706' : '#EF4444'}
              sub={<RateBadge rate={c.collectionRate} />}
            />
          ))}
        </SECTION>

        {/* Fee type breakdown */}
        <SECTION title="🏷 Fee Type Breakdown">
          {!feeTypeSummary?.length ? (
            <div style={{ color:'#9CA3AF', fontSize:13, textAlign:'center', padding:20 }}>
              No fee assignments yet.<br />
              <span style={{ fontSize:11 }}>Create fee types and assign them to students to see this breakdown.</span>
            </div>
          ) : feeTypeSummary.map((f,i) => {
            const color = CATEGORY_COLORS[f.category] || '#6B7280';
            const rate  = pct(f.paidAmount, f.totalAmount);
            return (
              <div key={f._id||i} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <div>
                    <span style={{ fontSize:12, fontWeight:700, color:'#374151' }}>{f.typeName}</span>
                    <span style={{ fontSize:9, fontWeight:700, color, background:`${color}15`, padding:'1px 6px', borderRadius:8, marginLeft:6, textTransform:'capitalize' }}>{f.category}</span>
                  </div>
                  <span style={{ fontSize:13, fontWeight:900, color }}>{fmt(f.totalAmount)}</span>
                </div>
                <div style={{ height:6, background:'#F3F4F6', borderRadius:4, overflow:'hidden', marginBottom:2 }}>
                  <div style={{ height:'100%', width:`${Math.max(2,pct(f.paidAmount,f.totalAmount))}%`, background:color, borderRadius:4 }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#9CA3AF' }}>
                  <span>Collected: {fmt(f.paidAmount)}</span>
                  <span>Pending: {fmt(f.pendingAmount)}</span>
                  <span style={{ fontWeight:700, color: rate>=75?'#16A34A':'#D97706' }}>{rate}%</span>
                </div>
              </div>
            );
          })}
        </SECTION>
      </div>

      {/* ── Row 4: Top classes + Bottom classes + Payment methods ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:20 }}>

        {/* Top performers */}
        <SECTION title="🏆 Top Collecting Classes">
          {!topClasses?.length ? (
            <div style={{ color:'#9CA3AF', fontSize:12, textAlign:'center' }}>No data</div>
          ) : topClasses.map((c,i) => (
            <div key={c._id||i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #F9FAFB' }}>
              <div style={{
                width:26, height:26, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900,
                background: i===0?'#FEF3C7': i===1?'#F3F4F6': i===2?'#FEF3C7':'#F9FAFB',
                color: i===0?'#D97706': i===1?'#6B7280': '#D97706',
              }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.className?.trim()||'—'}</div>
                <div style={{ fontSize:10, color:'#6B7280' }}>{fmt(c.totalCollected)}</div>
              </div>
              <RateBadge rate={c.collectionRate} />
            </div>
          ))}
        </SECTION>

        {/* Needs attention */}
        <SECTION title="⚠️ Needs Attention">
          {!bottomClasses?.length ? (
            <div style={{ color:'#9CA3AF', fontSize:12, textAlign:'center' }}>No data</div>
          ) : bottomClasses.map((c,i) => (
            <div key={c._id||i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #F9FAFB' }}>
              <div style={{ width:26, height:26, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, background:'#FEF2F2', color:'#DC2626' }}>!</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.className?.trim()||'—'}</div>
                <div style={{ fontSize:10, color:'#DC2626', fontWeight:600 }}>{fmt(c.totalPending)} pending · {c.notPaidCount} unpaid</div>
              </div>
              <RateBadge rate={c.collectionRate} />
            </div>
          ))}
        </SECTION>

        {/* Payment methods */}
        <SECTION title="💳 Payment Methods">
          {!paymentMethodBreakdown?.length ? (
            <div style={{ color:'#9CA3AF', fontSize:12, textAlign:'center' }}>No payments recorded</div>
          ) : paymentMethodBreakdown.map((m,i) => {
            const color = METHOD_COLORS[m._id] || '#6B7280';
            const icon  = METHOD_ICONS[m._id]  || '💳';
            return (
              <div key={m._id||i} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:14 }}>{icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#374151', textTransform:'uppercase' }}>{m._id}</span>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:12, fontWeight:900, color }}>{fmt(m.total)}</div>
                    <div style={{ fontSize:9, color:'#9CA3AF' }}>{m.count} payments</div>
                  </div>
                </div>
                <div style={{ height:5, background:'#F3F4F6', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.max(2,pct(m.total, maxMethodAmount))}%`, background:color, borderRadius:4 }} />
                </div>
              </div>
            );
          })}
        </SECTION>
      </div>

      {/* ── Full class table ── */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:15 }}>📋 Complete Class-wise Summary</div>
          <div style={{ fontSize:12, color:'#6B7280' }}>{classSummary?.length||0} classes</div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#1E3A8A' }}>
                {['Class','Students','Total Fees','Collected','Pending','Paid','Partial','Unpaid','Rate'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(classSummary||[]).map((c,i) => (
                <tr key={c._id||i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                  <td style={{ padding:'10px 14px', fontWeight:700 }}>{c.className?.trim()||'—'}</td>
                  <td style={{ padding:'10px 14px', color:'#6B7280' }}>{c.studentCount}</td>
                  <td style={{ padding:'10px 14px' }}>{fmt(c.totalFees)}</td>
                  <td style={{ padding:'10px 14px', color:'#16A34A', fontWeight:700 }}>{fmt(c.totalCollected)}</td>
                  <td style={{ padding:'10px 14px', color:'#DC2626', fontWeight:700 }}>{fmt(c.totalPending)}</td>
                  <td style={{ padding:'10px 14px', color:'#16A34A' }}>{c.paidCount}</td>
                  <td style={{ padding:'10px 14px', color:'#D97706' }}>{c.studentCount - c.paidCount - c.notPaidCount}</td>
                  <td style={{ padding:'10px 14px', color:'#DC2626' }}>{c.notPaidCount}</td>
                  <td style={{ padding:'10px 14px' }}><RateBadge rate={c.collectionRate} /></td>
                </tr>
              ))}
            </tbody>
            {/* Totals footer */}
            <tfoot>
              <tr style={{ background:'#1E3A8A', color:'#fff' }}>
                <td style={{ padding:'10px 14px', fontWeight:900, fontSize:12 }}>SCHOOL TOTAL</td>
                <td style={{ padding:'10px 14px', fontWeight:800 }}>{totalStudents}</td>
                <td style={{ padding:'10px 14px', fontWeight:800 }}>{fmt(totalFees)}</td>
                <td style={{ padding:'10px 14px', fontWeight:800, color:'#86EFAC' }}>{fmt(totalCollected)}</td>
                <td style={{ padding:'10px 14px', fontWeight:800, color:'#FCA5A5' }}>{fmt(totalPending)}</td>
                <td style={{ padding:'10px 14px', fontWeight:800 }}>{paidCount}</td>
                <td style={{ padding:'10px 14px', fontWeight:800 }}>{partialCount}</td>
                <td style={{ padding:'10px 14px', fontWeight:800 }}>{notPaidCount}</td>
                <td style={{ padding:'10px 14px' }}><span style={{ fontSize:12, fontWeight:900, color: collectionRate>=75?'#86EFAC':'#FCA5A5' }}>{collectionRate}%</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}