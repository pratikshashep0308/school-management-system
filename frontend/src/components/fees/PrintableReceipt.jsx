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
  // Lock the page scroll while the modal is open so the user doesn't accidentally
  // scroll past the modal header and lose access to the Close button.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape key
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!receipt) return null;

  const handlePrint = () => {
    // Convert relative image paths to absolute so they resolve in the print window
    // (window.open('') has no base URL, so /school-logo.jpeg would otherwise 404).
    const baseUrl = window.location.origin;
    const content = document.getElementById('printable-receipt').innerHTML
      .replace(/src="\/(?!\/)/g, `src="${baseUrl}/`);
    const win = window.open('', '_blank', 'width=800,height=900');
    win.document.write(`
      <html><head><title>Fee Receipt – ${receipt.receiptNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #000; }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        td,th { border:1px solid #ccc; padding:7px 10px; }
        th { background:#f3f4f6; font-weight:700; }
        .receipt-actions { display: none !important; }
        @page { margin: 15mm; size: A4; }
        @media print { body { margin:0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>${content}</body></html>
    `);
    win.document.close();
    win.focus();
    // Wait for the logo to load before triggering print, otherwise it prints blank.
    setTimeout(() => { win.print(); win.close(); }, 800);
  };

  return (
    <div onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:9999,
        background:'rgba(0,0,0,0.7)',
        // Top-anchored (not centred): a centred modal taller than the viewport
        // splits its overflow top *and* bottom, pushing the header off-screen.
        display:'flex', alignItems:'flex-start', justifyContent:'center',
        padding:'16px', overflow:'hidden',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          position:'relative', background:'#fff', borderRadius:16,
          width:'100%', maxWidth:760,
          display:'flex', flexDirection:'column',
          boxShadow:'0 24px 80px rgba(0,0,0,0.5)',
          // Fill the available space between the padding; the body scrolls.
          height:'100%', maxHeight:'100%', minHeight:0, overflow:'hidden',
        }}>

        {/* Header stays pinned; only the receipt body below scrolls, so the
            Print/Close buttons can never scroll out of view. */}
        <div style={{ zIndex:6, background:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #E5E7EB', flexShrink:0, borderRadius:'16px 16px 0 0' }}>
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

        <div id="printable-receipt" style={{ padding:'24px', fontFamily:'Arial, sans-serif', overflowY:'auto', flex:1, minHeight:0 }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, marginBottom:8 }}>
            <img
              src={process.env.PUBLIC_URL + "/school-logo.jpeg"}
              alt="School logo"
              style={{ width:90, height:90, objectFit:'contain', flexShrink:0 }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#374151', letterSpacing:'0.05em' }}>K V P S SANSTHA BHALER</div>
              {/* Rainbow letter-by-letter "The Future Step School" — colors match SchoolName.jpeg.
                  Inlined here (instead of importing the React component) so it survives the
                  innerHTML copy-paste that handlePrint() does into the new print window. */}
              <div style={{ fontFamily:"'Georgia','Times New Roman',serif", fontStyle:'italic', fontWeight:900, fontSize:26, lineHeight:1.1, marginTop:4 }}>
                {(() => {
                  const COLORS = [
                    '#E53935','#F57C00','#43A047',null,
                    '#43A047','#1565C0','#7B1FA2','#E53935','#43A047','#0097A7',null,
                    '#43A047','#E53935','#7B1FA2','#F57C00',null,
                    '#43A047','#1565C0','#7B1FA2','#E53935','#F57C00','#1565C0',
                  ];
                  const NAME = 'The Future Step School';
                  return NAME.split('').map((ch, i) => {
                    if (ch === ' ') return <span key={i} style={{ display:'inline-block', width:8 }}>&nbsp;</span>;
                    return <span key={i} style={{ color: COLORS[i] }}>{ch}</span>;
                  });
                })()}
              </div>
              <div style={{ fontSize:12, color:'#6B7280', marginTop:4 }}>Securing Future By Adaptive Learning</div>
            </div>
          </div>
          <div style={{ textAlign:'center', marginBottom:16 }}>
            <div style={{ display:'inline-block', fontSize:14, fontWeight:700, color:'#D4522A', marginTop:6, borderBottom:'2px solid #D4522A', paddingBottom:6, paddingLeft:24, paddingRight:24 }}>Fees Paid Receipt</div>
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
                  <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', width:110 }}>Total</th>
                  <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', width:110, color:'#16A34A' }}>Paying Now</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item,i) => (
                  <tr key={i}>
                    <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB', textAlign:'center' }}>{i+1}</td>
                    <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB' }}>{(item.label||'').toUpperCase()}</td>
                    <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:600 }}>{fmt(item.perMonth)}</td>
                    <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#16A34A' }}>{fmt(item.payingNow)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'#F8FAFC' }}>
                  <td colSpan={2} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>SUBTOTAL</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>{fmt(receipt.subtotal)}</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB' }}></td>
                </tr>
                {receipt.discountAmt > 0 && (
                  <tr style={{ background:'#F0FDF4' }}>
                    <td colSpan={2} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#16A34A' }}>{receipt.periodLabel} Discount ({receipt.discountPct}%)</td>
                    <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#16A34A' }}>-{fmt(receipt.discountAmt)}</td>
                    <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB' }}></td>
                  </tr>
                )}
                <tr style={{ background:'#EFF6FF' }}>
                  <td colSpan={2} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#1E40AF' }}>TOTAL</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:900, fontSize:15, color:'#1E40AF' }}>{fmt(receipt.totalAmount)}</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB' }}></td>
                </tr>
                {(() => {
                  // Previously paid = ledger paid amount before this transaction.
                  // Backend snapshots this at payment time (paidBeforeThis); we fall back
                  // to a derived value for OLD receipts that don't have the snapshot.
                  const prevPaid = Number(receipt.paidBeforeThis) || 0;
                  if (prevPaid <= 0) return null;
                  return (
                    <tr>
                      <td colSpan={2} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#6B7280' }}>PREVIOUSLY PAID</td>
                      <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#6B7280' }}>-{fmt(prevPaid)}</td>
                      <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB' }}></td>
                    </tr>
                  );
                })()}
                <tr>
                  <td colSpan={3} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>THIS PAYMENT</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#16A34A' }}>{fmt(receipt.deposit)}</td>
                </tr>
                <tr style={{ background:receipt.balance>0?'#FEF2F2':'#F0FDF4' }}>
                  <td colSpan={2} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>DUE-ABLE BALANCE</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:900, fontSize:15, color:receipt.balance>0?'#DC2626':'#16A34A' }}>{fmt(receipt.balance)}</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB' }}></td>
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