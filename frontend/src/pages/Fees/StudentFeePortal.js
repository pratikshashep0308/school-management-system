// frontend/src/pages/Fees/StudentFeePortal.js
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { LoadingState, EmptyState } from '../../components/ui';
import FeeStructure from './FeeStructure';

const fmt = n => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n||0);

async function downloadReceipt(receiptNumber, setDownloading) {
  setDownloading(receiptNumber);
  try {
    const token = localStorage.getItem('token');
    const base  = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    const res   = await fetch(`${base}/fees/receipt/${receiptNumber}/pdf`, { headers:{ Authorization:`Bearer ${token}` } });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `receipt-${receiptNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Receipt downloaded');
  } catch { toast.error('Receipt not available. Contact school office.'); }
  finally { setDownloading(''); }
}

function FeeRing({ paid, total }) {
  const pct = total > 0 ? Math.min(100, (paid/total)*100) : 0;
  const R = 44, cx = 50, cy = 50, circ = 2*Math.PI*R;
  const color = pct>=100?'#16A34A':pct>=50?'#F59E0B':'#DC2626';
  return (
    <svg width={100} height={100} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={10}/>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${(pct/100)*circ} ${circ}`} strokeDashoffset={circ*0.25}
        strokeLinecap="round" style={{transition:'stroke-dasharray 1s ease'}}/>
      <text x={cx} y={cy-3} textAnchor="middle" fontSize={14} fontWeight="900" fill="#fff">{Math.round(pct)}%</text>
      <text x={cx} y={cy+11} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.5)">Paid</text>
    </svg>
  );
}

function StatusPill({ status }) {
  const map = {
    paid:     { bg:'#F0FDF4', color:'#16A34A', border:'#22C55E', label:'✅ Fully Paid' },
    partial:  { bg:'#FFF7ED', color:'#EA580C', border:'#F97316', label:'🔵 Partial' },
    not_paid: { bg:'#FEF2F2', color:'#DC2626', border:'#EF4444', label:'⏳ Pending' },
  };
  const s = map[status]||map.not_paid;
  return <span style={{ fontSize:12, fontWeight:700, color:s.color, background:s.bg, border:`1px solid ${s.border}50`, padding:'4px 12px', borderRadius:20 }}>{s.label}</span>;
}

function StudentInfoCard({ student, attendance }) {
  if (!student || !student.user) return null;
  const attPct = attendance?.percentage || (attendance?.total > 0 ? Math.round(((attendance.present||0)+(attendance.late||0))/attendance.total*100) : 0);
  const initials = student.user?.name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?';
  return (
    <div className="card" style={{ padding:'16px 20px', marginBottom:16, borderLeft:'4px solid #1D4ED8' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
        <div style={{ width:50, height:50, borderRadius:13, background:'linear-gradient(135deg,#1D4ED8,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'#fff', fontWeight:900, flexShrink:0 }}>
          {initials}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:800, color:'#111827' }}>{student.user?.name}</div>
          <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>
            {student.class?.name} {student.class?.section||''} &nbsp;·&nbsp;
            Roll {student.rollNumber||'—'} &nbsp;·&nbsp;
            Adm. {student.admissionNumber||'—'}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>Attendance</div>
          <div style={{ fontSize:22, fontWeight:900, color:attPct>=75?'#16A34A':'#DC2626' }}>{attPct}%</div>
        </div>
      </div>
    </div>
  );
}

export default function StudentFeePortal({ studentId, studentData, attendance }) {
  const [tab,         setTab]         = useState('summary');
  const [feeRecord,   setFeeRecord]   = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [downloading, setDownloading] = useState('');

  const loadFees = useCallback(async () => {
    const sid = studentId || studentData?._id;
    if (!sid) return;
    setLoading(true);
    try {
      const r = await feeAPI.getStudentFee(sid);
      setFeeRecord(r.data.data || null);
      setAssignments(r.data.assignments || []);
    } catch (err) {
      if (err.response?.status !== 404) toast.error('Failed to load fee details');
      setFeeRecord(null);
    } finally { setLoading(false); }
  }, [studentId, studentData?._id]);

  useEffect(() => { loadFees(); }, [loadFees]);

  const rec      = feeRecord;
  const paid     = rec?.paidAmount    || 0;
  const due      = rec?.pendingAmount || 0;
  const total    = rec?.totalFees     || 0;
  const status   = rec?.paymentStatus || 'not_paid';
  const payments = rec?.paymentHistory || [];
  const student  = rec?.student || studentData || {};

  const TABS = [
    { key:'summary',   label:'📊 Fee Summary' },
    { key:'history',   label:'📜 Payment History' },
    { key:'structure', label:'🏷 Fee Structure' },
  ];

  const C = { bg:'#0B1F4A' };

  return (
    <div>
      <StudentInfoCard student={student} attendance={attendance} />

      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:10, padding:4, marginBottom:20, flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:700,
            border:'none', cursor:'pointer', transition:'all 0.15s',
            background: tab===t.key ? '#1D4ED8' : 'transparent',
            color:      tab===t.key ? '#fff'    : '#6B7280',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'summary' && (
        loading ? <LoadingState /> : !rec ? (
          <div className="card" style={{ padding:32, textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#374151' }}>No Fee Record</div>
            <div style={{ fontSize:13, color:'#6B7280', marginTop:6 }}>Please contact the school office to set up your fee ledger.</div>
          </div>
        ) : (
          <div>
            {/* Hero fee card */}
            <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:16, padding:'22px', marginBottom:14, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-50, right:-50, width:180, height:180, borderRadius:'50%', background:'rgba(201,149,42,0.1)', pointerEvents:'none' }}/>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:700, marginBottom:6 }}>
                    Academic Year {new Date().getFullYear()}-{new Date().getFullYear()+1}
                  </div>
                  <StatusPill status={status} />
                </div>
                <FeeRing paid={paid} total={total} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
                {[
                  { label:'Total Fees', val:fmt(total), color:'rgba(255,255,255,0.55)' },
                  { label:'Paid',       val:fmt(paid),  color:'#34D399' },
                  { label:'Pending',    val:fmt(due),   color:due>0?'#FCA5A5':'#34D399' },
                ].map(s => (
                  <div key={s.label} style={{ background:'rgba(255,255,255,0.07)', borderRadius:10, padding:'10px 12px' }}>
                    <div style={{ fontSize:16, fontWeight:900, color:'#fff' }}>{s.val}</div>
                    <div style={{ fontSize:10, color:s.color, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginTop:3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ height:5, background:'rgba(255,255,255,0.1)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:4, width:`${total>0?Math.min(100,(paid/total)*100):0}%`, background:'linear-gradient(90deg,#34D399,#059669)', transition:'width 1s ease' }}/>
              </div>
            </div>

            {due > 0 && (
              <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, padding:'14px 16px', marginBottom:14, display:'flex', gap:10 }}>
                <span style={{ fontSize:22, flexShrink:0 }}>⚠️</span>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#991B1B' }}>Pending: {fmt(due)}</div>
                  <div style={{ fontSize:12, color:'#B91C1C', marginTop:2 }}>Please visit the school office to clear dues and avoid late fees.</div>
                </div>
              </div>
            )}

            {assignments.length > 0 && (
              <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:14 }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:13 }}>Fee Breakdown</div>
                {assignments.map((a,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 16px', borderBottom:i<assignments.length-1?'1px solid #F3F4F6':'none' }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>🏷</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{a.feeType?.name||'Fee'}</div>
                      <div style={{ fontSize:11, color:'#6B7280' }}>{a.feeType?.category||''} {a.dueDate?`· Due: ${new Date(a.dueDate).toLocaleDateString('en-IN')}`:''}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:14, fontWeight:800, color:'#0B1F4A' }}>{fmt(a.amount)}</div>
                      <div style={{ fontSize:10, fontWeight:700, color:a.status==='paid'?'#16A34A':'#DC2626', marginTop:1 }}>
                        {a.status==='paid'?'✅ Paid':a.status==='partial'?'🔵 Partial':'⏳ Pending'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10, marginBottom:14 }}>
              {[
                { icon:'💳', label:'Payments Made', val:payments.length, color:'#1D4ED8', bg:'#EFF6FF' },
                { icon:'💵', label:'Last Payment',  val:payments.length>0?fmt([...payments].reverse()[0]?.amount):'—', color:'#16A34A', bg:'#F0FDF4' },
                { icon:'📅', label:'Last Date',     val:payments.length>0?new Date([...payments].reverse()[0]?.paidOn).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—', color:'#7C3AED', bg:'#F5F3FF' },
              ].map(s => (
                <div key={s.label} style={{ background:s.bg, borderRadius:10, padding:'12px 14px', border:`1px solid ${s.color}20` }}>
                  <div style={{ fontSize:18, marginBottom:5 }}>{s.icon}</div>
                  <div style={{ fontSize:15, fontWeight:800, color:s.color }}>{s.val}</div>
                  <div style={{ fontSize:10, color:'#6B7280', fontWeight:600, marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {payments.length > 0 && (
              <div className="card" style={{ padding:0, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>Recent Payments</div>
                  <button onClick={() => setTab('history')} style={{ fontSize:12, color:'#1D4ED8', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>View All →</button>
                </div>
                {[...payments].reverse().slice(0,3).map((p,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderBottom:i<2?'1px solid #F3F4F6':'none' }}>
                    <div style={{ width:34, height:34, borderRadius:9, background:'#F0FDF4', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>💳</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{p.month||'Fee Payment'}</div>
                      <div style={{ fontSize:11, color:'#6B7280' }}>{new Date(p.paidOn).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})} · {p.method}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:14, fontWeight:800, color:'#16A34A' }}>{fmt(p.amount)}</div>
                      {p.receiptNumber && (
                        <button onClick={()=>downloadReceipt(p.receiptNumber,setDownloading)} disabled={downloading===p.receiptNumber}
                          style={{ fontSize:10, color:'#1D4ED8', background:'none', border:'none', cursor:'pointer', fontWeight:700, padding:0, marginTop:2 }}>
                          {downloading===p.receiptNumber?'⏳':'⬇ Receipt'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {tab === 'history' && (
        loading ? <LoadingState /> : payments.length===0 ? (
          <EmptyState icon="💳" title="No payments yet" subtitle="Payment history will appear here once fees are paid"/>
        ) : (
          <div>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'14px 18px', marginBottom:16 }}>
              {[
                {label:'Total Paid',   val:fmt(paid),        color:'#15803D'},
                {label:'Transactions', val:payments.length,  color:'#374151'},
                ...(due>0?[{label:'Balance Due', val:fmt(due), color:'#B91C1C'}]:[]),
              ].map(s=>(
                <div key={s.label}>
                  <div style={{ fontSize:10, color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{s.label}</div>
                  <div style={{ fontSize:22, fontWeight:900, color:s.color }}>{s.val}</div>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#0B1F4A' }}>
                      {['#','Date','Description','Method','Amount','Receipt'].map(h=>(
                        <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...payments].reverse().map((p,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                        <td style={{ padding:'10px 14px', color:'#9CA3AF', fontSize:11 }}>{payments.length-i}</td>
                        <td style={{ padding:'10px 14px', whiteSpace:'nowrap', color:'#374151' }}>{new Date(p.paidOn).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</td>
                        <td style={{ padding:'10px 14px', fontWeight:600 }}>
                          {p.month||'Fee Payment'}
                          {p.remarks&&<div style={{fontSize:10,color:'#9CA3AF',marginTop:1}}>{p.remarks}</div>}
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'#7C3AED', background:'#F5F3FF', padding:'2px 8px', borderRadius:10 }}>{p.method||'cash'}</span>
                        </td>
                        <td style={{ padding:'10px 14px', fontWeight:800, color:'#16A34A', fontSize:14, whiteSpace:'nowrap' }}>{fmt(p.amount)}</td>
                        <td style={{ padding:'10px 14px' }}>
                          {p.receiptNumber?(
                            <button onClick={()=>downloadReceipt(p.receiptNumber,setDownloading)} disabled={downloading===p.receiptNumber}
                              style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'4px 10px', borderRadius:6, cursor:'pointer', whiteSpace:'nowrap' }}>
                              {downloading===p.receiptNumber?'⏳':'⬇'} Receipt
                            </button>
                          ):<span style={{color:'#D1D5DB'}}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#F0FDF4', borderTop:'2px solid #BBF7D0' }}>
                      <td colSpan={4} style={{ padding:'10px 14px', fontWeight:800, color:'#16A34A' }}>TOTAL PAID</td>
                      <td style={{ padding:'10px 14px', fontWeight:900, color:'#15803D', fontSize:15 }}>{fmt(paid)}</td>
                      <td/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {due>0&&(
              <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, padding:'14px 16px', marginTop:14, display:'flex', gap:10, alignItems:'center' }}>
                <span style={{fontSize:22}}>💬</span>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:'#991B1B'}}>Balance Due: {fmt(due)}</div>
                  <div style={{fontSize:12,color:'#B91C1C',marginTop:2}}>Contact the school office to complete your payment and collect your receipt.</div>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {tab === 'structure' && <FeeStructure />}
    </div>
  );
}