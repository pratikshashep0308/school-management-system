// frontend/src/pages/Fees/FeesDashboard.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import feeAPI from '../../utils/feeAPI';
import { LoadingState } from '../../components/ui';

const fmt = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0);
const pct = (a,b) => b>0 ? ((a/b)*100).toFixed(1) : '0.0';

// ── Bar chart using SVG ───────────────────────────────────────────────────────
function CollectionBar({ collected, expected }) {
  const ratio = expected > 0 ? Math.min(100, (collected/expected)*100) : 0;
  return (
    <div style={{ marginTop:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#6B7280', marginBottom:5 }}>
        <span>Collection Rate</span>
        <span style={{ fontWeight:800, color: ratio>=75?'#16A34A':'#DC2626' }}>{ratio.toFixed(1)}%</span>
      </div>
      <div style={{ height:8, background:'#E5E7EB', borderRadius:6, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${ratio}%`, borderRadius:6, transition:'width 0.8s', background: ratio>=75?'linear-gradient(90deg,#16A34A,#22C55E)':'linear-gradient(90deg,#EF4444,#F97316)' }} />
      </div>
    </div>
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ paid, partial, notPaid }) {
  const total = paid + partial + notPaid || 1;
  const R = 40, cx = 50, cy = 50, circ = 2 * Math.PI * R;
  const segs = [
    { val: paid,    color:'#16A34A' },
    { val: partial, color:'#F59E0B' },
    { val: notPaid, color:'#EF4444' },
  ];
  let offset = circ * 0.25;
  return (
    <svg width={100} height={100} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#F3F4F6" strokeWidth={14} />
      {segs.map((s,i) => {
        const dash = (s.val/total)*circ;
        const el = <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.color} strokeWidth={14} strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-offset} />;
        offset += dash;
        return el;
      })}
      <text x={cx} y={cy+5} textAnchor="middle" fontSize={12} fontWeight="800" fill="#111">
        {total > 0 ? Math.round((paid/total)*100) : 0}%
      </text>
    </svg>
  );
}

export default function FeesDashboard() {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([feeAPI.getDashboard(), feeAPI.getClassSummary()])
      .then(([d,c]) => { setData(d.data.data); setClasses(c.data.data.classes || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  const d = data || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">💳 Fee Management</h2>
          <p className="text-sm text-muted mt-0.5">School-wide fee collection overview</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => window.open(`${process.env.REACT_APP_API_URL||'http://localhost:5000/api'}/fees/export?format=xlsx`, '_blank')}
            style={{ padding:'8px 16px', borderRadius:8, fontSize:12, fontWeight:700, background:'#EFF6FF', border:'1.5px solid #3B82F6', color:'#1D4ED8', cursor:'pointer' }}>
            ⬇ Excel
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:14, marginBottom:24 }}>
        {[
          { icon:'💰', label:'Total Collected',   val:fmt(d.totalCollected),  sub:`${pct(d.totalCollected,d.totalExpected)}% of expected`, color:'#16A34A', bg:'#F0FDF4', border:'#22C55E' },
          { icon:'⏳', label:'Total Pending',     val:fmt(d.totalPending),    sub:`Expected: ${fmt(d.totalExpected)}`,                      color:'#D97706', bg:'#FFFBEB', border:'#F59E0B' },
          { icon:'📅', label:"Today's Collection",val:fmt(d.todayCollection), sub:`${d.todayCount||0} payments today`,                      color:'#1D4ED8', bg:'#EFF6FF', border:'#3B82F6' },
          { icon:'✅', label:'Fully Paid',         val:d.paidCount||0,         sub:`of ${d.totalStudents||0} students`,                      color:'#16A34A', bg:'#F0FDF4', border:'#22C55E' },
          { icon:'⚠️', label:'Partial / Unpaid',  val:(d.partialCount||0)+(d.notPaidCount||0), sub:`${d.partialCount||0} partial · ${d.notPaidCount||0} unpaid`, color:'#DC2626', bg:'#FEF2F2', border:'#EF4444' },
          { icon:'🔴', label:'Overdue',            val:d.overdueCount||0,      sub:'Assignments past due date',                              color:'#7F1D1D', bg:'#FEF2F2', border:'#FCA5A5' },
        ].map(card => (
          <div key={card.label} style={{ background:card.bg, border:`1.5px solid ${card.border}`, borderRadius:14, padding:'16px 18px' }}>
            <div style={{ fontSize:22, marginBottom:8 }}>{card.icon}</div>
            <div style={{ fontSize:22, fontWeight:900, color:card.color, lineHeight:1 }}>{card.val}</div>
            <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginTop:4 }}>{card.label}</div>
            <div style={{ fontSize:10, color:'#6B7280', marginTop:2 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Donut + progress ── */}
      <div style={{ display:'grid', gridTemplateColumns:'180px 1fr', gap:16, marginBottom:24 }}>
        <div className="card" style={{ padding:16, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#6B7280', marginBottom:10 }}>Payment Status</div>
          <DonutChart paid={d.paidCount||0} partial={d.partialCount||0} notPaid={d.notPaidCount||0} />
          <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:10, width:'100%' }}>
            {[
              { label:'Paid',    val:d.paidCount||0,    color:'#16A34A' },
              { label:'Partial', val:d.partialCount||0,  color:'#F59E0B' },
              { label:'Unpaid',  val:d.notPaidCount||0,  color:'#EF4444' },
            ].map(s => (
              <div key={s.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:s.color }} />
                  <span style={{ fontSize:11, color:'#6B7280' }}>{s.label}</span>
                </div>
                <span style={{ fontSize:11, fontWeight:800, color:s.color }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding:16 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Class-wise Collection</div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F8FAFC', borderBottom:'1px solid #E5E7EB' }}>
                  {['Class','Students','Expected','Collected','Pending','Rate'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classes.slice(0,8).map((c,i) => {
                  const rate = pct(c.totalCollected, c.totalExpected);
                  const rateColor = Number(rate)>=75?'#16A34A':Number(rate)>=50?'#D97706':'#DC2626';
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid #F3F4F6', background: i%2?'#FAFAFA':'#fff' }}>
                      <td style={{ padding:'9px 12px', fontWeight:600 }}>{c.className} {c.section||''}</td>
                      <td style={{ padding:'9px 12px', color:'#6B7280' }}>{c.totalStudents}</td>
                      <td style={{ padding:'9px 12px' }}>{fmt(c.totalExpected)}</td>
                      <td style={{ padding:'9px 12px', color:'#16A34A', fontWeight:600 }}>{fmt(c.totalCollected)}</td>
                      <td style={{ padding:'9px 12px', color:'#DC2626', fontWeight:600 }}>{fmt(c.totalPending)}</td>
                      <td style={{ padding:'9px 12px' }}>
                        <span style={{ fontWeight:800, color:rateColor, background:`${rateColor}15`, padding:'2px 8px', borderRadius:10, fontSize:11 }}>{rate}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {classes.length > 8 && <div style={{ padding:'8px 12px', fontSize:11, color:'#9CA3AF', textAlign:'right' }}>+{classes.length-8} more classes</div>}
        </div>
      </div>
    </div>
  );
}