// frontend/src/pages/Fees/AssignFees.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI, studentAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';

const STATUS_STYLE = {
  paid:    { bg:'#D1FAE5', color:'#065F46', label:'Paid' },
  partial: { bg:'#DBEAFE', color:'#1E40AF', label:'Partial' },
  pending: { bg:'#FEF3C7', color:'#92400E', label:'Pending' },
  overdue: { bg:'#FEE2E2', color:'#991B1B', label:'Overdue' },
  waived:  { bg:'#F3F4F6', color:'#374151', label:'Waived' },
};

const INP = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none', fontFamily:'inherit', background:'#fff' };
const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' };
const fmt = n => `₹${(n||0).toLocaleString('en-IN')}`;

const EMPTY_FORM = { feeTypeId:'', assignTo:'class', classId:'', studentId:'', baseAmount:'', discountPct:'0', discountAmt:'0', discountReason:'', dueDate:'', month:'', year:new Date().getFullYear(), lateFeePerDay:'0', hasInstallments:false, installmentCount:'2', firstDueDate:'' };

export default function AssignFees() {
  const [assignments, setAssignments] = useState([]);
  const [feeTypes,    setFeeTypes]    = useState([]);
  const [classes,     setClasses]     = useState([]);
  const [students,    setStudents]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [filter,      setFilter]      = useState({ status:'', classId:'', feeTypeId:'' });
  const [payModal,    setPayModal]    = useState(null); // assignment to pay
  const [payForm,     setPayForm]     = useState({ amount:'', method:'cash', transactionId:'', remarks:'' });
  const [paying,      setPaying]      = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [aRes, fRes, cRes] = await Promise.all([
        feeAPI.getAssignments(filter),
        feeAPI.getFeeTypes(),
        classAPI.getAll(),
      ]);
      setAssignments(aRes.data.data || []);
      setFeeTypes(fRes.data.data || []);
      setClasses(cRes.data.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);

  // Load students when class changes
  useEffect(() => {
    if (form.classId) {
      studentAPI.getAll({ classId: form.classId })
        .then(r => setStudents(r.data.data || []))
        .catch(() => setStudents([]));
    }
  }, [form.classId]);

  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const finalAmount = () => {
    const base = +form.baseAmount || 0;
    const pctOff = base * ((+form.discountPct||0)/100);
    const amtOff = +form.discountAmt || 0;
    return Math.max(0, base - pctOff - amtOff);
  };

  const handleAssign = async () => {
    if (!form.feeTypeId || !form.baseAmount) return toast.error('Fee type and amount required');
    if (!form.classId) return toast.error('Select a class');
    if (form.assignTo === 'student' && !form.studentId) return toast.error('Select a student');
    setSaving(true);
    try {
      const payload = {
        feeTypeId:       form.feeTypeId,
        classId:         form.classId,
        studentId:       form.assignTo === 'student' ? form.studentId : null,
        baseAmount:      +form.baseAmount,
        discountPct:     +form.discountPct || 0,
        discountAmt:     +form.discountAmt || 0,
        discountReason:  form.discountReason,
        dueDate:         form.dueDate || null,
        month:           form.month,
        year:            form.year,
        lateFeePerDay:   +form.lateFeePerDay || 0,
        hasInstallments: form.hasInstallments,
        installmentCount:+form.installmentCount || 2,
        firstDueDate:    form.firstDueDate || form.dueDate || null,
      };
      await feeAPI.createAssignment(payload);
      toast.success(form.assignTo === 'class' ? 'Fee assigned to entire class!' : 'Fee assigned to student!');
      setShowForm(false); setForm(EMPTY_FORM); load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign fee');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this fee assignment?')) return;
    try { await feeAPI.deleteAssignment(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const handlePay = async () => {
    if (!payForm.amount || +payForm.amount <= 0) return toast.error('Enter valid amount');
    setPaying(true);
    try {
      await feeAPI.payAssignment(payModal._id, { amount:+payForm.amount, method:payForm.method, transactionId:payForm.transactionId, remarks:payForm.remarks });
      toast.success(`Payment of ${fmt(+payForm.amount)} recorded!`);
      setPayModal(null); setPayForm({ amount:'', method:'cash', transactionId:'', remarks:'' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Payment failed'); }
    finally { setPaying(false); }
  };

  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">📋 Fee Assignments</h2>
          <p className="text-sm text-muted mt-0.5">{assignments.length} assignments</p>
        </div>
        <button onClick={()=>setShowForm(!showForm)} style={{ padding:'9px 20px', borderRadius:9, fontSize:13, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
          {showForm ? '✕ Cancel' : '+ Assign Fee'}
        </button>
      </div>

      {/* Assign Form */}
      {showForm && (
        <div className="card" style={{ marginBottom:20, padding:'20px 24px' }}>
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:18, color:'#111827' }}>Assign New Fee</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
            <div>
              <label style={LBL}>Fee Type *</label>
              <select value={form.feeTypeId} onChange={e=>set('feeTypeId',e.target.value)} style={INP}>
                <option value="">— Select Fee Type —</option>
                {feeTypes.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Assign To</label>
              <select value={form.assignTo} onChange={e=>set('assignTo',e.target.value)} style={INP}>
                <option value="class">Entire Class</option>
                <option value="student">Individual Student</option>
              </select>
            </div>
            <div>
              <label style={LBL}>Class *</label>
              <select value={form.classId} onChange={e=>set('classId',e.target.value)} style={INP}>
                <option value="">— Select Class —</option>
                {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
              </select>
            </div>
            {form.assignTo === 'student' && (
              <div>
                <label style={LBL}>Student *</label>
                <select value={form.studentId} onChange={e=>set('studentId',e.target.value)} style={INP}>
                  <option value="">— Select Student —</option>
                  {students.map(s=><option key={s._id} value={s._id}>{s.user?.name} (Roll {s.rollNumber})</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={LBL}>Base Amount (₹) *</label>
              <input type="number" value={form.baseAmount} onChange={e=>set('baseAmount',e.target.value)} placeholder="e.g. 5000" style={INP}/>
            </div>
            <div>
              <label style={LBL}>Discount %</label>
              <input type="number" min="0" max="100" value={form.discountPct} onChange={e=>set('discountPct',e.target.value)} style={INP}/>
            </div>
            <div>
              <label style={LBL}>Flat Discount (₹)</label>
              <input type="number" value={form.discountAmt} onChange={e=>set('discountAmt',e.target.value)} style={INP}/>
            </div>
            <div>
              <label style={LBL}>Due Date</label>
              <input type="date" value={form.dueDate} onChange={e=>set('dueDate',e.target.value)} style={INP}/>
            </div>
            <div>
              <label style={LBL}>Month</label>
              <input value={form.month} onChange={e=>set('month',e.target.value)} placeholder="e.g. April 2026" style={INP}/>
            </div>
            <div>
              <label style={LBL}>Late Fee / Day (₹)</label>
              <input type="number" value={form.lateFeePerDay} onChange={e=>set('lateFeePerDay',e.target.value)} style={INP}/>
            </div>
            <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:10 }}>
              <input type="checkbox" id="installments" checked={form.hasInstallments} onChange={e=>set('hasInstallments',e.target.checked)} style={{ width:16, height:16 }}/>
              <label htmlFor="installments" style={{ fontSize:13, color:'#374151', fontWeight:600 }}>Split into installments</label>
              {form.hasInstallments && (
                <input type="number" min="2" max="12" value={form.installmentCount} onChange={e=>set('installmentCount',e.target.value)} style={{ ...INP, width:80 }} placeholder="#"/>
              )}
            </div>
            {form.discountReason || form.discountPct > 0 || form.discountAmt > 0 ? (
              <div>
                <label style={LBL}>Discount Reason</label>
                <input value={form.discountReason} onChange={e=>set('discountReason',e.target.value)} placeholder="e.g. Scholarship" style={INP}/>
              </div>
            ) : null}
          </div>

          {/* Final amount preview */}
          {form.baseAmount && (
            <div style={{ marginTop:16, padding:'12px 16px', background:'#F0FDF4', borderRadius:10, border:'1px solid #BBF7D0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:13, color:'#065F46', fontWeight:600 }}>Final Amount after discounts:</span>
              <span style={{ fontSize:20, fontWeight:900, color:'#16A34A' }}>{fmt(finalAmount())}</span>
            </div>
          )}

          <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:16 }}>
            <button onClick={()=>{ setShowForm(false); setForm(EMPTY_FORM); }} style={{ padding:'9px 20px', borderRadius:8, fontSize:13, fontWeight:700, background:'#F3F4F6', border:'none', cursor:'pointer' }}>Cancel</button>
            <button onClick={handleAssign} disabled={saving} style={{ padding:'9px 24px', borderRadius:8, fontSize:13, fontWeight:700, background:saving?'#9CA3AF':'#1D4ED8', color:'#fff', border:'none', cursor:saving?'not-allowed':'pointer' }}>
              {saving ? '⏳ Assigning…' : form.assignTo==='class' ? '📋 Assign to Class' : '📋 Assign to Student'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        <select value={filter.status} onChange={e=>setFilter(p=>({...p,status:e.target.value}))} style={SEL}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
        <select value={filter.classId} onChange={e=>setFilter(p=>({...p,classId:e.target.value}))} style={SEL}>
          <option value="">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <select value={filter.feeTypeId} onChange={e=>setFilter(p=>({...p,feeTypeId:e.target.value}))} style={SEL}>
          <option value="">All Fee Types</option>
          {feeTypes.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}
        </select>
      </div>

      {/* Assignments Table */}
      {loading ? <LoadingState /> : !assignments.length ? (
        <EmptyState icon="📋" title="No fee assignments" subtitle="Click '+ Assign Fee' to create one"/>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['Student','Class','Fee Type','Total','Paid','Pending','Due Date','Status','Actions'].map(h=>(
                    <th key={h} style={{ padding:'11px 14px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignments.map((a,i) => {
                  const ss = STATUS_STYLE[a.status] || STATUS_STYLE.pending;
                  const pending = a.pendingAmount ?? (a.finalAmount - a.paidAmount);
                  const due = a.dueDate ? new Date(a.dueDate) : null;
                  const isOverdue = due && due < new Date() && a.status !== 'paid';
                  return (
                    <tr key={a._id} style={{ borderBottom:'0.5px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                      <td style={{ padding:'11px 14px', fontWeight:600, color:'#111827' }}>{a.student?.user?.name || '—'}</td>
                      <td style={{ padding:'11px 14px', color:'#6B7280' }}>{a.class?.name} {a.class?.section||''}</td>
                      <td style={{ padding:'11px 14px', color:'#374151' }}>{a.feeType?.name||'—'}</td>
                      <td style={{ padding:'11px 14px', fontWeight:700, color:'#111827' }}>{fmt(a.finalAmount)}</td>
                      <td style={{ padding:'11px 14px', fontWeight:700, color:'#16A34A' }}>{fmt(a.paidAmount)}</td>
                      <td style={{ padding:'11px 14px', fontWeight:700, color:isOverdue?'#DC2626':'#D97706' }}>{fmt(pending)}</td>
                      <td style={{ padding:'11px 14px', color: isOverdue?'#DC2626':'#6B7280', whiteSpace:'nowrap' }}>
                        {due ? due.toLocaleDateString('en-IN') : '—'}
                        {isOverdue && <div style={{ fontSize:10, color:'#DC2626', fontWeight:700 }}>OVERDUE</div>}
                      </td>
                      <td style={{ padding:'11px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:ss.color, background:ss.bg, padding:'3px 10px', borderRadius:20 }}>{ss.label}</span>
                      </td>
                      <td style={{ padding:'11px 14px' }}>
                        <div style={{ display:'flex', gap:5 }}>
                          {a.status !== 'paid' && (
                            <button onClick={()=>{ setPayModal(a); setPayForm({ amount: String(pending), method:'cash', transactionId:'', remarks:'' }); }}
                              style={{ fontSize:11, fontWeight:700, color:'#16A34A', background:'#F0FDF4', border:'1px solid #BBF7D0', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
                              💳 Pay
                            </button>
                          )}
                          <button onClick={()=>handleDelete(a._id)}
                            style={{ fontSize:11, fontWeight:700, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
                            ✕
                          </button>
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

      {/* Pay Modal */}
      {payModal && (
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={()=>setPayModal(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)' }}/>
          <div style={{ position:'relative', background:'#fff', borderRadius:16, width:'100%', maxWidth:440, boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ fontSize:17, fontWeight:700, margin:0 }}>💳 Record Payment</h3>
              <button onClick={()=>setPayModal(null)} style={{ width:28, height:28, borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:16, color:'#6B7280' }}>×</button>
            </div>
            <div style={{ padding:'20px 24px' }}>
              <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 16px', marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{payModal.student?.user?.name}</div>
                <div style={{ fontSize:12, color:'#6B7280' }}>{payModal.feeType?.name} · Total: {fmt(payModal.finalAmount)} · Paid: {fmt(payModal.paidAmount)}</div>
                <div style={{ fontSize:14, fontWeight:900, color:'#DC2626', marginTop:4 }}>Pending: {fmt(payModal.pendingAmount ?? (payModal.finalAmount - payModal.paidAmount))}</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={LBL}>Amount (₹) *</label>
                  <input type="number" value={payForm.amount} onChange={e=>setPayForm(p=>({...p,amount:e.target.value}))} style={INP} placeholder="Enter amount"/>
                </div>
                <div>
                  <label style={LBL}>Payment Method</label>
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
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={LBL}>Remarks</label>
                  <input value={payForm.remarks} onChange={e=>setPayForm(p=>({...p,remarks:e.target.value}))} placeholder="Optional note" style={INP}/>
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