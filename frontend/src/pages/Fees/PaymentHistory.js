// frontend/src/pages/Fees/PaymentHistory.js
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';

const fmt = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0);

export default function PaymentHistory() {
  const [records,    setRecords]    = useState([]);
  const [classes,    setClasses]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [classId,    setClassId]    = useState('');
  const [statusF,    setStatusF]    = useState('');
  const [searchQ,    setSearchQ]    = useState('');
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    classAPI.getAll().then(r => setClasses(r.data.data||[]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    feeAPI.getStudents({ classId: classId||undefined, status: statusF||undefined, limit:100 })
      .then(r => setRecords(r.data.data||[]))
      .catch(()=>toast.error('Failed to load'))
      .finally(()=>setLoading(false));
  }, [classId, statusF]);

  useEffect(load, [load]);

  // Flatten all payment history across all students
  const allPayments = records.flatMap(rec =>
    (rec.paymentHistory||[]).map(p => ({
      ...p,
      studentName:   rec.student?.user?.name || '—',
      admissionNo:   rec.student?.admissionNumber || '—',
      className:     rec.class ? `${rec.class.name} ${rec.class.section||''}` : '—',
      totalFees:     rec.totalFees,
      pendingAmount: rec.pendingAmount,
    }))
  ).sort((a,b) => new Date(b.paidOn) - new Date(a.paidOn));

  const filtered = allPayments.filter(p =>
    !searchQ || p.studentName.toLowerCase().includes(searchQ.toLowerCase()) || p.receiptNumber?.includes(searchQ)
  );

  const handleDownloadReceipt = async (receiptNumber) => {
    setDownloading(receiptNumber);
    try {
      const token = localStorage.getItem('token');
      const url   = `${process.env.REACT_APP_API_URL||'http://localhost:5000/api'}/fees/receipt/${receiptNumber}/pdf`;
      const r     = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } });
      const blob  = await r.blob();
      const link  = document.createElement('a');
      link.href   = URL.createObjectURL(blob);
      link.download = `receipt-${receiptNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('Receipt downloaded');
    } catch { toast.error('Download failed'); }
    finally { setDownloading(''); }
  };

  const handleExport = () => {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams({ format:'xlsx', ...(classId&&{classId}), ...(statusF&&{status:statusF}) });
    fetch(`${process.env.REACT_APP_API_URL||'http://localhost:5000/api'}/fees/export?${params}`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r=>r.blob()).then(blob=>{
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
        a.download=`payment-history-${Date.now()}.xlsx`; a.click();
      });
  };

  const totalCollected = filtered.reduce((s,p)=>s+(p.amount||0),0);
  const METHOD_ICON    = { cash:'💵', upi:'📱', online:'🌐', cheque:'📝', bank:'🏦' };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">📜 Payment History</h2>
          <p className="text-sm text-muted">{filtered.length} transactions · {fmt(totalCollected)} collected</p>
        </div>
        <button onClick={handleExport} style={{ padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, background:'#EFF6FF', border:'1.5px solid #3B82F6', color:'#1D4ED8', cursor:'pointer' }}>
          ⬇ Export Excel
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <input placeholder="🔍 Search student or receipt…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} className="form-input" style={{ width:240 }} />
        <select value={classId} onChange={e=>setClassId(e.target.value)} className="form-input" style={{ width:'auto' }}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <select value={statusF} onChange={e=>setStatusF(e.target.value)} className="form-input" style={{ width:'auto' }}>
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="not_paid">Unpaid</option>
        </select>
      </div>

      {/* Summary pills */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        {[
          { label:'Total Transactions', val:filtered.length,         color:'#1D4ED8', bg:'#EFF6FF' },
          { label:'Cash',      val:fmt(filtered.filter(p=>p.method==='cash').reduce((s,p)=>s+p.amount,0)),   color:'#16A34A', bg:'#F0FDF4' },
          { label:'UPI',       val:fmt(filtered.filter(p=>p.method==='upi').reduce((s,p)=>s+p.amount,0)),    color:'#7C3AED', bg:'#F5F3FF' },
          { label:'Online',    val:fmt(filtered.filter(p=>p.method==='online').reduce((s,p)=>s+p.amount,0)), color:'#0284C7', bg:'#F0F9FF' },
        ].map(p => (
          <div key={p.label} style={{ padding:'8px 16px', borderRadius:20, background:p.bg, border:`1.5px solid ${p.color}30` }}>
            <span style={{ fontSize:15, fontWeight:800, color:p.color, marginRight:6 }}>{p.val}</span>
            <span style={{ fontSize:11, color:'#6B7280', fontWeight:600 }}>{p.label}</span>
          </div>
        ))}
      </div>

      {loading ? <LoadingState /> : !filtered.length ? (
        <EmptyState icon="📜" title="No payment records" subtitle="Payments will appear here after they are recorded" />
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#1E3A8A' }}>
                {['Receipt','Student','Class','Amount','Method','Date','Receipt'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p,i) => (
                <tr key={`${p.receiptNumber}-${i}`} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                  <td style={{ padding:'9px 14px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', fontFamily:'monospace' }}>{p.receiptNumber}</div>
                  </td>
                  <td style={{ padding:'9px 14px' }}>
                    <div style={{ fontWeight:600 }}>{p.studentName}</div>
                    <div style={{ fontSize:10, color:'#9CA3AF' }}>{p.admissionNo}</div>
                  </td>
                  <td style={{ padding:'9px 14px', color:'#6B7280' }}>{p.className}</td>
                  <td style={{ padding:'9px 14px', fontWeight:800, color:'#16A34A' }}>{fmt(p.amount)}</td>
                  <td style={{ padding:'9px 14px' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, color:'#374151' }}>
                      {METHOD_ICON[p.method]||'💳'} {(p.method||'').toUpperCase()}
                    </span>
                    {p.transactionId && <div style={{ fontSize:9, color:'#9CA3AF', marginTop:2 }}>{p.transactionId}</div>}
                  </td>
                  <td style={{ padding:'9px 14px', color:'#6B7280' }}>
                    <div>{p.paidOn ? new Date(p.paidOn).toLocaleDateString('en-IN') : '—'}</div>
                    {p.month && <div style={{ fontSize:10, color:'#9CA3AF' }}>{p.month}</div>}
                  </td>
                  <td style={{ padding:'9px 14px' }}>
                    <button onClick={() => handleDownloadReceipt(p.receiptNumber)} disabled={downloading===p.receiptNumber}
                      style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:700, background:'#F0FDF4', border:'1px solid #22C55E', color:'#166534', cursor:'pointer', opacity:downloading===p.receiptNumber?0.5:1 }}>
                      {downloading===p.receiptNumber ? '⏳' : '⬇ PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}