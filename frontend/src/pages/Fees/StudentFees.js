// frontend/src/pages/Fees/StudentFees.js
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { LoadingState, EmptyState } from '../../components/ui';

const fmt = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0);
const METHODS = ['cash','upi','online','cheque','bank'];
const MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Payment modal ────────────────────────────────────────────────────────────
function PayModal({ student, onClose, onSuccess }) {
  const rec = student; // StudentFee record
  const now = new Date();
  const [form, setForm] = useState({
    amount:        '',
    method:        'cash',
    transactionId: '',
    month:         `${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    remarks:       '',
    totalFees:     rec?.totalFees || '',
  });
  const [saving, setSaving] = useState(false);
  const INPUT = { width:'100%', padding:'8px 10px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box' };

  const handlePay = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount');
    setSaving(true);
    try {
      const payload = {
        studentId: rec.student?._id || rec.student,
        amount:    parseFloat(form.amount),
        method:    form.method,
        transactionId: form.transactionId || undefined,
        month:     form.month,
        year:      now.getFullYear(),
        remarks:   form.remarks || undefined,
      };
      if (!rec._id) { payload.classId = rec.class?._id || rec.class; payload.totalFees = parseFloat(form.totalFees); }
      const r = await feeAPI.recordPayment(payload);
      toast.success('Payment recorded!');
      onSuccess(r.data.receiptNumber);
    } catch (err) { toast.error(err.response?.data?.message || 'Payment failed'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #E5E7EB', fontWeight:800, fontSize:15 }}>💳 Record Payment</div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:'#F0FDF4', border:'1px solid #22C55E', borderRadius:10, padding:12, display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:12, color:'#166534', fontWeight:700 }}>{rec.student?.user?.name || 'Student'}</span>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:10, color:'#6B7280' }}>Pending</div>
              <div style={{ fontSize:16, fontWeight:900, color:'#DC2626' }}>{fmt(rec.pendingAmount)}</div>
            </div>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:4 }}>Amount (₹) *</label>
            <input type="number" value={form.amount} onChange={e => setForm(p=>({...p,amount:e.target.value}))} placeholder={rec.pendingAmount||0} style={INPUT} autoFocus />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:4 }}>Method *</label>
              <select value={form.method} onChange={e => setForm(p=>({...p,method:e.target.value}))} style={INPUT}>
                {METHODS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:4 }}>Month</label>
              <input value={form.month} onChange={e => setForm(p=>({...p,month:e.target.value}))} style={INPUT} />
            </div>
          </div>
          {['upi','online','cheque','bank'].includes(form.method) && (
            <div>
              <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:4 }}>Transaction ID</label>
              <input value={form.transactionId} onChange={e => setForm(p=>({...p,transactionId:e.target.value}))} placeholder="Optional" style={INPUT} />
            </div>
          )}
          <div>
            <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:4 }}>Remarks</label>
            <input value={form.remarks} onChange={e => setForm(p=>({...p,remarks:e.target.value}))} placeholder="Optional" style={INPUT} />
          </div>
        </div>
        <div style={{ padding:'12px 20px', borderTop:'1px solid #E5E7EB', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 20px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontWeight:700 }}>Cancel</button>
          <button onClick={handlePay} disabled={saving} className="btn-primary">{saving?'⏳ Processing…':'✓ Record Payment'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Receipt viewer ────────────────────────────────────────────────────────────
function ReceiptViewer({ receiptNumber, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    feeAPI.getReceipt(receiptNumber).then(r=>setData(r.data.data)).catch(()=>toast.error('Receipt not found')).finally(()=>setLoading(false));
  }, [receiptNumber]);

  const handleDownloadPDF = () => {
    const token = localStorage.getItem('token');
    const url   = `${process.env.REACT_APP_API_URL||'http://localhost:5000/api'}/fees/receipt/${receiptNumber}/pdf`;
    fetch(url, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r=>r.blob()).then(blob=>{
        const link = document.createElement('a');
        link.href  = URL.createObjectURL(blob);
        link.download = `receipt-${receiptNumber}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
      }).catch(()=>toast.error('PDF download failed'));
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:460, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:15 }}>🧾 Fee Receipt</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#9CA3AF' }}>×</button>
        </div>
        {loading ? <div style={{ padding:40, textAlign:'center' }}>Loading…</div> : data && (
          <div style={{ padding:20 }}>
            {/* Receipt content */}
            <div style={{ background:'linear-gradient(135deg,#1E3A8A,#3949AB)', color:'#fff', borderRadius:12, padding:'18px 20px', marginBottom:16, textAlign:'center' }}>
              <div style={{ fontSize:15, fontWeight:900, marginBottom:2 }}>The Future Step School</div>
              <div style={{ fontSize:10, opacity:0.7, marginBottom:10 }}>K V P S Sanstha Bhaler, Nandurbar</div>
              <div style={{ fontSize:10, fontWeight:700, background:'rgba(255,255,255,0.15)', display:'inline-block', padding:'3px 12px', borderRadius:20 }}>{data.receiptNumber}</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
              {[
                ['Student', data.studentName], ['Class', data.className],
                ['Admission No', data.admissionNo], ['Date', data.paidOn ? new Date(data.paidOn).toLocaleDateString('en-IN') : '—'],
                ['Method', (data.method||'').toUpperCase()], ['Period', data.month||'—'],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'#F8FAFC', borderRadius:8, padding:'8px 10px' }}>
                  <div style={{ fontSize:9, color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>{k}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#111' }}>{v||'—'}</div>
                </div>
              ))}
            </div>
            {/* Amount */}
            <div style={{ background:'#F0FDF4', border:'1.5px solid #22C55E', borderRadius:12, padding:16, textAlign:'center', marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#166534', marginBottom:4 }}>AMOUNT PAID</div>
              <div style={{ fontSize:30, fontWeight:900, color:'#166534' }}>{fmt(data.amount)}</div>
            </div>
            {/* Summary */}
            <div style={{ background:'#F8FAFC', borderRadius:10, padding:'10px 14px', marginBottom:16 }}>
              {[['Total Fees', fmt(data.totalFees)], ['Total Paid', fmt(data.paidAmount)], ['Balance Due', fmt(data.pendingAmount)]].map(([k,v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #E5E7EB', fontSize:13 }}>
                  <span style={{ color:'#6B7280' }}>{k}</span>
                  <span style={{ fontWeight:800, color: k==='Balance Due' && data.pendingAmount>0 ? '#DC2626' : '#111' }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleDownloadPDF} style={{ flex:1, padding:'9px 0', borderRadius:8, fontSize:12, fontWeight:700, background:'#EFF6FF', border:'1.5px solid #3B82F6', color:'#1D4ED8', cursor:'pointer' }}>⬇ Download PDF</button>
              <button onClick={onClose} style={{ flex:1, padding:'9px 0', borderRadius:8, fontSize:12, fontWeight:700, background:'#F3F4F6', border:'1px solid #E5E7EB', cursor:'pointer', color:'#374151' }}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentFees() {
  const [records,       setRecords]       = useState([]);
  const [total,         setTotal]         = useState(0);
  const [loading,       setLoading]       = useState(false);
  const [payModal,      setPayModal]      = useState(null);   // StudentFee record
  const [receiptModal,  setReceiptModal]  = useState(null);   // receipt number
  const [searchQ,       setSearchQ]       = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [page,          setPage]          = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    feeAPI.getStudents({ status: statusFilter||undefined, page, limit:20 })
      .then(r => { setRecords(r.data.data||[]); setTotal(r.data.total||0); })
      .catch(()=>toast.error('Failed to load'))
      .finally(()=>setLoading(false));
  }, [statusFilter, page]);

  useEffect(load, [load]);

  const filtered = records.filter(r => !searchQ || r.student?.user?.name?.toLowerCase().includes(searchQ.toLowerCase()));

  const handleExport = () => {
    const token = localStorage.getItem('token');
    const url   = `${process.env.REACT_APP_API_URL||'http://localhost:5000/api'}/fees/export?format=xlsx${statusFilter?`&status=${statusFilter}`:''}`;
    fetch(url, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r=>r.blob()).then(blob=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fees-report.xlsx'; a.click(); });
  };

  const STATUS_COLOR = { paid:'#16A34A', partial:'#D97706', not_paid:'#DC2626' };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">👥 Student Fees</h2>
          <p className="text-sm text-muted">{total} students · click to pay or view receipt</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handleExport} style={{ padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, background:'#EFF6FF', border:'1.5px solid #3B82F6', color:'#1D4ED8', cursor:'pointer' }}>⬇ Excel</button>
          <button onClick={() => setPayModal({})} className="btn-primary">+ Record Payment</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <input placeholder="🔍 Search student…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} className="form-input" style={{ width:220 }} />
        <select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);}} className="form-input" style={{ width:'auto' }}>
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="not_paid">Unpaid</option>
        </select>
      </div>

      {loading ? <LoadingState /> : !filtered.length ? (
        <EmptyState icon="💳" title="No fee records" subtitle="Set up ledger first to create fee records" />
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#1E3A8A' }}>
                {['Student','Class','Total Fees','Paid','Pending','Status','Action'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec,i) => {
                const color = STATUS_COLOR[rec.paymentStatus] || '#6B7280';
                const pct   = rec.totalFees>0 ? Math.round((rec.paidAmount/rec.totalFees)*100) : 0;
                return (
                  <tr key={rec._id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ fontWeight:700 }}>{rec.student?.user?.name||'—'}</div>
                      <div style={{ fontSize:10, color:'#9CA3AF' }}>{rec.student?.admissionNumber}</div>
                    </td>
                    <td style={{ padding:'10px 14px', color:'#6B7280' }}>{rec.class?.name} {rec.class?.section||''}</td>
                    <td style={{ padding:'10px 14px', fontWeight:600 }}>{fmt(rec.totalFees)}</td>
                    <td style={{ padding:'10px 14px', color:'#16A34A', fontWeight:700 }}>{fmt(rec.paidAmount)}</td>
                    <td style={{ padding:'10px 14px', color:'#DC2626', fontWeight:700 }}>{fmt(rec.pendingAmount)}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <div>
                        <span style={{ fontSize:11, fontWeight:700, color, background:`${color}15`, padding:'2px 8px', borderRadius:10, textTransform:'capitalize' }}>
                          {rec.paymentStatus?.replace('_',' ')||'—'}
                        </span>
                        <div style={{ marginTop:5, height:4, background:'#E5E7EB', borderRadius:4, overflow:'hidden', width:80 }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:4 }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => setPayModal(rec)}
                          style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:700, background:'#EFF6FF', border:'1px solid #3B82F6', color:'#1D4ED8', cursor:'pointer' }}>
                          💳 Pay
                        </button>
                        {rec.paymentHistory?.length > 0 && (
                          <button onClick={() => setReceiptModal(rec.paymentHistory.slice(-1)[0]?.receiptNumber)}
                            style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:700, background:'#F0FDF4', border:'1px solid #22C55E', color:'#166534', cursor:'pointer' }}>
                            🧾
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Pagination */}
          {total > 20 && (
            <div style={{ padding:'10px 16px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, opacity:page===1?0.4:1 }}>← Prev</button>
              <span style={{ fontSize:12, color:'#6B7280', padding:'5px 0' }}>Page {page}</span>
              <button onClick={() => setPage(p=>p+1)} disabled={records.length<20} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, opacity:records.length<20?0.4:1 }}>Next →</button>
            </div>
          )}
        </div>
      )}

      {payModal    && <PayModal student={payModal} onClose={()=>setPayModal(null)} onSuccess={rn=>{ setPayModal(null); load(); setReceiptModal(rn); }} />}
      {receiptModal && <ReceiptViewer receiptNumber={receiptModal} onClose={()=>setReceiptModal(null)} />}
    </div>
  );
}