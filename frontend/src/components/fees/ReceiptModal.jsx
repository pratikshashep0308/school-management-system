// frontend/src/components/fees/ReceiptModal.jsx
// Uses browser's native print/PDF via a styled print layout.
// No external PDF library needed — works offline, zero dependencies.
import React, { useState, useEffect, useRef } from 'react';
import feeAPI from '../../utils/feeAPI';

export default function ReceiptModal({ receiptNumber, onClose }) {
  const [data, setData]   = useState(null);
  const [loading, setLoad] = useState(true);
  const [error, setErr]    = useState('');
  const printRef           = useRef(null);

  useEffect(() => {
    feeAPI.getReceipt(receiptNumber)
      .then(r => setData(r.data.data))
      .catch(e => setErr(e.response?.data?.message || 'Receipt not found'))
      .finally(() => setLoad(false));
  }, [receiptNumber]);

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=700,height=900');
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fee Receipt – ${receiptNumber}</title>
          <meta charset="UTF-8"/>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Inter', sans-serif; background: #fff; color: #1e293b; }
            .receipt { max-width: 600px; margin: 40px auto; border: 2px solid #e2e8f0; border-radius: 16px; overflow: hidden; }
            .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 28px 32px; }
            .header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
            .header p { font-size: 13px; opacity: 0.8; margin-top: 4px; }
            .receipt-num { background: rgba(255,255,255,0.15); display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 12px; letter-spacing: 0.5px; }
            .body { padding: 28px 32px; }
            .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #f1f5f9; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
            .field label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
            .field p { font-size: 14px; font-weight: 500; color: #1e293b; margin-top: 3px; }
            .amount-box { background: linear-gradient(135deg, #ecfdf5, #d1fae5); border: 1.5px solid #6ee7b7; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; text-align: center; }
            .amount-box .label { font-size: 12px; font-weight: 600; color: #059669; text-transform: uppercase; letter-spacing: 1px; }
            .amount-box .value { font-size: 36px; font-weight: 800; color: #047857; margin-top: 4px; }
            .summary { background: #f8fafc; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; }
            .summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
            .summary-row:not(:last-child) { border-bottom: 1px solid #e2e8f0; }
            .summary-row .key { color: #64748b; }
            .summary-row .val { font-weight: 600; color: #1e293b; }
            .summary-row.pending .val { color: #dc2626; }
            .footer { background: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
            .footer .note { font-size: 11px; color: #94a3b8; }
            .stamp { width: 80px; height: 80px; border: 2px solid #6ee7b7; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #059669; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">Fee Receipt</h2>
          <div className="flex gap-2">
            {data && (
              <button
                onClick={handlePrint}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2"
              >
                <span>⬇</span> Download PDF
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading && <div className="py-12 text-center text-slate-400">Loading receipt...</div>}
          {error   && <div className="py-12 text-center text-red-400">{error}</div>}
          {data    && (
            <div ref={printRef}>
              <ReceiptTemplate data={data} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pure presentational receipt (also injected into print window) ──
function ReceiptTemplate({ data }) {
  const fmt = (n = 0) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const fmtDate = (d) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="receipt font-sans">

      {/* Header */}
      <div className="header" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', color: 'white', padding: '28px 32px', borderRadius: '14px 14px 0 0' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Fee Payment Receipt</h1>
        <p style={{ fontSize: '13px', opacity: 0.8, marginTop: '4px' }}>Official Receipt · Keep for your records</p>
        <div style={{ background: 'rgba(255,255,255,0.18)', display: 'inline-block', padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, marginTop: '12px', letterSpacing: '1px' }}>
          {data.receiptNumber}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '28px 32px', background: 'white' }}>

        {/* Amount box */}
        <div style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '1.5px solid #6ee7b7', borderRadius: '12px', padding: '20px', marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '1px' }}>Amount Paid</div>
          <div style={{ fontSize: '36px', fontWeight: 800, color: '#047857', marginTop: '4px' }}>{fmt(data.amount)}</div>
          <div style={{ fontSize: '12px', color: '#065f46', marginTop: '6px' }}>{data.method?.toUpperCase()} · {data.month}</div>
        </div>

        {/* Student Details */}
        <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#94a3b8', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid #f1f5f9' }}>Student Details</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          {[
            ['Student Name', data.studentName],
            ['Class',        data.className],
            ['Admission No', data.admissionNo],
            ['Date',         fmtDate(data.paidOn)],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#1e293b', marginTop: '3px' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Fee Summary */}
        <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#94a3b8', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid #f1f5f9' }}>Fee Summary</p>
        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px' }}>
          {[
            ['Total Fees',      fmt(data.totalFees),   false],
            ['Total Paid',      fmt(data.paidAmount),  false],
            ['Balance Pending', fmt(data.pendingAmount), true],
          ].map(([key, val, isPending]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', borderBottom: key !== 'Balance Pending' ? '1px solid #e2e8f0' : 'none' }}>
              <span style={{ color: '#64748b' }}>{key}</span>
              <span style={{ fontWeight: 700, color: isPending ? '#dc2626' : '#1e293b' }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Transaction info */}
        {data.transactionId && (
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Transaction ID: </span>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#4f46e5' }}>{data.transactionId}</span>
          </div>
        )}

        {data.remarks && (
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Remarks: </span>
            <span style={{ fontSize: '13px', color: '#64748b' }}>{data.remarks}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ background: '#f8fafc', padding: '20px 32px', borderTop: '1px solid #e2e8f0', borderRadius: '0 0 14px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Collected by: <strong style={{ color: '#64748b' }}>{data.collectedBy}</strong></div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Generated on: {new Date().toLocaleDateString('en-IN')}</div>
        </div>
        <div style={{ width: '70px', height: '70px', border: '2px solid #6ee7b7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#059669', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.3px', lineHeight: '1.4' }}>
          PAID<br />✓
        </div>
      </div>

    </div>
  );
}
