// frontend/src/pages/Fees/AssignFees.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI, studentAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';

const fmt = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AssignFees() {
  const [classes,     setClasses]     = useState([]);
  const [students,    setStudents]    = useState([]);
  const [feeTypes,    setFeeTypes]    = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);

  const [form, setForm] = useState({
    assignTo:         'class',    // 'class' | 'student'
    classId:          '',
    studentId:        '',
    feeTypeId:        '',
    baseAmount:       '',
    discountPct:      '',
    discountAmt:      '',
    discountReason:   '',
    dueDate:          '',
    month:            `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`,
    year:             new Date().getFullYear(),
    lateFeePerDay:    '',
    hasInstallments:  false,
    installmentCount: 2,
    firstDueDate:     '',
  });

  const set = (k,v) => setForm(p => ({...p, [k]:v}));

  const finalAmount = () => {
    const base = parseFloat(form.baseAmount) || 0;
    const pctD = (base * (parseFloat(form.discountPct)||0)) / 100;
    const amtD = parseFloat(form.discountAmt) || 0;
    return Math.max(0, base - pctD - amtD);
  };

  useEffect(() => {
    Promise.all([classAPI.getAll(), feeAPI.getFeeTypes()])
      .then(([c,f]) => { setClasses(c.data.data||[]); setFeeTypes(f.data.data||[]); });
  }, []);

  useEffect(() => {
    if (!form.classId) { setStudents([]); return; }
    studentAPI.getAll({ class: form.classId }).then(r => setStudents(r.data.data||[]));
  }, [form.classId]);

  // Load existing assignments
  const loadAssignments = () => {
    const params = {};
    if (form.classId)   params.classId   = form.classId;
    if (form.studentId) params.studentId = form.studentId;
    if (!form.classId && !form.studentId) return;
    feeAPI.getAssignments(params).then(r => setAssignments(r.data.data||[])).catch(()=>{});
  };

  useEffect(loadAssignments, [form.classId, form.studentId]);

  const handleAssign = async () => {
    if (!form.feeTypeId) return toast.error('Select a fee type');
    if (!form.baseAmount || parseFloat(form.baseAmount) <= 0) return toast.error('Enter base amount');
    if (form.assignTo === 'class' && !form.classId) return toast.error('Select a class');
    if (form.assignTo === 'student' && !form.studentId) return toast.error('Select a student');

    setSaving(true);
    try {
      const payload = {
        feeTypeId:        form.feeTypeId,
        baseAmount:       parseFloat(form.baseAmount),
        discountPct:      parseFloat(form.discountPct) || 0,
        discountAmt:      parseFloat(form.discountAmt) || 0,
        discountReason:   form.discountReason,
        dueDate:          form.dueDate || null,
        month:            form.month,
        year:             parseInt(form.year),
        lateFeePerDay:    parseFloat(form.lateFeePerDay) || 0,
        hasInstallments:  form.hasInstallments,
        installmentCount: parseInt(form.installmentCount),
        firstDueDate:     form.firstDueDate || form.dueDate,
      };

      if (form.assignTo === 'class') {
        payload.classId = form.classId;
      } else {
        payload.studentId = form.studentId;
        payload.classId   = form.classId;
      }

      const r = await feeAPI.createAssignment(payload);
      toast.success(r.data.count > 1 ? `Fee assigned to ${r.data.count} students!` : 'Fee assigned!');
      loadAssignments();
    } catch (err) { toast.error(err.response?.data?.message || 'Assignment failed'); }
    finally { setSaving(false); }
  };

  const handleSetupLedger = async () => {
    if (!form.classId || !form.baseAmount) return toast.error('Select class and enter amount');
    setSaving(true);
    try {
      await feeAPI.setupLedger({ classId: form.classId, totalFees: parseFloat(form.baseAmount) });
      toast.success('Class ledger setup done');
    } catch (err) { toast.error(err.response?.data?.message || 'Setup failed'); }
    finally { setSaving(false); }
  };

  const INPUT = { width:'100%', padding:'8px 10px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box' };
  const fa = finalAmount();

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">📋 Assign Fees</h2>
          <p className="text-sm text-muted">Assign fee types to classes or individual students</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'380px 1fr', gap:20 }}>
        {/* ── Left: Assignment form ── */}
        <div>
          <div className="card" style={{ padding:20 }}>
            <div style={{ fontSize:14, fontWeight:800, marginBottom:16 }}>New Fee Assignment</div>

            {/* Assign to */}
            <div style={{ display:'flex', gap:6, marginBottom:14, background:'#F3F4F6', padding:4, borderRadius:8 }}>
              {['class','student'].map(opt => (
                <button key={opt} onClick={() => set('assignTo',opt)} style={{
                  flex:1, padding:'6px 0', borderRadius:6, fontSize:12, fontWeight:700, border:'none', cursor:'pointer',
                  background: form.assignTo===opt ? '#1D4ED8' : 'transparent',
                  color:      form.assignTo===opt ? '#fff' : '#6B7280',
                }}>
                  {opt==='class' ? '🏛 Entire Class' : '👤 Single Student'}
                </button>
              ))}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {/* Class select */}
              <div>
                <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:4 }}>Class *</label>
                <select value={form.classId} onChange={e => set('classId',e.target.value)} style={INPUT}>
                  <option value="">— Select Class —</option>
                  {classes.map(c => <option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
                </select>
              </div>

              {/* Student select (when single) */}
              {form.assignTo === 'student' && (
                <div>
                  <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:4 }}>Student *</label>
                  <select value={form.studentId} onChange={e => set('studentId',e.target.value)} style={INPUT}>
                    <option value="">— Select Student —</option>
                    {students.map(s => <option key={s._id} value={s._id}>{s.user?.name} (Roll {s.rollNumber||'—'})</option>)}
                  </select>
                </div>
              )}

              {/* Fee type */}
              <div>
                <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:4 }}>Fee Type *</label>
                <select value={form.feeTypeId} onChange={e => { set('feeTypeId',e.target.value); const ft=feeTypes.find(f=>f._id===e.target.value); if(ft?.defaultAmount) set('baseAmount',ft.defaultAmount); }} style={INPUT}>
                  <option value="">— Select Fee Type —</option>
                  {feeTypes.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                </select>
              </div>

              {/* Amount */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:4 }}>Base Amount (₹) *</label>
                  <input type="number" value={form.baseAmount} onChange={e => set('baseAmount',e.target.value)} placeholder="0" style={INPUT} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:4 }}>Due Date</label>
                  <input type="date" value={form.dueDate} onChange={e => set('dueDate',e.target.value)} style={INPUT} />
                </div>
              </div>

              {/* Discount */}
              <div style={{ background:'#FFF8F1', border:'1px solid #FED7AA', borderRadius:10, padding:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'#92400E', marginBottom:10 }}>🎓 Discount (Optional)</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div>
                    <label style={{ fontSize:10, fontWeight:700, display:'block', marginBottom:3 }}>Discount %</label>
                    <input type="number" min="0" max="100" value={form.discountPct} onChange={e => set('discountPct',e.target.value)} placeholder="0" style={{ ...INPUT, fontSize:12 }} />
                  </div>
                  <div>
                    <label style={{ fontSize:10, fontWeight:700, display:'block', marginBottom:3 }}>Flat Discount ₹</label>
                    <input type="number" value={form.discountAmt} onChange={e => set('discountAmt',e.target.value)} placeholder="0" style={{ ...INPUT, fontSize:12 }} />
                  </div>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={{ fontSize:10, fontWeight:700, display:'block', marginBottom:3 }}>Reason (Scholarship / Sibling / Waiver)</label>
                    <input value={form.discountReason} onChange={e => set('discountReason',e.target.value)} placeholder="Optional reason" style={{ ...INPUT, fontSize:12 }} />
                  </div>
                </div>
              </div>

              {/* Late fee */}
              <div>
                <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:4 }}>Late Fee per Day (₹)</label>
                <input type="number" value={form.lateFeePerDay} onChange={e => set('lateFeePerDay',e.target.value)} placeholder="e.g. 5" style={INPUT} />
              </div>

              {/* Installments */}
              <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:10, padding:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: form.hasInstallments ? 10 : 0 }}>
                  <input type="checkbox" checked={form.hasInstallments} onChange={e => set('hasInstallments',e.target.checked)} id="inst" />
                  <label htmlFor="inst" style={{ fontSize:12, fontWeight:700, color:'#0C4A6E' }}>📅 Split into Installments</label>
                </div>
                {form.hasInstallments && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, display:'block', marginBottom:3 }}>Number of Installments</label>
                      <input type="number" min="2" max="12" value={form.installmentCount} onChange={e => set('installmentCount',e.target.value)} style={{ ...INPUT, fontSize:12 }} />
                    </div>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, display:'block', marginBottom:3 }}>First Due Date</label>
                      <input type="date" value={form.firstDueDate} onChange={e => set('firstDueDate',e.target.value)} style={{ ...INPUT, fontSize:12 }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Final amount preview */}
              {form.baseAmount > 0 && (
                <div style={{ background: '#F0FDF4', border:'1.5px solid #22C55E', borderRadius:10, padding:12, textAlign:'center' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#166534', marginBottom:4 }}>FINAL AMOUNT</div>
                  <div style={{ fontSize:24, fontWeight:900, color:'#166534' }}>{fmt(fa)}</div>
                  {(parseFloat(form.discountPct)||parseFloat(form.discountAmt)) ? (
                    <div style={{ fontSize:11, color:'#16A34A', marginTop:2 }}>Saved: {fmt(parseFloat(form.baseAmount) - fa)}</div>
                  ) : null}
                </div>
              )}

              <button onClick={handleAssign} disabled={saving} className="btn-primary" style={{ marginTop:4 }}>
                {saving ? '⏳ Assigning…' : form.assignTo==='class' ? '📋 Assign to Entire Class' : '👤 Assign to Student'}
              </button>

              <button onClick={handleSetupLedger} disabled={saving || !form.classId || !form.baseAmount}
                style={{ padding:'9px 0', borderRadius:8, fontSize:12, fontWeight:700, background:'#F8FAFC', border:'1px solid #E5E7EB', cursor:'pointer', color:'#374151' }}>
                ⚙️ Setup Ledger for Class
              </button>
            </div>
          </div>
        </div>

        {/* ── Right: Existing assignments ── */}
        <div>
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>
              Recent Assignments {assignments.length > 0 && <span style={{ fontSize:12, color:'#6B7280', fontWeight:600 }}>({assignments.length})</span>}
            </div>
            {!assignments.length ? (
              <div style={{ padding:40, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
                Select a class or student to view assignments
              </div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#F8FAFC', borderBottom:'1px solid #E5E7EB' }}>
                      {['Student','Fee Type','Amount','Paid','Pending','Due','Status'].map(h => (
                        <th key={h} style={{ padding:'9px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a,i) => {
                      const statusColor = { paid:'#16A34A', partial:'#D97706', pending:'#6B7280', overdue:'#DC2626', waived:'#9333EA' }[a.status] || '#6B7280';
                      return (
                        <tr key={a._id} style={{ borderBottom:'1px solid #F3F4F6', background: i%2?'#FAFAFA':'#fff' }}>
                          <td style={{ padding:'9px 12px', fontWeight:600 }}>{a.student?.user?.name || a.class?.name || '—'}</td>
                          <td style={{ padding:'9px 12px', color:'#6B7280' }}>{a.feeType?.name}</td>
                          <td style={{ padding:'9px 12px' }}>{fmt(a.finalAmount)}</td>
                          <td style={{ padding:'9px 12px', color:'#16A34A', fontWeight:600 }}>{fmt(a.paidAmount)}</td>
                          <td style={{ padding:'9px 12px', color:'#DC2626', fontWeight:600 }}>{fmt(a.pendingAmount)}</td>
                          <td style={{ padding:'9px 12px', color:'#6B7280' }}>{a.dueDate ? new Date(a.dueDate).toLocaleDateString('en-IN') : '—'}</td>
                          <td style={{ padding:'9px 12px' }}>
                            <span style={{ fontSize:11, fontWeight:700, color:statusColor, background:`${statusColor}15`, padding:'2px 8px', borderRadius:10, textTransform:'capitalize' }}>{a.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}