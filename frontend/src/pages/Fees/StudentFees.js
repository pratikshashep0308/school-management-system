// frontend/src/pages/Fees/StudentFees.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';

const fmt = n => `₹${(n||0).toLocaleString('en-IN')}`;
const STATUS_STYLE = {
  paid:    { bg:'#D1FAE5', color:'#065F46' },
  partial: { bg:'#DBEAFE', color:'#1E40AF' },
  pending: { bg:'#FEF3C7', color:'#92400E' },
  overdue: { bg:'#FEE2E2', color:'#991B1B' },
  waived:  { bg:'#F3F4F6', color:'#374151' },
};

export default function StudentFees() {
  const [students, setStudents] = useState([]);
  const [classes,  setClasses]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [classId,  setClassId]  = useState('');
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [payForm,  setPayForm]  = useState({ amount:'', method:'cash', transactionId:'', remarks:'' });
  const [paying,   setPaying]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = classId ? { classId } : {};
      const [sRes, cRes] = await Promise.all([
        feeAPI.getStudentsFees(params),
        classAPI.getAll(),
      ]);
      setStudents(sRes.data.data || []);
      setClasses(cRes.data.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [classId]);

  const filtered = students.filter(s =>
    !search || s.studentName?.toLowerCase().includes(search.toLowerCase()) ||
    s.rollNumber?.toString().includes(search)
  );

  const handlePay = async () => {
    if (!payForm.amount || +payForm.amount <= 0) return toast.error('Enter valid amount');
    setPaying(true);
    try {
      await feeAPI.payAssignment(payModal.assignmentId, { amount:+payForm.amount, method:payForm.method, transactionId:payForm.transactionId, remarks:payForm.remarks });
      toast.success(`Payment of ${fmt(+payForm.amount)} recorded!`);
      setPayModal(null); setPayForm({ amount:'', method:'cash', transactionId:'', remarks:'' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Payment failed'); }
    finally { setPaying(false); }
  };

  const INP = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none', fontFamily:'inherit', background:'#fff' };
  const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' };
  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 className="font-display text-2xl text-ink">👥 Student Fee Records</h2>
        <p className="text-sm text-muted mt-0.5">{filtered.length} students</p>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        <input placeholder="🔍 Search student name or roll…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{ ...SEL, minWidth:220 }}/>
        <select value={classId} onChange={e=>setClassId(e.target.value)} style={SEL}>
          <option value="">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
      </div>

      {loading ? <LoadingState /> : !filtered.length ? (
        <EmptyState icon="👥" title="No students found" subtitle="Assign fees first to see student records"/>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {filtered.map(s => {
            const isOpen = expanded === s.studentId;
            const paidPct = s.totalFees > 0 ? Math.round((s.paidAmount/s.totalFees)*100) : 0;
            return (
              <div key={s.studentId} className="card" style={{ padding:0, overflow:'hidden' }}>
                {/* Student row */}
                <div onClick={()=>setExpanded(isOpen ? null : s.studentId)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', cursor:'pointer', background:isOpen?'#F8FAFC':'#fff' }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{(s.studentName||'?')[0].toUpperCase()}</span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'#111827' }}>{s.studentName}</div>
                    <div style={{ fontSize:12, color:'#6B7280' }}>{s.className} · Roll {s.rollNumber}</div>
                  </div>
                  {/* Progress */}
                  <div style={{ flex:1, minWidth:120, maxWidth:200 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#9CA3AF', marginBottom:4 }}>
                      <span>{fmt(s.paidAmount)} paid</span><span>{paidPct}%</span>
                    </div>
                    <div style={{ height:6, background:'#F3F4F6', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${paidPct}%`, background: paidPct===100?'#16A34A':paidPct>50?'#D97706':'#EF4444', borderRadius:3 }}/>
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontWeight:900, fontSize:15, color: s.pendingAmount>0?'#DC2626':'#16A34A' }}>
                      {s.pendingAmount > 0 ? `${fmt(s.pendingAmount)} due` : '✅ Paid'}
                    </div>
                    <div style={{ fontSize:11, color:'#9CA3AF' }}>Total: {fmt(s.totalFees)}</div>
                  </div>
                  <span style={{ fontSize:16, color:'#9CA3AF', transform:isOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }}>▾</span>
                </div>

                {/* Assignments detail */}
                {isOpen && s.assignments?.length > 0 && (
                  <div style={{ borderTop:'1px solid #E5E7EB' }}>
                    {s.assignments.map((a,i) => {
                      const ss = STATUS_STYLE[a.status] || STATUS_STYLE.pending;
                      const pending = a.pendingAmount ?? (a.finalAmount - a.paidAmount);
                      return (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 18px 10px 30px', borderBottom:'0.5px solid #F3F4F6', background:'#FAFAFA' }}>
                          <div style={{ flex:1 }}>
                            <span style={{ fontWeight:600, fontSize:13, color:'#374151' }}>{a.feeType?.name||'—'}</span>
                            {a.month && <span style={{ fontSize:11, color:'#9CA3AF', marginLeft:8 }}>{a.month}</span>}
                            {a.dueDate && <span style={{ fontSize:11, color:'#9CA3AF', marginLeft:8 }}>Due: {new Date(a.dueDate).toLocaleDateString('en-IN')}</span>}
                          </div>
                          <span style={{ fontSize:13, fontWeight:700, color:'#111827', minWidth:70, textAlign:'right' }}>{fmt(a.finalAmount)}</span>
                          <span style={{ fontSize:13, fontWeight:700, color:'#16A34A', minWidth:60, textAlign:'right' }}>{fmt(a.paidAmount)}</span>
                          <span style={{ fontSize:12, fontWeight:700, color: pending>0?'#DC2626':'#16A34A', minWidth:60, textAlign:'right' }}>{fmt(pending)}</span>
                          <span style={{ fontSize:10, fontWeight:700, color:ss.color, background:ss.bg, padding:'2px 8px', borderRadius:20, flexShrink:0 }}>{a.status}</span>
                          {a.status !== 'paid' && (
                            <button onClick={()=>{ setPayModal({ ...a, assignmentId:a._id, studentName:s.studentName }); setPayForm({ amount:String(pending), method:'cash', transactionId:'', remarks:'' }); }}
                              style={{ fontSize:11, fontWeight:700, color:'#16A34A', background:'#F0FDF4', border:'1px solid #BBF7D0', padding:'4px 10px', borderRadius:6, cursor:'pointer', flexShrink:0 }}>
                              💳 Pay
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pay Modal */}
      {payModal && (
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={()=>setPayModal(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)' }}/>
          <div style={{ position:'relative', background:'#fff', borderRadius:16, width:'100%', maxWidth:420, boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ fontSize:17, fontWeight:700, margin:0 }}>💳 Record Payment</h3>
              <button onClick={()=>setPayModal(null)} style={{ width:28, height:28, borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:16, color:'#6B7280' }}>×</button>
            </div>
            <div style={{ padding:'20px 24px' }}>
              <div style={{ background:'#F0FDF4', borderRadius:10, padding:'12px 16px', marginBottom:16, border:'1px solid #BBF7D0' }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{payModal.studentName} — {payModal.feeType?.name}</div>
                <div style={{ fontSize:13, fontWeight:900, color:'#DC2626', marginTop:4 }}>Pending: {fmt(payModal.pendingAmount ?? (payModal.finalAmount - payModal.paidAmount))}</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={LBL}>Amount (₹) *</label>
                  <input type="number" value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} style={INP}/>
                </div>
                <div>
                  <label style={LBL}>Method</label>
                  <select value={payForm.method} onChange={e=>setPayForm(p=>({...p,method:e.target.value}))} style={INP}>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="card">Card</option>
                  </select>
                </div>
                <div>
                  <label style={LBL}>Transaction ID</label>
                  <input value={payForm.transactionId} onChange={e=>setPayForm(p=>({...p,transactionId:e.target.value}))} placeholder="Optional" style={INP}/>
                </div>
              </div>
            </div>
            <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={()=>setPayModal(null)} style={{ padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:700, background:'#F3F4F6', border:'none', cursor:'pointer' }}>Cancel</button>
              <button onClick={handlePay} disabled={paying} style={{ padding:'8px 22px', borderRadius:8, fontSize:13, fontWeight:700, background:paying?'#9CA3AF':'#16A34A', color:'#fff', border:'none', cursor:paying?'not-allowed':'pointer' }}>
                {paying ? '⏳ Processing…' : '✅ Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}