// frontend/src/pages/Fees/FeeReport.js
// Powerful fee report: School / Class / Individual views
// Features: filters, search, status breakdown, history, defaulters, export

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';

const fmt   = n  => `₹${Math.round(n||0).toLocaleString('en-IN')}`;
const pct   = (a,b) => b > 0 ? Math.min(100, Math.round((a/b)*100)) : 0;
const today = new Date();

const STATUS = {
  paid:    { bg:'#D1FAE5', color:'#065F46', label:'Paid',    dot:'#16A34A' },
  partial: { bg:'#DBEAFE', color:'#1E40AF', label:'Partial', dot:'#3B82F6' },
  not_paid:{ bg:'#FEE2E2', color:'#991B1B', label:'Unpaid',  dot:'#DC2626' },
  overdue: { bg:'#FEE2E2', color:'#991B1B', label:'Overdue', dot:'#DC2626' },
  pending: { bg:'#FEF3C7', color:'#92400E', label:'Pending', dot:'#D97706' },
};

function Bar({ value, color = '#16A34A', height = 6 }) {
  return (
    <div style={{ height, background:'#F3F4F6', borderRadius:3, overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${Math.min(100,value||0)}%`, background:color, borderRadius:3, transition:'width 0.8s' }}/>
    </div>
  );
}

function StatBadge({ label, value, color, bg, onClick }) {
  return (
    <div onClick={onClick} style={{ background:bg, border:`1px solid ${color}30`, borderRadius:10, padding:'10px 14px', cursor:onClick?'pointer':'default', transition:'all 0.15s', minWidth:100 }}
      className={onClick ? 'hover:-translate-y-0.5' : ''}>
      <div style={{ fontSize:18, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{label}</div>
    </div>
  );
}

// ── Payment History Panel ─────────────────────────────────────────────────────
function StudentHistoryPanel({ student, onClose }) {
  const [detail,  setDetail]  = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    feeAPI.getStudentFee(student.student?._id)
      .then(r => setDetail(r.data))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, [student]);

  const name = student.student?.user?.name || '—';
  const payHistory = detail?.data?.paymentHistory || [];
  const assignments = detail?.assignments || [];

  // Local copy so we can remove rows without re-fetching
  const [localPayments, setLocalPayments] = useState([]);
  useEffect(() => { setLocalPayments(payHistory); }, [detail]);

  const handleDeletePayment = async (receiptNumber) => {
    if (!receiptNumber) return toast.error('Receipt number missing');
    if (!window.confirm(`Delete this payment (${receiptNumber})?\n\nThis cannot be undone. The student's balance will be recalculated.`)) return;
    try {
      await feeAPI.deletePayment(receiptNumber);
      setLocalPayments(prev => prev.filter(p => p.receiptNumber !== receiptNumber));
      toast.success('Payment deleted');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex' }}>
      <div onClick={onClose} style={{ flex:1, background:'rgba(0,0,0,0.4)' }}/>
      <div style={{ width:560, background:'#fff', display:'flex', flexDirection:'column', boxShadow:'-8px 0 32px rgba(0,0,0,0.15)', overflowY:'auto' }}>
        {/* Header */}
        <div style={{ background:'#0B1F4A', padding:'20px 24px', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:'#fff' }}>{name}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginTop:2 }}>
                {student.class?.name} {student.class?.section||''} · Roll {student.student?.rollNumber||'—'}
              </div>
            </div>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', width:32, height:32, borderRadius:8, cursor:'pointer', fontSize:18 }}>×</button>
          </div>
          {/* Mini stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:16 }}>
            {[
              { l:'Total Fees',  v:fmt(student.totalFees),      c:'#FCD34D' },
              { l:'Paid',        v:fmt(student.paidAmount),      c:'#86EFAC' },
              { l:'Balance',     v:fmt(student.pendingAmount||0),c:student.pendingAmount>0?'#FCA5A5':'#86EFAC' },
            ].map(f=>(
              <div key={f.l} style={{ background:'rgba(255,255,255,0.08)', borderRadius:9, padding:'10px 12px' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:700, textTransform:'uppercase' }}>{f.l}</div>
                <div style={{ fontSize:16, fontWeight:900, color:f.c, marginTop:3 }}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:'20px 24px', flex:1 }}>
          {loading ? <LoadingState /> : (
            <>
              {/* Assignments */}
              {assignments.length > 0 && (
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:'#111827' }}>📋 Fee Assignments</div>
                  {assignments.map((a,i) => {
                    const ss = STATUS[a.status] || STATUS.pending;
                    const pending = a.pendingAmount ?? (a.finalAmount - a.paidAmount);
                    return (
                      <div key={i} style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:'#111827' }}>{a.feeType?.name||'—'}</div>
                          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{a.dueDate?`Due: ${new Date(a.dueDate).toLocaleDateString('en-IN')}`:''} {a.month||''}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:14, fontWeight:800, color:'#111827' }}>{fmt(a.finalAmount)}</div>
                          {pending > 0 && <div style={{ fontSize:11, color:'#DC2626', fontWeight:600 }}>Due: {fmt(pending)}</div>}
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:ss.color, background:ss.bg, padding:'3px 10px', borderRadius:20, flexShrink:0 }}>{ss.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Payment History */}
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:'#111827' }}>
                📜 Payment History ({localPayments.length} transactions)
              </div>
              {!localPayments.length ? (
                <div style={{ textAlign:'center', padding:'30px', color:'#9CA3AF' }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>💳</div>
                  <div>No payments recorded yet</div>
                </div>
              ) : localPayments.map((p,i) => (
                <div key={i} style={{ borderBottom:'0.5px solid #F3F4F6', padding:'12px 0', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:'#F0FDF4', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16 }}>✅</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:'#111827' }}>{fmt(p.amount)}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{p.month||'—'} · {p.paidOn?new Date(p.paidOn).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—'}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <span style={{ fontSize:11, fontWeight:700, background:'#EFF6FF', color:'#1E40AF', padding:'2px 8px', borderRadius:20, textTransform:'uppercase' }}>{p.method||'cash'}</span>
                    {p.receiptNumber && <div style={{ fontSize:10, color:'#9CA3AF', marginTop:3, fontFamily:'monospace' }}>{p.receiptNumber}</div>}
                  </div>
                  <button
                    onClick={() => handleDeletePayment(p.receiptNumber)}
                    title="Delete this payment"
                    style={{ flexShrink:0, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', borderRadius:7, padding:'6px 10px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    🗑
                  </button>
                </div>
              ))}

              {/* Total summary */}
              {localPayments.length > 0 && (
                <div style={{ marginTop:16, background:'#F0FDF4', borderRadius:10, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#065F46' }}>Total Paid</span>
                  <span style={{ fontSize:18, fontWeight:900, color:'#16A34A' }}>{fmt(localPayments.reduce((s,p)=>s+p.amount,0))}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function FeeReport() {
  const [loading,     setLoading]     = useState(true);
  const [classes,     setClasses]     = useState([]);
  const [students,    setStudents]    = useState([]);
  const [classId,     setClassId]     = useState('');
  const [statusFilter,setStatusFilter]= useState('');
  const [search,      setSearch]      = useState('');
  const [sortBy,      setSortBy]      = useState('name'); // name | paid | pending | roll
  const [activeView,  setActiveView]  = useState('all'); // all | defaulters | paid | partial
  const [panelStudent,setPanelStudent]= useState(null);
  const [summary,     setSummary]     = useState(null);

  // Load classes + school summary
  useEffect(() => {
    Promise.all([
      classAPI.getAll().catch(()=>({ data:{ data:[] } })),
      feeAPI.getClassSummary().catch(()=>({ data:{ data:{} } })),
    ]).then(([cRes, sRes]) => {
      setClasses(cRes.data.data || []);
      setSummary(sRes.data.data);
    });
  }, []);

  // Load students
  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (classId) params.classId = classId;
      if (statusFilter) params.status = statusFilter;
      const fn = feeAPI.getStudentsFees || feeAPI.getStudents || feeAPI.getStudents;
      const r = await fn(params);
      setStudents(r.data.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [classId, statusFilter]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  // Compute school totals from students
  const schoolTotal     = students.reduce((s,st)=>s+(st.totalFees||0),0);
  const schoolCollected = students.reduce((s,st)=>s+(st.paidAmount||0),0);
  const schoolPending   = students.reduce((s,st)=>s+(st.pendingAmount||0),0);
  const paidCount       = students.filter(s=>s.paymentStatus==='paid').length;
  const partialCount    = students.filter(s=>s.paymentStatus==='partial').length;
  const unpaidCount     = students.filter(s=>['not_paid','pending'].includes(s.paymentStatus)).length;
  const overdueSt       = students.filter(s=>{ const a=s.paymentHistory; return s.paymentStatus!=='paid'&&s.dueDate&&new Date(s.dueDate)<today; });
  const collRate        = pct(schoolCollected, schoolTotal);

  // Filter + sort + view
  const filtered = students
    .filter(s => {
      const name = s.student?.user?.name?.toLowerCase()||'';
      const matchSearch = !search || name.includes(search.toLowerCase()) || s.student?.rollNumber?.toString().includes(search);
      const matchView =
        activeView==='all'        ? true :
        activeView==='defaulters' ? ['not_paid','pending'].includes(s.paymentStatus) :
        activeView==='paid'       ? s.paymentStatus==='paid' :
        activeView==='partial'    ? s.paymentStatus==='partial' : true;
      return matchSearch && matchView;
    })
    .sort((a,b)=>{
      if (sortBy==='name')    return (a.student?.user?.name||'').localeCompare(b.student?.user?.name||'');
      if (sortBy==='paid')    return (b.paidAmount||0) - (a.paidAmount||0);
      if (sortBy==='pending') return (b.pendingAmount||0) - (a.pendingAmount||0);
      if (sortBy==='roll')    return (a.student?.rollNumber||0) - (b.student?.rollNumber||0);
      return 0;
    });

  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  return (
    <div>
      {/* Title */}
      <div style={{ marginBottom:20 }}>
        <h2 className="font-display text-2xl text-ink">📊 Fee Report</h2>
        <p className="text-sm text-muted mt-0.5">School-wide fee collection overview and student-wise details</p>
      </div>

      {/* ── Top KPI strip ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Total Expected',  value:fmt(schoolTotal),     color:'#1D4ED8', bg:'#EFF6FF', view:null },
          { label:'Collected',       value:fmt(schoolCollected),  color:'#16A34A', bg:'#F0FDF4', view:'paid' },
          { label:'Pending',         value:fmt(schoolPending),    color:'#D97706', bg:'#FFFBEB', view:'partial' },
          { label:'Fully Paid',      value:paidCount,             color:'#16A34A', bg:'#F0FDF4', view:'paid' },
          { label:'Partial',         value:partialCount,          color:'#3B82F6', bg:'#EFF6FF', view:'partial' },
          { label:'Defaulters',      value:unpaidCount,           color:'#DC2626', bg:'#FEF2F2', view:'defaulters' },
        ].map(k=>(
          <div key={k.label} onClick={()=>k.view&&setActiveView(k.view===activeView?'all':k.view)}
            style={{ background:k.bg, border:`1.5px solid ${k.color}25`, borderRadius:12, padding:'12px 14px', cursor:k.view?'pointer':'default', transition:'all 0.15s', borderBottom:activeView===k.view?`3px solid ${k.color}`:undefined }}>
            <div style={{ fontSize:20, fontWeight:900, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Collection progress ── */}
      <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
            <span style={{ fontWeight:700, color:'#374151' }}>Collection Progress</span>
            <span style={{ fontWeight:900, fontSize:15, color:collRate>=80?'#16A34A':collRate>=50?'#D97706':'#DC2626' }}>{collRate}%</span>
          </div>
          <Bar value={collRate} color={collRate>=80?'#16A34A':collRate>=50?'#D97706':'#DC2626'} height={10}/>
          <div style={{ display:'flex', gap:16, marginTop:6, fontSize:11, color:'#9CA3AF' }}>
            <span>✅ {fmt(schoolCollected)} collected</span>
            <span>⏳ {fmt(schoolPending)} remaining</span>
            <span>👥 {students.length} students total</span>
          </div>
        </div>
        {/* Class breakdown mini pills */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', maxWidth:300 }}>
          {(summary?.classes||[]).slice(0,6).map((cls,i)=>{
            const r = pct(cls.totalCollected, cls.totalExpected);
            return (
              <div key={i} onClick={()=>{ setClassId(cls.classId); }}
                style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700, cursor:'pointer',
                  background: r===100?'#D1FAE5':r>50?'#FEF3C7':'#FEE2E2',
                  color: r===100?'#065F46':r>50?'#92400E':'#991B1B',
                  border:`1px solid ${r===100?'#A7F3D0':r>50?'#FDE68A':'#FECACA'}`,
                }}>
                {cls.className} {cls.section||''} {r}%
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div style={{ background:'#F8FAFC', borderRadius:12, padding:'14px 16px', marginBottom:16, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        {/* Search */}
        <input placeholder="🔍 Search student name or roll…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{ ...SEL, minWidth:220 }}/>

        {/* Class filter */}
        <select value={classId} onChange={e=>setClassId(e.target.value)} style={SEL}>
          <option value="">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>

        {/* Status filter */}
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={SEL}>
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="not_paid">Unpaid</option>
        </select>

        {/* Sort */}
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={SEL}>
          <option value="name">Sort: Name</option>
          <option value="roll">Sort: Roll No</option>
          <option value="paid">Sort: Most Paid</option>
          <option value="pending">Sort: Most Pending</option>
        </select>

        {/* Quick view buttons */}
        <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
          {[
            { key:'all',        label:`All (${students.length})` },
            { key:'paid',       label:`✅ Paid (${paidCount})` },
            { key:'partial',    label:`🔵 Partial (${partialCount})` },
            { key:'defaulters', label:`⚠️ Defaulters (${unpaidCount})` },
          ].map(v=>(
            <button key={v.key} onClick={()=>setActiveView(v.key)} style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
              border:`1.5px solid ${activeView===v.key?'#1D4ED8':'#E5E7EB'}`,
              background:activeView===v.key?'#EFF6FF':'#fff',
              color:activeView===v.key?'#1D4ED8':'#6B7280',
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* ── Results count ── */}
      <div style={{ fontSize:13, color:'#6B7280', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span>Showing {filtered.length} of {students.length} students</span>
        {classId && <button onClick={()=>setClassId('')} style={{ fontSize:12, color:'#DC2626', background:'none', border:'none', cursor:'pointer' }}>✕ Clear class filter</button>}
      </div>

      {/* ── Student Table ── */}
      {loading ? <LoadingState /> : !filtered.length ? (
        <EmptyState icon="💰" title="No students found" subtitle="Try adjusting your filters"/>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['#','Student','Roll','Class','Total Fees','Paid','Pending','Progress','Status','History'].map(h=>(
                    <th key={h} style={{ padding:'11px 14px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s,i) => {
                  const name     = s.student?.user?.name || '—';
                  const rate    = pct(s.paidAmount, s.totalFees);
                  const ss      = STATUS[s.paymentStatus] || STATUS.pending;
                  const pending = s.pendingAmount || 0;
                  const isOverdue = s.dueDate && new Date(s.dueDate) < today && s.paymentStatus !== 'paid';

                  return (
                    <tr key={s._id||i}
                      style={{ borderBottom:'0.5px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff', transition:'background 0.1s' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'}>
                      <td style={{ padding:'11px 14px', color:'#9CA3AF', fontSize:12 }}>{i+1}</td>
                      <td style={{ padding:'11px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                          <div style={{ width:34, height:34, borderRadius:9, background:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{name[0]?.toUpperCase()||'?'}</span>
                          </div>
                          <div>
                            <div style={{ fontWeight:700, color:'#111827' }}>{name}</div>
                            {isOverdue && <div style={{ fontSize:10, color:'#DC2626', fontWeight:700 }}>⚠ OVERDUE</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'11px 14px', color:'#6B7280' }}>{s.student?.rollNumber||'—'}</td>
                      <td style={{ padding:'11px 14px', color:'#374151', whiteSpace:'nowrap' }}>{s.class?.name} {s.class?.section||''}</td>
                      <td style={{ padding:'11px 14px', fontWeight:700, color:'#1D4ED8' }}>{fmt(s.totalFees)}</td>
                      <td style={{ padding:'11px 14px', fontWeight:700, color:'#16A34A' }}>{fmt(s.paidAmount)}</td>
                      <td style={{ padding:'11px 14px', fontWeight:700, color:pending>0?'#DC2626':'#16A34A' }}>{fmt(pending)}</td>
                      <td style={{ padding:'11px 14px', minWidth:120 }}>
                        <Bar value={rate} color={rate===100?'#16A34A':rate>50?'#D97706':'#EF4444'} height={6}/>
                        <div style={{ fontSize:10, color:'#9CA3AF', marginTop:3 }}>{rate}%</div>
                      </td>
                      <td style={{ padding:'11px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:ss.color, background:ss.bg, padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap' }}>{ss.label}</span>
                      </td>
                      <td style={{ padding:'11px 14px' }}>
                        {s.student?._id ? (
                          <button onClick={()=>setPanelStudent(s)}
                            style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'5px 12px', borderRadius:7, cursor:'pointer', whiteSpace:'nowrap' }}>
                            View →
                          </button>
                        ) : (
                          <span style={{ fontSize:11, color:'#9CA3AF', fontStyle:'italic' }}>orphan record</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer totals */}
              <tfoot>
                <tr style={{ background:'#F8FAFC', borderTop:'2px solid #E5E7EB' }}>
                  <td colSpan={4} style={{ padding:'11px 14px', fontWeight:700, color:'#374151' }}>
                    Total ({filtered.length} students)
                  </td>
                  <td style={{ padding:'11px 14px', fontWeight:900, color:'#1D4ED8' }}>
                    {fmt(filtered.reduce((s,st)=>s+(st.totalFees||0),0))}
                  </td>
                  <td style={{ padding:'11px 14px', fontWeight:900, color:'#16A34A' }}>
                    {fmt(filtered.reduce((s,st)=>s+(st.paidAmount||0),0))}
                  </td>
                  <td style={{ padding:'11px 14px', fontWeight:900, color:'#DC2626' }}>
                    {fmt(filtered.reduce((s,st)=>s+(st.pendingAmount||0),0))}
                  </td>
                  <td colSpan={3}/>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Student History Panel (slide-in) ── */}
      {panelStudent && (
        <StudentHistoryPanel student={panelStudent} onClose={()=>setPanelStudent(null)}/>
      )}
    </div>
  );
}