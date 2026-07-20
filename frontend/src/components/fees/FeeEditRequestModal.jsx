// components/fees/FeeEditRequestModal.jsx
// Raises a change request against an already-recorded payment. Nothing is
// modified immediately — the request waits for a second administrator to
// approve it under Fees → Edit Approvals.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';

const INP = {
  width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:9,
  fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box',
};
const LBL = {
  display:'block', fontSize:10.5, fontWeight:700, color:'#6B7280',
  textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5,
};

export default function FeeEditRequestModal({ payment, onClose, onSubmitted }) {
  const [form, setForm] = useState({
    amount:        payment?.amount ?? '',
    method:        payment?.method || 'cash',
    paidOn:        payment?.paidOn ? String(payment.paidOn).slice(0,10) : '',
    transactionId: payment?.transactionId || '',
    remarks:       payment?.remarks || '',
  });
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  if (!payment) return null;
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!reason.trim()) return toast.error('Please give a reason for this change');
    setSaving(true);
    try {
      await feeAPI.requestPaymentEdit(payment.receiptNumber, { changes: form, reason });
      toast.success('Edit request sent for approval');
      onSubmitted?.();
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit request');
    } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.55)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:520,
          maxHeight:'calc(100vh - 40px)', display:'flex', flexDirection:'column',
          overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,0.35)' }}>

        <div style={{ padding:'16px 22px', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:'#111827' }}>✏️ Request Fee Edit</h3>
          <div style={{ fontSize:11.5, color:'#6B7280', marginTop:3, fontFamily:'monospace' }}>
            {payment.receiptNumber}
          </div>
        </div>

        <div style={{ padding:22, overflowY:'auto', flex:1, minHeight:0 }}>
          <div style={{ background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:9,
            padding:'9px 12px', fontSize:12, color:'#92400E', marginBottom:16 }}>
            This change will not apply until another administrator approves it.
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={LBL}>Amount (₹)</label>
              <input type="number" style={INP} value={form.amount}
                onChange={e => set('amount', e.target.value)} />
            </div>
            <div>
              <label style={LBL}>Payment method</label>
              <select style={INP} value={form.method} onChange={e => set('method', e.target.value)}>
                {['cash','online','cheque','bank','upi'].map(m =>
                  <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Paid on</label>
              <input type="date" style={INP} value={form.paidOn}
                onChange={e => set('paidOn', e.target.value)} />
            </div>
            <div>
              <label style={LBL}>Transaction ID</label>
              <input style={INP} value={form.transactionId}
                onChange={e => set('transactionId', e.target.value)} />
            </div>
            <div style={{ gridColumn:'1 / -1' }}>
              <label style={LBL}>Remarks</label>
              <input style={INP} value={form.remarks}
                onChange={e => set('remarks', e.target.value)} />
            </div>
            <div style={{ gridColumn:'1 / -1' }}>
              <label style={LBL}>Reason for change *</label>
              <textarea rows={2} style={{ ...INP, resize:'vertical', fontFamily:'inherit' }}
                value={reason} onChange={e => setReason(e.target.value)}
                placeholder="e.g. Amount entered incorrectly at the counter" />
            </div>
          </div>
        </div>

        <div style={{ padding:'13px 22px', borderTop:'1px solid #E5E7EB', display:'flex',
          justifyContent:'flex-end', gap:10, background:'#F9FAFB', flexShrink:0 }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding:'9px 18px', borderRadius:9, border:'1px solid #E5E7EB',
              background:'#fff', color:'#4B5563', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            style={{ padding:'9px 20px', borderRadius:9, border:'none',
              background:'#1D4ED8', color:'#fff', fontSize:13, fontWeight:700,
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
}
