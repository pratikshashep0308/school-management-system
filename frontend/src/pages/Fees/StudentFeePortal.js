// frontend/src/pages/Fees/StudentFeePortal.js
// Full fee portal for Student and Parent roles
// Shows: Fee Summary, Payment History, Receipts, Fee Structure

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { useAuth } from '../../context/AuthContext';
import { LoadingState, EmptyState } from '../../components/ui';
import FeeStructure from './FeeStructure';

const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

// ── Receipt download helper ───────────────────────────────────────────────────
async function downloadReceipt(receiptNumber, setDownloading) {
  setDownloading(receiptNumber);
  try {
    const token = localStorage.getItem('token');
    const url   = `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/fees/receipt/${receiptNumber}/pdf`;
    const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Not found');
    const blob  = await res.blob();
    const link  = document.createElement('a');
    link.href   = URL.createObjectURL(blob);
    link.download = `receipt-${receiptNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('Receipt downloaded');
  } catch {
    toast.error('Receipt not available');
  } finally {
    setDownloading('');
  }
}

// ── Summary ring chart ────────────────────────────────────────────────────────
function FeeRing({ paid, total }) {
  const pct  = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const R    = 44, cx = 50, cy = 50, circ = 2 * Math.PI * R;
  const color = pct >= 100 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#DC2626';
  return (
    <svg width={100} height={100} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#F3F4F6" strokeWidth={10} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${(pct / 100) * circ} ${circ}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={13} fontWeight="900" fill={color}>{Math.round(pct)}%</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="#9CA3AF">Paid</text>
    </svg>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    paid:     { bg: '#F0FDF4', color: '#16A34A', label: '✅ Paid',    border: '#22C55E' },
    partial:  { bg: '#FFF7ED', color: '#EA580C', label: '🔵 Partial', border: '#F97316' },
    not_paid: { bg: '#FEF2F2', color: '#DC2626', label: '⏳ Pending', border: '#EF4444' },
    pending:  { bg: '#FEF2F2', color: '#DC2626', label: '⏳ Pending', border: '#EF4444' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}40`, padding: '3px 10px', borderRadius: 20 }}>
      {s.label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StudentFeePortal({ studentId }) {
  const { user } = useAuth();
  const [tab,          setTab]          = useState('summary');
  const [feeRecord,    setFeeRecord]    = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [downloading,  setDownloading]  = useState('');
  const [previewPay,   setPreviewPay]   = useState(null);

  const sid = studentId || user?._id;

  const loadFees = useCallback(async () => {
    if (!sid) return;
    setLoading(true);
    try {
      // Try to get student's own fee record
      const r = await feeAPI.getStudentFee(sid);
      setFeeRecord(r.data.data);
    } catch {
      // If no ledger exists yet, show empty state
      setFeeRecord(null);
    } finally {
      setLoading(false);
    }
  }, [sid]);

  useEffect(() => { loadFees(); }, [loadFees]);

  const TABS = [
    { key: 'summary',   label: '📊 Fee Summary' },
    { key: 'history',   label: '📜 Payment History' },
    { key: 'structure', label: '🏷 Fee Structure' },
  ];

  const rec  = feeRecord;
  const paid = rec?.paidAmount    || 0;
  const due  = rec?.pendingAmount || 0;
  const total = rec?.totalFees    || 0;
  const payments = rec?.paymentHistory || [];
  const status   = rec?.paymentStatus || 'not_paid';

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, background: '#F3F4F6', borderRadius: 10, padding: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            background: tab === t.key ? '#1D4ED8' : 'transparent',
            color:      tab === t.key ? '#fff'    : '#6B7280',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Summary Tab ── */}
      {tab === 'summary' && (
        loading ? <LoadingState /> : !rec ? (
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#374151' }}>No Fee Record Found</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 6 }}>Your fee ledger hasn't been set up yet. Please contact the school office.</div>
          </div>
        ) : (
          <div>
            {/* Main fee card */}
            <div style={{
              background: 'linear-gradient(135deg, #0B1F4A, #162D6A)',
              borderRadius: 16, padding: '24px 24px 20px', marginBottom: 16, position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(201,149,42,0.1)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: 6 }}>Annual Fee Status</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                    <StatusBadge status={status} />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Academic Year {new Date().getFullYear()}-{new Date().getFullYear() + 1}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                    {[
                      { label: 'Total Fees',   val: fmt(total), color: '#94A3B8' },
                      { label: 'Paid',         val: fmt(paid),  color: '#34D399' },
                      { label: 'Pending',      val: fmt(due),   color: due > 0 ? '#FCA5A5' : '#34D399' },
                    ].map(s => (
                      <div key={s.label}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{s.val}</div>
                        <div style={{ fontSize: 10, color: s.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <FeeRing paid={paid} total={total} />
              </div>

              {/* Progress bar */}
              <div style={{ marginTop: 16, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  width: `${total > 0 ? Math.min(100, (paid/total)*100) : 0}%`,
                  background: 'linear-gradient(90deg, #34D399, #059669)',
                  transition: 'width 1s ease',
                }} />
              </div>
            </div>

            {/* Alert if pending */}
            {due > 0 && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>⚠️</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#991B1B' }}>Payment Pending: {fmt(due)}</div>
                  <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 3 }}>Please visit the school office to clear your dues. Timely payment ensures uninterrupted education.</div>
                </div>
              </div>
            )}

            {/* Payment summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { icon: '📋', label: 'Total Payments', val: payments.length,       color: '#1D4ED8', bg: '#EFF6FF' },
                { icon: '💵', label: 'Last Payment',   val: payments.length > 0 ? fmt(payments[payments.length-1]?.amount) : '—', color: '#16A34A', bg: '#F0FDF4' },
                { icon: '📅', label: 'Last Date',      val: payments.length > 0 ? new Date(payments[payments.length-1]?.paidOn).toLocaleDateString('en-IN', { day:'numeric', month:'short' }) : '—', color: '#7C3AED', bg: '#F5F3FF' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px 16px', border: `1px solid ${s.color}20` }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2, fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Recent payments preview */}
            {payments.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Recent Payments</div>
                  <button onClick={() => setTab('history')} style={{ fontSize: 12, color: '#1D4ED8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>View All →</button>
                </div>
                {[...payments].reverse().slice(0, 3).map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < 2 ? '1px solid #F3F4F6' : 'none' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>💳</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{p.month || 'Payment'}</div>
                      <div style={{ fontSize: 11, color: '#6B7280' }}>{new Date(p.paidOn).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })} · {p.method}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#16A34A' }}>{fmt(p.amount)}</div>
                      {p.receiptNumber && (
                        <button onClick={() => downloadReceipt(p.receiptNumber, setDownloading)}
                          disabled={downloading === p.receiptNumber}
                          style={{ fontSize: 10, color: '#1D4ED8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, marginTop: 2, padding: 0 }}>
                          {downloading === p.receiptNumber ? '⏳' : '⬇ Receipt'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* ── Payment History Tab ── */}
      {tab === 'history' && (
        loading ? <LoadingState /> : !rec ? (
          <EmptyState icon="📜" title="No payment history" subtitle="No payments have been recorded yet" />
        ) : payments.length === 0 ? (
          <EmptyState icon="💳" title="No payments yet" subtitle="Payment history will appear here once fees are paid" />
        ) : (
          <div>
            {/* Summary bar */}
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Paid</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#15803D' }}>{fmt(paid)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Transactions</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#374151' }}>{payments.length}</div>
              </div>
              {due > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Still Pending</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#B91C1C' }}>{fmt(due)}</div>
                </div>
              )}
            </div>

            {/* Payment list */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid #E5E7EB', background: '#F8FAFC' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>All Payments — {payments.length} transactions</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#0B1F4A' }}>
                      {['#','Date','Description','Method','Amount','Receipt'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#E2E8F0', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...payments].reverse().map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 ? '#FAFAFA' : '#fff' }}>
                        <td style={{ padding: '10px 14px', color: '#9CA3AF' }}>{payments.length - i}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#374151' }}>
                          {new Date(p.paidOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{p.month || 'Fee Payment'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '2px 8px', borderRadius: 10 }}>
                            {p.method || 'cash'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#16A34A', fontSize: 14 }}>{fmt(p.amount)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {p.receiptNumber ? (
                            <button
                              onClick={() => downloadReceipt(p.receiptNumber, setDownloading)}
                              disabled={downloading === p.receiptNumber}
                              style={{
                                fontSize: 11, fontWeight: 700, color: '#1D4ED8',
                                background: '#EFF6FF', border: '1px solid #BFDBFE',
                                padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}>
                              {downloading === p.receiptNumber ? '⏳' : '⬇'} Receipt
                            </button>
                          ) : <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#F0FDF4', borderTop: '2px solid #BBF7D0' }}>
                      <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 800, color: '#16A34A' }}>TOTAL PAID</td>
                      <td style={{ padding: '10px 14px', fontWeight: 900, color: '#15803D', fontSize: 15 }}>{fmt(paid)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Pending reminder */}
            {due > 0 && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 18px', marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 24 }}>💬</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B' }}>Pending Balance: {fmt(due)}</div>
                  <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 2 }}>Please contact the school office to complete your payment and collect your receipt.</div>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ── Fee Structure Tab ── */}
      {tab === 'structure' && <FeeStructure />}
    </div>
  );
}