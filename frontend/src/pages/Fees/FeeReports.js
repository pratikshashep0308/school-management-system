// frontend/src/pages/Fees/FeeReports.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { LoadingState } from '../../components/ui';

const fmt  = n => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n||0);
const fmtK = n => n>=100000 ? `₹${(n/100000).toFixed(1)}L` : n>=1000 ? `₹${(n/1000).toFixed(0)}K` : fmt(n);
const pct  = (a,b) => b>0 ? ((a/b)*100).toFixed(1) : '0.0';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── SVG bar chart ─────────────────────────────────────────────────────────────
function BarChart({ data, color = '#1D4ED8', H = 130 }) {
  if (!data?.length) return (
    <div style={{ height:H, display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF', fontSize:12 }}>
      No data yet
    </div>
  );
  const max = Math.max(...data.map(d => d.v||0), 1);
  const W   = 520;
  const bW  = Math.max(12, Math.floor((W - 40) / data.length) - 6);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H+26}`} style={{ display:'block' }}>
      {[.25,.5,.75,1].map(r => (
        <line key={r} x1={20} y1={H - r*H} x2={W-10} y2={H - r*H} stroke="#F3F4F6" strokeWidth={1}/>
      ))}
      {data.map((d, i) => {
        const bH = Math.max(3, ((d.v||0)/max)*H);
        const x  = 20 + i * ((W-40)/data.length) + 3;
        return (
          <g key={i}>
            <rect x={x} y={H-bH} width={bW} height={bH} rx={3}
              fill={d.v===max ? color : `${color}70`}/>
            {bH > 20 && (
              <text x={x+bW/2} y={H-bH-4} textAnchor="middle" fontSize={8} fill={color} fontWeight="700">
                {fmtK(d.v)}
              </text>
            )}
            <text x={x+bW/2} y={H+18} textAnchor="middle" fontSize={9} fill="#9CA3AF">{d.l}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Horizontal progress bar ───────────────────────────────────────────────────
function HBar({ label, value, max, color = '#1D4ED8', sub }) {
  const ratio = max > 0 ? Math.min(100, (value/max)*100) : 0;
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'#374151', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginRight:8 }}>{label}</span>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:900, color }}>{fmtK(value)}</span>
          {sub && <span style={{ fontSize:10, color:'#9CA3AF', marginLeft:5 }}>{sub}</span>}
        </div>
      </div>
      <div style={{ height:7, background:'#F3F4F6', borderRadius:4, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${ratio}%`, background:color, borderRadius:4, transition:'width 0.7s ease' }}/>
      </div>
    </div>
  );
}

export default function FeeReports() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    // analytics endpoint already contains everything we need
    feeAPI.getAnalytics()
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async (format) => {
    setExporting(format);
    try {
      const token = localStorage.getItem('token');
      const base  = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
      const res   = await fetch(`${base}/fees/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fee-report-${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch { toast.error('Export failed. Try again.'); }
    finally { setExporting(''); }
  };

  if (loading) return <LoadingState />;

  const d  = data || {};
  const cs = d.classSummary || [];

  // Monthly trend chart data
  const trendData = (d.monthlyTrend || []).map(m => ({
    l: MONTHS[(m._id?.month || m.month || 1) - 1],
    v: m.total || 0,
  }));

  // Payment method breakdown
  const methodData = (d.paymentMethodBreakdown || []).map(m => ({
    l: m._id || '—',
    v: m.total || 0,
  }));

  const collRate = d.collectionRate || Number(pct(d.totalCollected, d.totalFees));
  const maxClass = Math.max(...cs.map(c => c.totalCollected||0), 1);

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ flexWrap:'wrap', gap:10, marginBottom:20 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">📈 Fee Reports & Analytics</h2>
          <p className="text-sm text-muted">School-wide financial analysis and insights</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => handleExport('xlsx')} disabled={!!exporting}
            style={{ padding:'9px 16px', borderRadius:9, fontSize:12, fontWeight:700, background:'#F0FDF4', border:'1.5px solid #22C55E', color:'#15803D', cursor:'pointer', opacity:exporting==='xlsx'?0.6:1 }}>
            {exporting==='xlsx' ? '⏳' : '⬇'} Excel
          </button>
          <button onClick={() => handleExport('pdf')} disabled={!!exporting}
            style={{ padding:'9px 16px', borderRadius:9, fontSize:12, fontWeight:700, background:'#FEF2F2', border:'1.5px solid #EF4444', color:'#DC2626', cursor:'pointer', opacity:exporting==='pdf'?0.6:1 }}>
            {exporting==='pdf' ? '⏳' : '⬇'} PDF
          </button>
        </div>
      </div>

      {/* KPI summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { icon:'🏫', label:'Total Expected',    val:fmtK(d.totalFees),       color:'#111827', bg:'#F8FAFC', border:'#E5E7EB' },
          { icon:'💰', label:'Total Collected',   val:fmtK(d.totalCollected),  color:'#16A34A', bg:'#F0FDF4', border:'#22C55E' },
          { icon:'⏳', label:'Total Pending',     val:fmtK(d.totalPending),    color:'#D97706', bg:'#FFFBEB', border:'#F59E0B' },
          { icon:'📅', label:'This Month',        val:fmtK(d.monthlyCollection),color:'#1D4ED8', bg:'#EFF6FF', border:'#3B82F6' },
          { icon:'📆', label:'This Year',         val:fmtK(d.thisYearTotal),   color:'#7C3AED', bg:'#F5F3FF', border:'#8B5CF6' },
          { icon:'📊', label:'Collection Rate',   val:`${collRate}%`,           color:'#0891B2', bg:'#F0F9FF', border:'#BAE6FD' },
          { icon:'✅', label:'Fully Paid',         val:d.paidCount||0,          color:'#16A34A', bg:'#F0FDF4', border:'#22C55E' },
          { icon:'🔴', label:'Overdue',            val:d.totalOverdue||0,       color:'#DC2626', bg:'#FEF2F2', border:'#EF4444' },
        ].map(c => (
          <div key={c.label} style={{ background:c.bg, border:`1.5px solid ${c.border}`, borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:20, marginBottom:8 }}>{c.icon}</div>
            <div style={{ fontSize:20, fontWeight:900, color:c.color }}>{c.val}</div>
            <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginTop:4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Collection rate hero bar */}
      <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>Overall Collection Rate</div>
          <div style={{ fontSize:28, fontWeight:900, color:'#fff' }}>{collRate}%</div>
        </div>
        <div style={{ height:10, background:'rgba(255,255,255,0.1)', borderRadius:6, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${Math.min(100,collRate)}%`, borderRadius:6, transition:'width 1s',
            background: collRate>=75 ? 'linear-gradient(90deg,#34D399,#059669)' : 'linear-gradient(90deg,#FCD34D,#F59E0B)',
          }}/>
        </div>
        <div style={{ display:'flex', gap:24, marginTop:12, flexWrap:'wrap' }}>
          {[
            { label:'This Month', val:fmtK(d.monthlyCollection), color:'#93C5FD' },
            { label:'This Year',  val:fmtK(d.thisYearTotal),     color:'#6EE7B7' },
            { label:'Last Year',  val:fmtK(d.lastYearTotal),     color:'rgba(255,255,255,0.4)' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{s.label}</div>
              <div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>

        {/* Monthly trend */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>📈 Monthly Collection Trend</div>
          {trendData.length > 0
            ? <BarChart data={trendData} color="#1D4ED8" H={130} />
            : <div style={{ color:'#9CA3AF', fontSize:12, textAlign:'center', padding:20 }}>No monthly data yet</div>}
        </div>

        {/* Payment method breakdown */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>💳 Payment Methods</div>
          {methodData.length > 0 ? (
            <>
              <BarChart data={methodData} color="#7C3AED" H={130} />
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:10 }}>
                {methodData.map((m,i) => {
                  const colors = ['#7C3AED','#1D4ED8','#16A34A','#D97706','#DC2626'];
                  return (
                    <div key={i} style={{ fontSize:11, fontWeight:700, color:colors[i%colors.length], background:`${colors[i%colors.length]}15`, padding:'3px 10px', borderRadius:20 }}>
                      {m.l}: {fmtK(m.v)}
                    </div>
                  );
                })}
              </div>
            </>
          ) : <div style={{ color:'#9CA3AF', fontSize:12, textAlign:'center', padding:20 }}>No payment data yet</div>}
        </div>
      </div>

      {/* Status breakdown */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Payment Status</div>
          {[
            { label:'Fully Paid',  val:d.paidCount||0,    color:'#16A34A', pct: Math.round(((d.paidCount||0)/(d.totalStudents||1))*100) },
            { label:'Partial',     val:d.partialCount||0, color:'#7C3AED', pct: Math.round(((d.partialCount||0)/(d.totalStudents||1))*100) },
            { label:'Not Paid',    val:d.notPaidCount||0, color:'#DC2626', pct: Math.round(((d.notPaidCount||0)/(d.totalStudents||1))*100) },
          ].map(s => (
            <div key={s.label} style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:s.color }}/>
                  <span style={{ fontSize:12, fontWeight:600 }}>{s.label}</span>
                </div>
                <div style={{ fontSize:12, fontWeight:800, color:s.color }}>{s.val} ({s.pct}%)</div>
              </div>
              <div style={{ height:7, background:'#F3F4F6', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${s.pct}%`, background:s.color, borderRadius:4, transition:'width 0.7s' }}/>
              </div>
            </div>
          ))}
        </div>

        {/* Year comparison */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Year Comparison</div>
          {[
            { label:`This Year (${new Date().getFullYear()})`, val:d.thisYearTotal||0, color:'#16A34A' },
            { label:`Last Year (${new Date().getFullYear()-1})`, val:d.lastYearTotal||0, color:'#9CA3AF' },
          ].map(s => (
            <HBar key={s.label} label={s.label} value={s.val}
              max={Math.max(d.thisYearTotal||0, d.lastYearTotal||0, 1)} color={s.color}/>
          ))}
          {(d.thisYearTotal||0) > 0 && (d.lastYearTotal||0) > 0 && (
            <div style={{ marginTop:14, padding:'12px 14px', borderRadius:10,
              background: d.thisYearTotal >= d.lastYearTotal ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${d.thisYearTotal >= d.lastYearTotal ? '#22C55E' : '#EF4444'}` }}>
              <div style={{ fontSize:13, fontWeight:700, color: d.thisYearTotal >= d.lastYearTotal ? '#16A34A' : '#DC2626' }}>
                {d.thisYearTotal >= d.lastYearTotal ? '📈' : '📉'} {Math.abs(d.yearGrowthPct||0)}% {d.thisYearTotal >= d.lastYearTotal ? 'growth' : 'decline'} vs last year
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Class-wise collection */}
      {cs.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>🏆 Top Performers</div>
            {(d.topClasses||cs.slice(0,5)).map((c,i) => (
              <HBar key={i} label={`${c.className||c.class} ${c.section||''}`}
                value={c.totalCollected||0} max={maxClass} color="#16A34A"
                sub={`${pct(c.totalCollected,c.totalExpected)}%`}/>
            ))}
          </div>
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>⚠️ Needs Attention</div>
            {(d.bottomClasses||cs.slice(-5)).map((c,i) => (
              <HBar key={i} label={`${c.className||c.class} ${c.section||''}`}
                value={c.totalPending||0} max={Math.max(...cs.map(c=>c.totalPending||0),1)}
                color="#DC2626" sub={`${pct(c.totalCollected,c.totalExpected)}% collected`}/>
            ))}
          </div>
        </div>
      )}

      {/* Full class table */}
      {cs.length > 0 && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>
            Detailed Class-wise Report
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['Class','Students','Expected','Collected','Pending','Paid','Partial','Unpaid','Rate'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cs.map((c,i) => {
                  const rate = Number(pct(c.totalCollected, c.totalExpected));
                  const rc   = rate>=75 ? '#16A34A' : rate>=50 ? '#D97706' : '#DC2626';
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                      <td style={{ padding:'10px 14px', fontWeight:700 }}>{c.className||c.class} {c.section||''}</td>
                      <td style={{ padding:'10px 14px', color:'#6B7280' }}>{c.totalStudents||0}</td>
                      <td style={{ padding:'10px 14px' }}>{fmt(c.totalExpected)}</td>
                      <td style={{ padding:'10px 14px', fontWeight:700, color:'#16A34A' }}>{fmt(c.totalCollected)}</td>
                      <td style={{ padding:'10px 14px', fontWeight:700, color:'#DC2626' }}>{fmt(c.totalPending)}</td>
                      <td style={{ padding:'10px 14px', color:'#16A34A' }}>{c.paidCount||0}</td>
                      <td style={{ padding:'10px 14px', color:'#D97706' }}>{c.partialCount||0}</td>
                      <td style={{ padding:'10px 14px', color:'#DC2626' }}>{c.notPaidCount||0}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, height:5, background:'#F3F4F6', borderRadius:3, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${Math.min(100,rate)}%`, background:rc, borderRadius:3 }}/>
                          </div>
                          <span style={{ fontSize:11, fontWeight:800, color:rc, minWidth:36 }}>{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#F8FAFC', borderTop:'2px solid #E5E7EB' }}>
                  <td style={{ padding:'10px 14px', fontWeight:800, color:'#374151' }}>TOTAL</td>
                  <td style={{ padding:'10px 14px', fontWeight:700 }}>{d.totalStudents||0}</td>
                  <td style={{ padding:'10px 14px', fontWeight:800 }}>{fmt(d.totalFees)}</td>
                  <td style={{ padding:'10px 14px', fontWeight:800, color:'#16A34A' }}>{fmt(d.totalCollected)}</td>
                  <td style={{ padding:'10px 14px', fontWeight:800, color:'#DC2626' }}>{fmt(d.totalPending)}</td>
                  <td style={{ padding:'10px 14px', fontWeight:700, color:'#16A34A' }}>{d.paidCount||0}</td>
                  <td style={{ padding:'10px 14px', fontWeight:700, color:'#D97706' }}>{d.partialCount||0}</td>
                  <td style={{ padding:'10px 14px', fontWeight:700, color:'#DC2626' }}>{d.notPaidCount||0}</td>
                  <td style={{ padding:'10px 14px', fontWeight:800, color:'#1D4ED8' }}>{collRate}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}