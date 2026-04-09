// frontend/src/pages/Fees/FeeOverview.js
import React, { useEffect, useState } from 'react';
import feeAPI from '../../utils/feeAPI';
import { LoadingState } from '../../components/ui';

const fmt  = n => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n||0);
const fmtK = n => n>=100000 ? `₹${(n/100000).toFixed(1)}L` : n>=1000 ? `₹${(n/1000).toFixed(0)}K` : fmt(n);
const pct  = (a,b) => b>0 ? ((a/b)*100).toFixed(1) : '0.0';

// ── Donut ─────────────────────────────────────────────────────────────────────
function Donut({ segments, size = 110, stroke = 14, center }) {
  const R = (size - stroke) / 2, cx = size/2, cy = size/2, circ = 2*Math.PI*R;
  let offset = circ * 0.25;
  const total = segments.reduce((s,g) => s + g.val, 0) || 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#F3F4F6" strokeWidth={stroke} />
      {segments.map((g, i) => {
        const dash = (g.val/total)*circ;
        const el = <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={g.color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-offset} strokeLinecap="round" />;
        offset += dash; return el;
      })}
      {center && <>
        <text x={cx} y={cy-5} textAnchor="middle" fontSize={13} fontWeight="900" fill="#111">{center.top}</text>
        <text x={cx} y={cy+10} textAnchor="middle" fontSize={9} fill="#9CA3AF">{center.bot}</text>
      </>}
    </svg>
  );
}

// ── SVG Bar ───────────────────────────────────────────────────────────────────
function BarChart({ data, color = '#1D4ED8', H = 120 }) {
  if (!data?.length) return <div style={{ height:H, display:'flex', alignItems:'center', justifyContent:'center', color:'#9CA3AF', fontSize:12 }}>No data</div>;
  const max = Math.max(...data.map(d => d.v), 1);
  const W = 520, bW = Math.floor((W - 40) / data.length) - 6;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H+24}`} style={{ display:'block' }}>
      {[.25,.5,.75,1].map(r => <line key={r} x1={20} y1={H-r*H} x2={W-10} y2={H-r*H} stroke="#F3F4F6" strokeWidth={1}/>)}
      {data.map((d, i) => {
        const bH = Math.max(3, (d.v/max)*H);
        const x  = 20 + i * ((W-40)/data.length) + 3;
        return (
          <g key={i}>
            <rect x={x} y={H-bH} width={bW} height={bH} rx={3} fill={d.v===max?color:`${color}70`}/>
            {bH>18 && <text x={x+bW/2} y={H-bH-4} textAnchor="middle" fontSize={8} fill={color} fontWeight="700">{fmtK(d.v)}</text>}
            <text x={x+bW/2} y={H+16} textAnchor="middle" fontSize={9} fill="#9CA3AF">{d.l}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPI({ icon, label, val, sub, color, bg, border, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: bg, border:`1.5px solid ${border}`, borderRadius:14,
      padding:'16px 18px', cursor: onClick?'pointer':'default',
      transition:'all 0.18s',
    }}
      onMouseEnter={e => { if(onClick){ e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=`0 8px 24px ${border}40`; }}}
      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}
    >
      <div style={{ fontSize:22, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:22, fontWeight:900, color, lineHeight:1 }}>{val}</div>
      <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginTop:5 }}>{label}</div>
      <div style={{ fontSize:10, color:'#9CA3AF', marginTop:2 }}>{sub}</div>
      {onClick && <div style={{ fontSize:10, color, marginTop:6, fontWeight:700 }}>View details →</div>}
    </div>
  );
}

export default function FeeOverview({ onNavigate }) {
  const [dash,    setDash]    = useState(null);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([feeAPI.getDashboard(), feeAPI.getClassSummary()])
      .then(([d, c]) => { setDash(d.data.data); setClasses(c.data.data?.classes || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const base  = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
      const res   = await fetch(`${base}/fees/export?format=xlsx`, { headers:{ Authorization:`Bearer ${token}` } });
      const blob  = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fees-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
    } catch {} finally { setExporting(false); }
  };

  if (loading) return <LoadingState />;
  const d = dash || {};
  const collRate = Number(pct(d.totalCollected, d.totalExpected));

  // Monthly trend from class data — fake spark for now since backend doesn't expose it separately
  const classChart = classes.slice(0, 8).map(c => ({ l: c.className?.slice(0,6) || '—', v: c.totalCollected || 0 }));

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom:20 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">💳 Fee Management</h2>
          <p className="text-sm text-muted mt-0.5">School-wide fee collection · {new Date().toLocaleDateString('en-IN', { month:'long', year:'numeric' })}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => onNavigate('payment')} style={{ padding:'9px 18px', borderRadius:9, fontSize:13, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
            + Record Payment
          </button>
          <button onClick={handleExport} disabled={exporting} style={{ padding:'9px 16px', borderRadius:9, fontSize:13, fontWeight:700, background:'#F0FDF4', border:'1.5px solid #22C55E', color:'#15803D', cursor:'pointer' }}>
            {exporting ? '⏳' : '⬇'} Export
          </button>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(168px,1fr))', gap:12, marginBottom:20 }}>
        <KPI icon="💰" label="Total Collected"    val={fmtK(d.totalCollected)}  sub={`${pct(d.totalCollected,d.totalExpected)}% of expected`} color="#16A34A" bg="#F0FDF4" border="#22C55E" onClick={() => onNavigate('records')} />
        <KPI icon="⏳" label="Pending"             val={fmtK(d.totalPending)}    sub={`Expected: ${fmtK(d.totalExpected)}`}                     color="#D97706" bg="#FFFBEB" border="#F59E0B" onClick={() => onNavigate('records')} />
        <KPI icon="📅" label="Today's Collection" val={fmtK(d.todayCollection)} sub={`${d.todayCount||0} payments today`}                       color="#1D4ED8" bg="#EFF6FF" border="#3B82F6" />
        <KPI icon="✅" label="Fully Paid"           val={d.paidCount||0}          sub={`of ${d.totalStudents||0} students`}                        color="#16A34A" bg="#F0FDF4" border="#22C55E" />
        <KPI icon="🔵" label="Partial"             val={d.partialCount||0}       sub="Part-paid students"                                          color="#7C3AED" bg="#F5F3FF" border="#8B5CF6" />
        <KPI icon="🔴" label="Overdue"             val={d.overdueCount||0}       sub="Assignments past due"                                        color="#DC2626" bg="#FEF2F2" border="#EF4444" onClick={() => onNavigate('records')} />
      </div>

      {/* Collection rate hero */}
      <div style={{
        background: 'linear-gradient(135deg, #0B1F4A, #162D6A)',
        borderRadius:16, padding:'22px 24px', marginBottom:20, position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(201,149,42,0.08)', pointerEvents:'none' }}/>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:20 }}>
          <div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:6 }}>Overall Collection Rate</div>
            <div style={{ fontSize:48, fontWeight:900, color:'#fff', lineHeight:1 }}>{collRate.toFixed(1)}<span style={{fontSize:24}}>%</span></div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginTop:6 }}>
              {fmtK(d.totalCollected)} collected of {fmtK(d.totalExpected)} expected
            </div>
            <div style={{ height:6, background:'rgba(255,255,255,0.1)', borderRadius:4, marginTop:14, width:280, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.min(100,collRate)}%`, background: collRate>=75?'linear-gradient(90deg,#34D399,#059669)':'linear-gradient(90deg,#FCD34D,#F59E0B)', borderRadius:4, transition:'width 1s ease' }}/>
            </div>
          </div>
          <Donut
            size={120} stroke={16}
            segments={[
              { val: d.paidCount||0,    color:'#34D399' },
              { val: d.partialCount||0, color:'#FCD34D' },
              { val: d.notPaidCount||0, color:'#EF4444' },
            ]}
            center={{ top:`${d.totalStudents||0}`, bot:'Students' }}
          />
        </div>
      </div>

      {/* Class chart + table */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        {/* Bar chart */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14, display:'flex', justifyContent:'space-between' }}>
            <span>Class-wise Collection</span>
            <span style={{ fontSize:11, color:'#9CA3AF' }}>Top {Math.min(8,classes.length)} classes</span>
          </div>
          <BarChart data={classChart} color="#1D4ED8" H={120} />
        </div>

        {/* Status breakdown */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Payment Status Breakdown</div>
          {[
            { label:'Fully Paid',    val:d.paidCount||0,    color:'#16A34A', bg:'#F0FDF4',  pct: Math.round(((d.paidCount||0)/(d.totalStudents||1))*100) },
            { label:'Partial',       val:d.partialCount||0, color:'#7C3AED', bg:'#F5F3FF',  pct: Math.round(((d.partialCount||0)/(d.totalStudents||1))*100) },
            { label:'Not Paid',      val:d.notPaidCount||0, color:'#DC2626', bg:'#FEF2F2',  pct: Math.round(((d.notPaidCount||0)/(d.totalStudents||1))*100) },
          ].map(s => (
            <div key={s.label} style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                  <span style={{ fontSize:12, fontWeight:600 }}>{s.label}</span>
                </div>
                <div style={{ fontSize:12, fontWeight:800, color:s.color }}>{s.val} students ({s.pct}%)</div>
              </div>
              <div style={{ height:7, background:'#F3F4F6', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${s.pct}%`, background:s.color, borderRadius:4, transition:'width 0.7s ease' }}/>
              </div>
            </div>
          ))}

          <div style={{ borderTop:'1px solid #E5E7EB', paddingTop:14, marginTop:4 }}>
            <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>Summary</div>
            {[
              { label:'Total Expected', val:fmt(d.totalExpected) },
              { label:'Total Collected', val:fmt(d.totalCollected) },
              { label:'Outstanding',    val:fmt(d.totalPending) },
            ].map(r => (
              <div key={r.label} style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:12, color:'#6B7280' }}>{r.label}</span>
                <span style={{ fontSize:12, fontWeight:700 }}>{r.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Class-wise table */}
      {classes.length > 0 && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14, display:'flex', justifyContent:'space-between' }}>
            <span>All Classes — Fee Summary</span>
            <button onClick={() => onNavigate('records')} style={{ fontSize:12, color:'#1D4ED8', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>
              Manage Records →
            </button>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['Class','Students','Expected','Collected','Pending','Rate'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classes.map((c,i) => {
                  const rate = Number(pct(c.totalCollected, c.totalExpected));
                  const rc = rate>=75?'#16A34A':rate>=50?'#D97706':'#DC2626';
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                      <td style={{ padding:'10px 14px', fontWeight:700 }}>{c.className} {c.section||''}</td>
                      <td style={{ padding:'10px 14px', color:'#6B7280' }}>{c.totalStudents}</td>
                      <td style={{ padding:'10px 14px' }}>{fmt(c.totalExpected)}</td>
                      <td style={{ padding:'10px 14px', color:'#16A34A', fontWeight:700 }}>{fmt(c.totalCollected)}</td>
                      <td style={{ padding:'10px 14px', color:'#DC2626', fontWeight:700 }}>{fmt(c.totalPending)}</td>
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
            </table>
          </div>
        </div>
      )}
    </div>
  );
}