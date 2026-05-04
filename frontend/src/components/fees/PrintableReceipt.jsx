// frontend/src/components/fees/PrintableReceipt.jsx
// Shared "image-2 style" fee receipt. Used by:
//   1. CollectFees — shows immediately after a payment is recorded
//   2. FeesPaidSlip — opens when admin clicks "View" on a past payment row
//
// Props:
//   receipt   = receipt-data object (see backend getReceipt response shape)
//   onClose   = callback to close the modal
//   history   = optional array of all past payments (rendered as ledger below the receipt)

import React from 'react';

const fmt = n => `₹${(Number(n)||0).toLocaleString('en-IN')}`;

export default function PrintableReceipt({ receipt, onClose, history = [] }) {
  if (!receipt) return null;

  const handlePrint = () => {
    const content = document.getElementById('printable-receipt').innerHTML;
    const win = window.open('', '_blank', 'width=800,height=900');
    win.document.write(`
      <html><head><title>Fee Receipt – ${receipt.receiptNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #000; }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        td,th { border:1px solid #ccc; padding:7px 10px; }
        th { background:#f3f4f6; font-weight:700; }
        @page { margin: 15mm; size: A4; }
        @media print { body { margin:0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>${content}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:700, maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
          <div>
            <h3 style={{ fontSize:17, fontWeight:700, margin:0, color:'#16A34A' }}>✅ Receipt</h3>
            <div style={{ fontSize:12, color:'#16A34A', marginTop:2 }}>
              {receipt.periodLabel ? `${receipt.periodLabel} · ` : ''}
              {receipt.periodCovered ? `${receipt.periodCovered} · ` : ''}
              #{receipt.receiptNumber}
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handlePrint}
              style={{ padding:'7px 16px', borderRadius:8, fontSize:13, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>🖨 Print</button>
            <button onClick={onClose}
              style={{ padding:'7px 16px', borderRadius:8, fontSize:13, fontWeight:700, background:'#F3F4F6', border:'none', cursor:'pointer' }}>Close</button>
          </div>
        </div>

        <div id="printable-receipt" style={{ overflowY:'auto', flex:1, padding:'24px', fontFamily:'Arial, sans-serif' }}>
          <div style={{ textAlign:'center', marginBottom:16 }}>
            <div style={{ fontSize:20, fontWeight:900, color:'#0B1F4A' }}>The Future Step School</div>
            <div style={{ fontSize:12, color:'#6B7280' }}>Securing Future By Adaptive Learning</div>
            <div style={{ fontSize:14, fontWeight:700, color:'#D4522A', marginTop:10, borderBottom:'2px solid #D4522A', paddingBottom:6 }}>Fees Paid Receipt</div>
          </div>

          {receipt.periodMonths > 1 && (
            <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color:'#1E40AF', fontWeight:600 }}>
              {receipt.periodLabel} — covers {receipt.periodMonths} months ({receipt.periodCovered}){receipt.discountPct > 0 ? ` · ${receipt.discountPct}% discount applied` : ''}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16, background:'#F8FAFC', borderRadius:10, padding:'12px 16px' }}>
            {[
              { label:'Registration No',   value:receipt.rollNumber || receipt.admissionNo },
              { label:'Serial No',         value:receipt.receiptNumber },
              { label:'Total Amount',      value:fmt(receipt.totalAmount), color:'#0B1F4A' },
              { label:'Your Amount',       value:fmt(receipt.deposit),     color:'#16A34A' },
              { label:'Student Name',      value:receipt.studentName },
              { label:'Date',              value:receipt.date },
              { label:'Deposit Amount',    value:fmt(receipt.deposit),     color:'#16A34A' },
              { label:'Balance',           value:fmt(receipt.balance),     color:receipt.balance>0?'#DC2626':'#16A34A' },
              { label:'Guardian Name',     value:receipt.parentName },
              { label:'Period',            value:receipt.periodLabel },
              { label:'Months Covered',    value:receipt.periodCovered },
              { label:'Class',             value:receipt.className },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:600 }}>{f.label}</div>
                <div style={{ fontSize:13, fontWeight:700, color:f.color||'#111827', marginTop:2 }}>{f.value || '—'}</div>
              </div>
            ))}
          </div>

          {receipt.items?.length > 0 && (
            <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:14, fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F3F4F6' }}>
                  <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, border:'1px solid #E5E7EB', width:40 }}>Sr.</th>
                  <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, border:'1px solid #E5E7EB' }}>Particulars</th>
                  <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', width:100 }}>Per Month</th>
                  <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', width:110 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item,i) => (
                  <tr key={i}>
                    <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB', textAlign:'center' }}>{i+1}</td>
                    <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB' }}>{(item.label||'').toUpperCase()}{receipt.periodMonths>1?` × ${receipt.periodMonths}`:''}</td>
                    <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB', textAlign:'right', color:'#6B7280' }}>{fmt(item.perMonth)}</td>
                    <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:600 }}>{fmt(item.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'#F8FAFC' }}>
                  <td colSpan={3} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>SUBTOTAL</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>{fmt(receipt.subtotal)}</td>
                </tr>
                {receipt.discountAmt > 0 && (
                  <tr style={{ background:'#F0FDF4' }}>
                    <td colSpan={3} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#16A34A' }}>{receipt.periodLabel} Discount ({receipt.discountPct}%)</td>
                    <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#16A34A' }}>-{fmt(receipt.discountAmt)}</td>
                  </tr>
                )}
                <tr style={{ background:'#EFF6FF' }}>
                  <td colSpan={3} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#1E40AF' }}>TOTAL</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:900, fontSize:15, color:'#1E40AF' }}>{fmt(receipt.totalAmount)}</td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>DEPOSIT</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#16A34A' }}>{fmt(receipt.deposit)}</td>
                </tr>
                <tr style={{ background:receipt.balance>0?'#FEF2F2':'#F0FDF4' }}>
                  <td colSpan={3} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>DUE-ABLE BALANCE</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:900, fontSize:15, color:receipt.balance>0?'#DC2626':'#16A34A' }}>{fmt(receipt.balance)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          {/* Fallback for OLD receipts that have no items breakdown stored */}
          {(!receipt.items || receipt.items.length === 0) && (
            <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:14, fontSize:13 }}>
              <tbody>
                <tr style={{ background:'#EFF6FF' }}>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', fontWeight:700, color:'#1E40AF' }}>AMOUNT PAID</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:900, fontSize:15, color:'#1E40AF' }}>{fmt(receipt.deposit)}</td>
                </tr>
                <tr>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', fontWeight:700 }}>METHOD</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right' }}>{(receipt.method||'cash').toUpperCase()}</td>
                </tr>
                {receipt.transactionId && (
                  <tr>
                    <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', fontWeight:700 }}>TRANSACTION ID</td>
                    <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontFamily:'monospace' }}>{receipt.transactionId}</td>
                  </tr>
                )}
                <tr style={{ background:receipt.balance>0?'#FEF2F2':'#F0FDF4' }}>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', fontWeight:700 }}>BALANCE</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:receipt.balance>0?'#DC2626':'#16A34A' }}>{fmt(receipt.balance)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {history.length > 0 && (
            <>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'#0B1F4A' }}>
                Fee Submission Statement Of <span style={{ color:'#D4522A' }}>{receipt.studentName}</span>
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:16 }}>
                <thead>
                  <tr style={{ background:'#F3F4F6' }}>
                    {['Sr#','Date','Period','Total','Deposit','Due'].map(h => (
                      <th key={h} style={{ padding:'7px 10px', border:'1px solid #E5E7EB', fontWeight:700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h,i) => (
                    <tr key={i}>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB', textAlign:'center' }}>{i+1}</td>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB' }}>{h.date}</td>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB' }}>{h.period}</td>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB', textAlign:'right' }}>{fmt(h.total)}</td>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB', textAlign:'right', color:'#16A34A' }}>{fmt(h.deposit)}</td>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB', textAlign:'right', color:'#DC2626' }}>{fmt(h.due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:20, paddingTop:14, borderTop:'1px solid #E5E7EB', fontSize:12 }}>
            <div><div style={{ marginBottom:20 }}>Prepared By:</div><div style={{ color:'#1D4ED8', fontWeight:600 }}>The Future Step School</div></div>
            <div style={{ textAlign:'center' }}><div style={{ marginBottom:20 }}>Checked By:</div><div style={{ borderBottom:'1px solid #374151', minWidth:160 }}>&nbsp;</div></div>
            <div style={{ textAlign:'right' }}><div style={{ fontWeight:700 }}>Accounts Department</div><div style={{ color:'#6B7280' }}>The Future Step School</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}