// frontend/src/pages/Fees/RecordPayment.js
// Complete fee payment workflow:
// Step 1 — Select Student
// Step 2 — View their fee assignments (Tuition, Transport, Exam, etc.)
// Step 3 — Pay against a specific assignment or add a new one
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI } from '../../utils/api';
import { LoadingState, EmptyState, Modal } from '../../components/ui';

const fmt = n => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n||0);
const METHODS  = ['cash','upi','bank','cheque','online'];
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAT_ICON = { tuition:'🏫', exam:'📝', transport:'🚌', uniform:'👕', library:'📚', sports:'⚽', other:'💰' };
const CAT_COLOR= { tuition:'#1D4ED8', exam:'#7C3AED', transport:'#0891B2', uniform:'#D97706', library:'#16A34A', sports:'#DC2626', other:'#6B7280' };
const STATUS_S = {
  paid:    { bg:'#F0FDF4', color:'#16A34A', border:'#22C55E', label:'✅ Paid' },
  partial: { bg:'#FFF7ED', color:'#EA580C', border:'#F97316', label:'🔵 Partial' },
  pending: { bg:'#FEF2F2', color:'#DC2626', border:'#EF4444', label:'⏳ Pending' },
  overdue: { bg:'#FFF1F2', color:'#BE123C', border:'#FB7185', label:'🔴 Overdue' },
  waived:  { bg:'#F0FDF4', color:'#6B7280', border:'#D1D5DB', label:'✓ Waived' },
};

const INP = { padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, boxSizing:'border-box', outline:'none', width:'100%', fontFamily:'inherit' };
const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' };

// ── Receipt download ──────────────────────────────────────────────────────────
async function downloadReceipt(receiptNo) {
  try {
    const token = localStorage.getItem('token');
    const base  = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    const res   = await fetch(`${base}/fees/receipt/${receiptNo}/pdf`, { headers:{ Authorization:`Bearer ${token}` } });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `receipt-${receiptNo}.pdf`; a.click();
    toast.success('Receipt downloaded');
  } catch { toast.error('Receipt not available'); }
}

// ── Pay modal — pay against a specific FeeAssignment ─────────────────────────
function PayModal({ assignment, onClose, onSuccess }) {
  const now = new Date();
  const [form, setForm] = useState({
    amount: assignment.pendingAmount || '',
    method: 'cash', transactionId: '', remarks: '',
    installmentNumber: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const handlePay = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount');
    if (parseFloat(form.amount) > (assignment.pendingAmount||0)) return toast.error(`Max payable: ${fmt(assignment.pendingAmount)}`);
    setSaving(true);
    try {
      const res = await feeAPI.payAssignment(assignment._id, {
        amount:            parseFloat(form.amount),
        method:            form.method,
        transactionId:     form.transactionId || undefined,
        remarks:           form.remarks || undefined,
        installmentNumber: form.installmentNumber ? parseInt(form.installmentNumber) : undefined,
      });
      toast.success('Payment recorded!');
      onSuccess(res.data);
      onClose();
    } catch (err) { toast.error(err.response?.data?.message || 'Payment failed'); }
    finally { setSaving(false); }
  };

  const cat   = assignment.feeType?.category || 'other';
  const color = CAT_COLOR[cat] || '#1D4ED8';

  return (
    <Modal isOpen onClose={onClose} title="💳 Record Payment" size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={handlePay} disabled={saving} className="btn-primary" style={{ background:color, borderColor:color }}>
          {saving ? '⏳ Processing…' : '✓ Confirm Payment'}
        </button>
      </>}
    >
      {/* Fee info */}
      <div style={{ background:`${color}10`, border:`1px solid ${color}30`, borderRadius:12, padding:'14px 16px', marginBottom:18 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>{CAT_ICON[cat]||'💰'}</span>
          <div>
            <div style={{ fontWeight:800, fontSize:14, color:'#111827' }}>{assignment.feeType?.name||'Fee'}</div>
            <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>
              {assignment.student?.user?.name} &nbsp;·&nbsp;
              {fmt(assignment.finalAmount)} total &nbsp;·&nbsp;
              <span style={{ color:color, fontWeight:700 }}>{fmt(assignment.pendingAmount)} pending</span>
            </div>
            {assignment.dueDate && (
              <div style={{ fontSize:11, color: new Date(assignment.dueDate) < new Date() ? '#DC2626' : '#6B7280', marginTop:3, fontWeight:600 }}>
                Due: {new Date(assignment.dueDate).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}
                {new Date(assignment.dueDate) < new Date() && ' ⚠️ Overdue'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {/* Amount */}
        <div>
          <label style={LBL}>Amount (₹) *</label>
          <input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)}
            placeholder={`Max: ${fmt(assignment.pendingAmount)}`} style={INP} />
          <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
            {[assignment.pendingAmount, Math.ceil(assignment.pendingAmount/2), Math.ceil(assignment.pendingAmount/4)]
              .filter((v,i,a) => v > 0 && a.indexOf(v) === i)
              .map(v => (
                <button key={v} onClick={() => set('amount', v)}
                  style={{ fontSize:11, padding:'4px 9px', borderRadius:6, border:`1px solid ${color}40`, background:`${color}10`, cursor:'pointer', fontWeight:600, color }}>
                  {fmt(v)}
                </button>
              ))}
          </div>
        </div>

        {/* Method */}
        <div>
          <label style={LBL}>Payment Method</label>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {METHODS.map(m => (
              <button key={m} onClick={() => set('method',m)} style={{
                padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                border:`1.5px solid ${form.method===m?color:'#E5E7EB'}`,
                background: form.method===m ? `${color}10` : '#fff',
                color: form.method===m ? color : '#6B7280',
              }}>{m.toUpperCase()}</button>
            ))}
          </div>
        </div>

        {/* Installment picker if applicable */}
        {assignment.hasInstallments && assignment.installments?.length > 0 && (
          <div>
            <label style={LBL}>Installment (Optional)</label>
            <select value={form.installmentNumber} onChange={e=>set('installmentNumber',e.target.value)} style={INP}>
              <option value="">— General Payment —</option>
              {assignment.installments.map(inst => (
                <option key={inst.number} value={inst.number} disabled={inst.status==='paid'}>
                  Installment {inst.number} — {fmt(inst.amount)} — {inst.status}
                  {inst.dueDate ? ` (Due: ${new Date(inst.dueDate).toLocaleDateString('en-IN')})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={LBL}>Transaction ID / Reference</label>
          <input value={form.transactionId} onChange={e=>set('transactionId',e.target.value)} placeholder="Optional" style={INP} />
        </div>
        <div>
          <label style={LBL}>Remarks</label>
          <input value={form.remarks} onChange={e=>set('remarks',e.target.value)} placeholder="Optional note" style={INP} />
        </div>
      </div>
    </Modal>
  );
}

// ── Assign Fee Modal — create new FeeAssignment for a student ─────────────────
function AssignFeeModal({ student, onClose, onSuccess }) {
  const now = new Date();
  const [feeTypes, setFeeTypes] = useState([]);
  const [form, setForm] = useState({
    feeTypeId: '', baseAmount: '', discountPct: 0, discountAmt: 0,
    discountReason: '', dueDate: '', month: MONTHS[now.getMonth()],
    year: now.getFullYear(), lateFeePerDay: 0,
    hasInstallments: false, installmentCount: 2,
    firstDueDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  useEffect(() => {
    feeAPI.getFeeTypes().then(r => setFeeTypes(r.data.data||[])).catch(()=>{});
  }, []);

  const selectedType = feeTypes.find(t => t._id === form.feeTypeId);
  const finalAmount  = Math.max(0, (parseFloat(form.baseAmount)||0) - ((parseFloat(form.baseAmount)||0) * (parseFloat(form.discountPct)||0) / 100) - (parseFloat(form.discountAmt)||0));

  const handleAssign = async () => {
    if (!form.feeTypeId) return toast.error('Select a fee type');
    if (!form.baseAmount || parseFloat(form.baseAmount) <= 0) return toast.error('Enter a valid amount');
    setSaving(true);
    try {
      await feeAPI.createAssignment({
        studentId:        student._id,
        classId:          student.class?._id || student.class,
        feeTypeId:        form.feeTypeId,
        baseAmount:       parseFloat(form.baseAmount),
        discountPct:      parseFloat(form.discountPct)||0,
        discountAmt:      parseFloat(form.discountAmt)||0,
        discountReason:   form.discountReason||undefined,
        dueDate:          form.dueDate||undefined,
        month:            form.month,
        year:             form.year,
        lateFeePerDay:    parseFloat(form.lateFeePerDay)||0,
        hasInstallments:  form.hasInstallments,
        installmentCount: parseInt(form.installmentCount)||2,
        firstDueDate:     form.firstDueDate||undefined,
      });
      toast.success('Fee assigned successfully!');
      onSuccess();
      onClose();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to assign fee'); }
    finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title={`➕ Assign Fee — ${student?.user?.name}`} size="md"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={handleAssign} disabled={saving} className="btn-primary">
          {saving ? '⏳ Saving…' : '✓ Assign Fee'}
        </button>
      </>}
    >
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        {/* Fee type */}
        <div style={{ gridColumn:'1/-1' }}>
          <label style={LBL}>Fee Type *</label>
          <select value={form.feeTypeId} onChange={e => {
            const t = feeTypes.find(x=>x._id===e.target.value);
            set('feeTypeId', e.target.value);
            if (t?.defaultAmount) set('baseAmount', t.defaultAmount);
          }} style={INP}>
            <option value="">— Select Fee Type —</option>
            {feeTypes.map(t => (
              <option key={t._id} value={t._id}>{CAT_ICON[t.category]||'💰'} {t.name} ({t.category})</option>
            ))}
          </select>
          {selectedType && (
            <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>{selectedType.description} · {selectedType.frequency}</div>
          )}
        </div>

        {/* Amount */}
        <div>
          <label style={LBL}>Base Amount (₹) *</label>
          <input type="number" value={form.baseAmount} onChange={e=>set('baseAmount',e.target.value)} placeholder="0" style={INP} />
        </div>

        {/* Due date */}
        <div>
          <label style={LBL}>Due Date</label>
          <input type="date" value={form.dueDate} onChange={e=>set('dueDate',e.target.value)} style={INP} />
        </div>

        {/* Discount */}
        <div>
          <label style={LBL}>Discount % (0–100)</label>
          <input type="number" min={0} max={100} value={form.discountPct} onChange={e=>set('discountPct',e.target.value)} placeholder="0" style={INP} />
        </div>
        <div>
          <label style={LBL}>Flat Discount (₹)</label>
          <input type="number" min={0} value={form.discountAmt} onChange={e=>set('discountAmt',e.target.value)} placeholder="0" style={INP} />
        </div>

        {/* Discount reason */}
        <div style={{ gridColumn:'1/-1' }}>
          <label style={LBL}>Discount Reason</label>
          <input value={form.discountReason} onChange={e=>set('discountReason',e.target.value)} placeholder="e.g. Scholarship, Sibling, Waiver" style={INP} />
        </div>

        {/* Month / Year */}
        <div>
          <label style={LBL}>Month</label>
          <select value={form.month} onChange={e=>set('month',e.target.value)} style={INP}>
            {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Year</label>
          <select value={form.year} onChange={e=>set('year',e.target.value)} style={INP}>
            {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Late fee */}
        <div>
          <label style={LBL}>Late Fee per Day (₹)</label>
          <input type="number" min={0} value={form.lateFeePerDay} onChange={e=>set('lateFeePerDay',e.target.value)} placeholder="0 = no late fee" style={INP} />
        </div>

        {/* Installments */}
        <div>
          <label style={LBL}>Installments</label>
          <div style={{ display:'flex', alignItems:'center', gap:8, height:42 }}>
            <input type="checkbox" checked={form.hasInstallments} onChange={e=>set('hasInstallments',e.target.checked)} style={{ width:16, height:16 }} id="inst" />
            <label htmlFor="inst" style={{ fontSize:13, cursor:'pointer' }}>Enable installments</label>
          </div>
        </div>

        {form.hasInstallments && (
          <>
            <div>
              <label style={LBL}>Number of Installments</label>
              <input type="number" min={2} max={12} value={form.installmentCount} onChange={e=>set('installmentCount',e.target.value)} style={INP} />
            </div>
            <div>
              <label style={LBL}>First Due Date</label>
              <input type="date" value={form.firstDueDate} onChange={e=>set('firstDueDate',e.target.value)} style={INP} />
            </div>
          </>
        )}

        {/* Final amount preview */}
        <div style={{ gridColumn:'1/-1', background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:12, padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>
            Final Amount After Discount
          </div>
          <div style={{ fontFamily:"'Merriweather',Georgia,serif", fontSize:24, fontWeight:700, color:'#F6D57A' }}>
            ₹{finalAmount.toLocaleString('en-IN')}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Assignment card ───────────────────────────────────────────────────────────
function AssignmentCard({ a, onPay, onDownload }) {
  const cat   = a.feeType?.category || 'other';
  const color = CAT_COLOR[cat] || '#6B7280';
  const icon  = CAT_ICON[cat] || '💰';
  const ss    = STATUS_S[a.status] || STATUS_S.pending;
  const pct   = a.finalAmount > 0 ? Math.round((a.paidAmount / a.finalAmount) * 100) : 0;
  const overdue = a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'paid';

  return (
    <div style={{ background:'#fff', borderRadius:14, border:`1.5px solid ${overdue?'#FCA5A5':'#E5E7EB'}`, borderLeft:`4px solid ${color}`, padding:'16px 18px', marginBottom:12 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
        {/* Icon + name */}
        <div style={{ width:40, height:40, borderRadius:11, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
          {icon}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
            <div style={{ fontWeight:800, fontSize:14, color:'#111827' }}>{a.feeType?.name||'Fee'}</div>
            <span style={{ fontSize:11, fontWeight:700, color:ss.color, background:ss.bg, border:`1px solid ${ss.border}40`, padding:'2px 9px', borderRadius:20 }}>{ss.label}</span>
            {overdue && <span style={{ fontSize:11, fontWeight:700, color:'#DC2626' }}>⏰ Overdue</span>}
          </div>
          <div style={{ fontSize:12, color:'#6B7280', marginBottom:8 }}>
            {a.month && <span>{a.month} {a.year} &nbsp;·&nbsp;</span>}
            Total: <strong>{fmt(a.finalAmount)}</strong>
            {a.discountPct > 0 && <span style={{ color:'#16A34A' }}> &nbsp;(−{a.discountPct}% discount)</span>}
            {a.dueDate && <span> &nbsp;·&nbsp; Due: {new Date(a.dueDate).toLocaleDateString('en-IN', {day:'numeric',month:'short'})}</span>}
          </div>

          {/* Progress bar */}
          <div style={{ height:6, background:'#F3F4F6', borderRadius:4, overflow:'hidden', marginBottom:6 }}>
            <div style={{ height:'100%', width:`${pct}%`, background:a.status==='paid'?'#16A34A':color, borderRadius:4, transition:'width 0.6s' }}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#6B7280' }}>
            <span>Paid: <strong style={{color:'#16A34A'}}>{fmt(a.paidAmount)}</strong></span>
            <span>Pending: <strong style={{color:a.pendingAmount>0?'#DC2626':'#16A34A'}}>{fmt(a.pendingAmount)}</strong></span>
            <span>{pct}%</span>
          </div>

          {/* Installments */}
          {a.hasInstallments && a.installments?.length > 0 && (
            <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
              {a.installments.map(inst => {
                const is = STATUS_S[inst.status]||STATUS_S.pending;
                return (
                  <div key={inst.number} style={{ fontSize:10, fontWeight:700, color:is.color, background:is.bg, border:`1px solid ${is.border}40`, padding:'2px 8px', borderRadius:10 }}>
                    #{inst.number} {fmt(inst.amount)} · {inst.status}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent payments */}
          {a.payments?.length > 0 && (
            <div style={{ marginTop:10, display:'flex', gap:6, flexWrap:'wrap' }}>
              {a.payments.slice(-3).map((p,i) => (
                <div key={i} style={{ fontSize:10, color:'#6B7280', background:'#F8FAFC', border:'1px solid #E5E7EB', padding:'3px 8px', borderRadius:8, display:'flex', alignItems:'center', gap:5 }}>
                  <span>{fmt(p.amount)}</span>
                  <span style={{ color:'#9CA3AF' }}>·</span>
                  <span>{new Date(p.paidOn).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
                  {p.receiptNumber && (
                    <button onClick={() => downloadReceipt(p.receiptNumber)}
                      style={{ fontSize:10, color:'#1D4ED8', background:'none', border:'none', cursor:'pointer', fontWeight:700, padding:0 }}>
                      ⬇
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pay button */}
        {a.status !== 'paid' && a.status !== 'waived' && (
          <button onClick={() => onPay(a)} style={{
            padding:'8px 16px', borderRadius:9, fontSize:12, fontWeight:700,
            background: color, color:'#fff', border:'none', cursor:'pointer',
            flexShrink:0, whiteSpace:'nowrap',
          }}>
            💳 Pay {fmt(a.pendingAmount)}
          </button>
        )}
        {a.status === 'paid' && a.payments?.[0]?.receiptNumber && (
          <button onClick={() => downloadReceipt(a.payments[a.payments.length-1].receiptNumber)}
            style={{ padding:'8px 14px', borderRadius:9, fontSize:12, fontWeight:700, background:'#F0FDF4', border:'1.5px solid #22C55E', color:'#16A34A', cursor:'pointer', flexShrink:0 }}>
            ⬇ Receipt
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RecordPayment() {
  const [classes,     setClasses]     = useState([]);
  const [students,    setStudents]    = useState([]);
  const [selected,    setSelected]    = useState(null);   // selected StudentFee record
  const [assignments, setAssignments] = useState([]);
  const [classId,     setClassId]     = useState('');
  const [search,      setSearch]      = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingAss,  setLoadingAss]  = useState(false);
  const [payTarget,   setPayTarget]   = useState(null);   // assignment to pay
  const [assignModal, setAssignModal] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);

  useEffect(() => {
    classAPI.getAll().then(r => setClasses(r.data.data||[])).catch(()=>{});
  }, []);

  useEffect(() => {
    if (!classId) { setStudents([]); setSelected(null); return; }
    setLoadingStudents(true);
    feeAPI.getStudents({ classId, limit:200 })
      .then(r => setStudents(r.data.data||[]))
      .catch(()=>toast.error('Failed to load students'))
      .finally(()=>setLoadingStudents(false));
  }, [classId]);

  const loadAssignments = useCallback(async (studentId) => {
    if (!studentId) return;
    setLoadingAss(true);
    try {
      const r = await feeAPI.getAssignments({ studentId });
      setAssignments(r.data.data || []);
    } catch { toast.error('Failed to load fee assignments'); }
    finally { setLoadingAss(false); }
  }, []);

  const handleSelectStudent = (record) => {
    setSelected(record);
    setSuccessInfo(null);
    loadAssignments(record.student?._id || record.student);
  };

  const handlePaySuccess = (resData) => {
    setSuccessInfo({ receipt: resData?.data?.receiptNumber || resData?.receiptNumber });
    loadAssignments(selected.student?._id || selected.student);
    // Refresh student list
    if (classId) {
      feeAPI.getStudents({ classId, limit:200 }).then(r=>setStudents(r.data.data||[])).catch(()=>{});
    }
  };

  const filtered = students.filter(r => !search ||
    r.student?.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.student?.admissionNumber?.includes(search)
  );

  const totalAssigned = assignments.reduce((s,a)=>s+(a.finalAmount||0),0);
  const totalPaid     = assignments.reduce((s,a)=>s+(a.paidAmount||0),0);
  const totalPending  = assignments.reduce((s,a)=>s+(a.pendingAmount||0),0);

  const SEL_INP = { padding:'8px 11px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  return (
    <div>
      <div className="page-header" style={{ marginBottom:20 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">💳 Fee Payments</h2>
          <p className="text-sm text-muted">Select a student to view and pay their fees</p>
        </div>
      </div>

      {/* Success banner */}
      {successInfo && (
        <div style={{ background:'#F0FDF4', border:'2px solid #22C55E', borderRadius:12, padding:'16px 20px', marginBottom:18, display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ fontSize:28 }}>✅</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#15803D' }}>Payment Recorded Successfully!</div>
            {successInfo.receipt && <div style={{ fontSize:12, color:'#16A34A', marginTop:2 }}>Receipt #{successInfo.receipt}</div>}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {successInfo.receipt && (
              <button onClick={()=>downloadReceipt(successInfo.receipt)}
                style={{ padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
                ⬇ Download Receipt
              </button>
            )}
            <button onClick={()=>setSuccessInfo(null)}
              style={{ padding:'8px 12px', borderRadius:8, fontSize:12, fontWeight:600, background:'#fff', border:'1px solid #E5E7EB', cursor:'pointer' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:20, alignItems:'start' }}>

        {/* ── Student panel ── */}
        <div>
          <div className="card" style={{ padding:16 }}>
            <div style={{ fontWeight:700, fontSize:14, color:'#0B1F4A', marginBottom:14 }}>1. Select Student</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
              <select value={classId} onChange={e=>{setClassId(e.target.value);setSelected(null);setSearch('');setAssignments([]);}} style={SEL_INP}>
                <option value="">— All Classes —</option>
                {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
              </select>
              <input placeholder="🔍 Search student…" value={search} onChange={e=>setSearch(e.target.value)} style={SEL_INP} />
            </div>

            {loadingStudents ? <LoadingState /> : filtered.length === 0 ? (
              <div style={{ textAlign:'center', padding:'16px 0', color:'#9CA3AF', fontSize:13 }}>
                {classId ? 'No students found' : 'Select a class above'}
              </div>
            ) : (
              <div style={{ maxHeight:420, overflowY:'auto', border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden' }}>
                {filtered.map((r,i) => {
                  const isSel = selected?._id === r._id;
                  return (
                    <div key={r._id} onClick={()=>handleSelectStudent(r)} style={{
                      display:'flex', alignItems:'center', gap:10, padding:'11px 13px',
                      cursor:'pointer', borderBottom: i<filtered.length-1?'1px solid #F3F4F6':'none',
                      background: isSel ? '#EFF6FF' : '#fff',
                      borderLeft: isSel ? '3px solid #1D4ED8' : '3px solid transparent',
                      transition:'all 0.12s',
                    }}>
                      <div style={{ width:34, height:34, borderRadius:9, background:isSel?'#1D4ED8':'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:isSel?'#fff':'#6B7280', flexShrink:0 }}>
                        {r.student?.user?.name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?'}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12.5, fontWeight:700, color:isSel?'#1D4ED8':'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.student?.user?.name||'—'}</div>
                        <div style={{ fontSize:10.5, color:'#9CA3AF' }}>Adm: {r.student?.admissionNumber||'—'}</div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:r.pendingAmount>0?'#DC2626':'#16A34A' }}>{fmt(r.pendingAmount)}</div>
                        <div style={{ fontSize:9.5, color:'#9CA3AF' }}>pending</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Assignments panel ── */}
        <div>
          {!selected ? (
            <div className="card" style={{ padding:40, textAlign:'center' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>👈</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#374151' }}>Select a Student</div>
              <div style={{ fontSize:13, color:'#6B7280', marginTop:6 }}>Choose a student from the left to view their fee assignments and make payments.</div>
            </div>
          ) : (
            <div>
              {/* Student header */}
              <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:14, padding:'18px 22px', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:46, height:46, borderRadius:13, background:'rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:900, color:'#fff', flexShrink:0 }}>
                      {selected.student?.user?.name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?'}
                    </div>
                    <div>
                      <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>{selected.student?.user?.name}</div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:2 }}>
                        {selected.class?.name} {selected.class?.section||''} &nbsp;·&nbsp; Adm: {selected.student?.admissionNumber||'—'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:16 }}>
                    {[
                      { label:'Assigned', val:fmt(totalAssigned), color:'rgba(255,255,255,0.6)' },
                      { label:'Paid',     val:fmt(totalPaid),     color:'#34D399' },
                      { label:'Pending',  val:fmt(totalPending),  color:totalPending>0?'#FCA5A5':'#34D399' },
                    ].map(s=>(
                      <div key={s.label} style={{ textAlign:'center' }}>
                        <div style={{ fontSize:14, fontWeight:900, color:'#fff' }}>{s.val}</div>
                        <div style={{ fontSize:9, color:s.color, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Assignments header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <div style={{ fontWeight:700, fontSize:15, color:'#0B1F4A' }}>
                  2. Fee Assignments
                  <span style={{ fontSize:12, color:'#9CA3AF', fontWeight:400, marginLeft:8 }}>{assignments.length} fees</span>
                </div>
                <button onClick={()=>setAssignModal(true)} style={{
                  padding:'8px 16px', borderRadius:9, fontSize:12, fontWeight:700,
                  background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer',
                }}>
                  ➕ Assign New Fee
                </button>
              </div>

              {loadingAss ? <LoadingState /> : assignments.length === 0 ? (
                <div className="card" style={{ padding:32, textAlign:'center' }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>📋</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'#374151' }}>No Fee Assignments</div>
                  <div style={{ fontSize:13, color:'#6B7280', marginTop:6, marginBottom:16 }}>
                    No fees have been assigned to this student yet.
                  </div>
                  <button onClick={()=>setAssignModal(true)} style={{ padding:'10px 20px', borderRadius:9, fontSize:13, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
                    ➕ Assign First Fee
                  </button>
                </div>
              ) : (
                <div>
                  {/* Group by category */}
                  {['tuition','transport','exam','uniform','library','sports','other'].map(cat => {
                    const group = assignments.filter(a => (a.feeType?.category||'other') === cat);
                    if (!group.length) return null;
                    return (
                      <div key={cat} style={{ marginBottom:8 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'1px', marginBottom:8 }}>
                          {CAT_ICON[cat]} {cat}
                        </div>
                        {group.map(a => (
                          <AssignmentCard key={a._id} a={a} onPay={setPayTarget} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pay modal */}
      {payTarget && (
        <PayModal
          assignment={payTarget}
          onClose={() => setPayTarget(null)}
          onSuccess={handlePaySuccess}
        />
      )}

      {/* Assign fee modal */}
      {assignModal && selected && (
        <AssignFeeModal
          student={selected.student}
          onClose={() => setAssignModal(false)}
          onSuccess={() => loadAssignments(selected.student?._id || selected.student)}
        />
      )}
    </div>
  );
}