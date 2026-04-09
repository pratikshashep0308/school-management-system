// frontend/src/pages/Fees/FeeRecords.js
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI } from '../../utils/api';
import { LoadingState, EmptyState, Modal } from '../../components/ui';

const fmt = n => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n||0);
const METHODS = ['cash','upi','bank','cheque','online'];

function StatusBadge({ status }) {
  const m = { paid:{bg:'#F0FDF4',color:'#16A34A',label:'✅ Paid'}, partial:{bg:'#FFF7ED',color:'#EA580C',label:'🔵 Partial'}, not_paid:{bg:'#FEF2F2',color:'#DC2626',label:'⏳ Unpaid'} };
  const s = m[status]||m.not_paid;
  return <span style={{ fontSize:11, fontWeight:700, color:s.color, background:s.bg, padding:'3px 10px', borderRadius:20 }}>{s.label}</span>;
}

function PayModal({ record, onClose, onSuccess }) {
  const now = new Date();
  const [form, setForm] = useState({ amount:'', method:'cash', transactionId:'', month:`${now.toLocaleString('default',{month:'long'})} ${now.getFullYear()}`, remarks:'' });
  const [saving, setSaving] = useState(false);
  const INP = { width:'100%', padding:'9px 12px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none' };

  const handlePay = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount');
    setSaving(true);
    try {
      await feeAPI.recordPayment({
        studentId:     record.student?._id || record.student,
        amount:        parseFloat(form.amount),
        method:        form.method,
        transactionId: form.transactionId || undefined,
        month:         form.month,
        year:          now.getFullYear(),
        remarks:       form.remarks || undefined,
        classId:       record.class?._id || record.class,
        totalFees:     record.totalFees,
      });
      toast.success('Payment recorded!');
      onSuccess();
      onClose();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const pending = record.pendingAmount || 0;

  return (
    <Modal isOpen onClose={onClose} title={`💳 Record Payment`} size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={handlePay} disabled={saving} className="btn-primary" style={{ background:'#1D4ED8', borderColor:'#1D4ED8' }}>
          {saving ? '⏳ Saving…' : '✓ Record Payment'}
        </button>
      </>}
    >
      <div style={{ marginBottom:16, padding:'12px 14px', background:'#F0F9FF', borderRadius:10, border:'1px solid #BAE6FD' }}>
        <div style={{ fontWeight:700, fontSize:14 }}>{record.student?.user?.name}</div>
        <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>{record.class?.name} {record.class?.section||''} · Pending: <strong style={{color:'#DC2626'}}>{fmt(pending)}</strong></div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' }}>Amount (₹) *</label>
          <input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder={`Max: ₹${pending.toLocaleString('en-IN')}`} style={INP} />
          <div style={{ display:'flex', gap:6, marginTop:6 }}>
            {[pending, Math.round(pending/2), 5000, 10000].filter(v=>v>0).slice(0,4).map(v => (
              <button key={v} onClick={() => set('amount', v)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'1px solid #E5E7EB', background:'#F9FAFB', cursor:'pointer', fontWeight:600 }}>
                ₹{v.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' }}>Payment Method</label>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {METHODS.map(m => (
              <button key={m} onClick={() => set('method',m)} style={{
                padding:'6px 14px', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer',
                border:`1.5px solid ${form.method===m?'#1D4ED8':'#E5E7EB'}`,
                background: form.method===m?'#EFF6FF':'#fff',
                color: form.method===m?'#1D4ED8':'#6B7280',
              }}>{m.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' }}>Month</label>
          <input value={form.month} onChange={e=>set('month',e.target.value)} style={INP} />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' }}>Transaction ID / Ref</label>
          <input value={form.transactionId} onChange={e=>set('transactionId',e.target.value)} placeholder="Optional" style={INP} />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' }}>Remarks</label>
          <input value={form.remarks} onChange={e=>set('remarks',e.target.value)} placeholder="Optional" style={INP} />
        </div>
      </div>
    </Modal>
  );
}

function HistoryModal({ record, onClose }) {
  const [downloading, setDownloading] = useState('');
  const payments = record?.paymentHistory || [];

  const downloadReceipt = async (rno) => {
    setDownloading(rno);
    try {
      const token = localStorage.getItem('token');
      const base  = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
      const res   = await fetch(`${base}/fees/receipt/${rno}/pdf`, { headers:{ Authorization:`Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `receipt-${rno}.pdf`; a.click();
      toast.success('Receipt downloaded');
    } catch { toast.error('Receipt not available'); }
    finally { setDownloading(''); }
  };

  return (
    <Modal isOpen onClose={onClose} title={`📜 Payment History — ${record?.student?.user?.name}`} size="lg"
      footer={<button onClick={onClose} className="btn-secondary">Close</button>}
    >
      {!payments.length ? (
        <div style={{ textAlign:'center', padding:24, color:'#9CA3AF' }}>No payments recorded yet</div>
      ) : (
        <div>
          <div style={{ display:'flex', gap:16, marginBottom:16, padding:'12px 14px', background:'#F0FDF4', borderRadius:10, border:'1px solid #BBF7D0' }}>
            <div><div style={{fontSize:10,color:'#16A34A',fontWeight:700,textTransform:'uppercase'}}>Total Paid</div><div style={{fontSize:18,fontWeight:900,color:'#15803D'}}>{fmt(record.paidAmount)}</div></div>
            <div><div style={{fontSize:10,color:'#6B7280',fontWeight:700,textTransform:'uppercase'}}>Remaining</div><div style={{fontSize:18,fontWeight:900,color:'#DC2626'}}>{fmt(record.pendingAmount)}</div></div>
            <div><div style={{fontSize:10,color:'#6B7280',fontWeight:700,textTransform:'uppercase'}}>Transactions</div><div style={{fontSize:18,fontWeight:900,color:'#374151'}}>{payments.length}</div></div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['#','Date','Month','Method','Amount','Receipt'].map(h=>(
                    <th key={h} style={{ padding:'9px 12px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...payments].reverse().map((p,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                    <td style={{ padding:'9px 12px', color:'#9CA3AF' }}>{payments.length-i}</td>
                    <td style={{ padding:'9px 12px', whiteSpace:'nowrap', color:'#374151' }}>{new Date(p.paidOn).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</td>
                    <td style={{ padding:'9px 12px', fontWeight:600 }}>{p.month||'—'}</td>
                    <td style={{ padding:'9px 12px' }}><span style={{ fontSize:11, fontWeight:700, color:'#7C3AED', background:'#F5F3FF', padding:'2px 8px', borderRadius:10 }}>{p.method}</span></td>
                    <td style={{ padding:'9px 12px', fontWeight:800, color:'#16A34A' }}>{fmt(p.amount)}</td>
                    <td style={{ padding:'9px 12px' }}>
                      {p.receiptNumber ? (
                        <button onClick={()=>downloadReceipt(p.receiptNumber)} disabled={downloading===p.receiptNumber}
                          style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'4px 9px', borderRadius:6, cursor:'pointer' }}>
                          {downloading===p.receiptNumber?'⏳':'⬇'} PDF
                        </button>
                      ) : <span style={{color:'#D1D5DB'}}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function FeeRecords() {
  const [records,  setRecords]  = useState([]);
  const [classes,  setClasses]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [classId,  setClassId]  = useState('');
  const [status,   setStatus]   = useState('');
  const [search,   setSearch]   = useState('');
  const [payRec,   setPayRec]   = useState(null);
  const [histRec,  setHistRec]  = useState(null);
  const [page,     setPage]     = useState(1);
  const PER = 20;

  useEffect(() => {
    classAPI.getAll().then(r => setClasses(r.data.data || [])).catch(()=>{});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    feeAPI.getStudents({ classId: classId||undefined, status: status||undefined, limit:200 })
      .then(r => { setRecords(r.data.data || []); setPage(1); })
      .catch(()=>toast.error('Failed to load'))
      .finally(()=>setLoading(false));
  }, [classId, status]);

  useEffect(() => { load(); }, [load]);

  const filtered = records.filter(r => !search || r.student?.user?.name?.toLowerCase().includes(search.toLowerCase()) || r.student?.admissionNumber?.includes(search));
  const paged    = filtered.slice((page-1)*PER, page*PER);
  const pages    = Math.ceil(filtered.length / PER);

  const INP = { padding:'8px 11px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  const totalCollected = filtered.reduce((s,r)=>s+(r.paidAmount||0), 0);
  const totalPending   = filtered.reduce((s,r)=>s+(r.pendingAmount||0), 0);

  return (
    <div>
      <div className="page-header" style={{ flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">👥 Student Fee Records</h2>
          <p className="text-sm text-muted">{filtered.length} students · Collected: <strong style={{color:'#16A34A'}}>{fmt(totalCollected)}</strong> · Pending: <strong style={{color:'#DC2626'}}>{fmt(totalPending)}</strong></p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        <input placeholder="🔍 Search student or admission no…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} style={{ ...INP, width:240 }} />
        <select value={classId} onChange={e=>setClassId(e.target.value)} style={INP}>
          <option value="">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <select value={status} onChange={e=>setStatus(e.target.value)} style={INP}>
          <option value="">All Status</option>
          <option value="paid">✅ Paid</option>
          <option value="partial">🔵 Partial</option>
          <option value="not_paid">⏳ Unpaid</option>
        </select>
        <button onClick={load} style={{ ...INP, background:'#1D4ED8', color:'#fff', fontWeight:700, cursor:'pointer', border:'none' }}>Refresh</button>
      </div>

      {loading ? <LoadingState /> : !paged.length ? (
        <EmptyState icon="👥" title="No records found" subtitle="Try adjusting the filters" />
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['Student','Class','Total Fees','Paid','Pending','Status','Actions'].map(h=>(
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r,i)=>(
                  <tr key={r._id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ fontWeight:700 }}>{r.student?.user?.name||'—'}</div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>{r.student?.admissionNumber||'—'}</div>
                    </td>
                    <td style={{ padding:'10px 14px', color:'#6B7280' }}>{r.class?.name} {r.class?.section||''}</td>
                    <td style={{ padding:'10px 14px', fontWeight:600 }}>{fmt(r.totalFees)}</td>
                    <td style={{ padding:'10px 14px', fontWeight:700, color:'#16A34A' }}>{fmt(r.paidAmount)}</td>
                    <td style={{ padding:'10px 14px', fontWeight:700, color: r.pendingAmount>0?'#DC2626':'#16A34A' }}>{fmt(r.pendingAmount)}</td>
                    <td style={{ padding:'10px 14px' }}><StatusBadge status={r.paymentStatus} /></td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        {r.pendingAmount > 0 && (
                          <button onClick={()=>setPayRec(r)} style={{ fontSize:11, fontWeight:700, color:'#fff', background:'#1D4ED8', border:'none', padding:'5px 10px', borderRadius:6, cursor:'pointer', whiteSpace:'nowrap' }}>
                            💳 Pay
                          </button>
                        )}
                        <button onClick={()=>setHistRec(r)} style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'5px 10px', borderRadius:6, cursor:'pointer', whiteSpace:'nowrap' }}>
                          📜 History
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages>1&&(
            <div style={{ display:'flex', justifyContent:'center', gap:6, padding:'12px', borderTop:'1px solid #E5E7EB' }}>
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)} style={{ padding:'5px 12px', borderRadius:7, border:'1px solid #E5E7EB', cursor:page===1?'not-allowed':'pointer', background:'#fff', fontSize:12, opacity:page===1?0.5:1 }}>← Prev</button>
              <span style={{ padding:'5px 10px', fontSize:12, color:'#6B7280' }}>Page {page}/{pages}</span>
              <button disabled={page===pages} onClick={()=>setPage(p=>p+1)} style={{ padding:'5px 12px', borderRadius:7, border:'1px solid #E5E7EB', cursor:page===pages?'not-allowed':'pointer', background:'#fff', fontSize:12, opacity:page===pages?0.5:1 }}>Next →</button>
            </div>
          )}
        </div>
      )}

      {payRec  && <PayModal     record={payRec}  onClose={()=>setPayRec(null)}  onSuccess={load} />}
      {histRec && <HistoryModal record={histRec} onClose={()=>setHistRec(null)} />}
    </div>
  );
}