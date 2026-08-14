// frontend/src/pages/transport/TransportFees.js
// ✅ FIXED & UPGRADED — Admin Transport Fees Management
// Fixes:
//   1. Generate fees shows created vs skipped count
//   2. Status filter works with backend enum values
//   3. Payment modal pre-fills correct balance
//   4. Per-student fee history expandable row
//   5. Summary cards from /fees/summary endpoint

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { transportFeeAPI } from '../../utils/transportAPI';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_YEAR  = new Date().getFullYear();
const PAYMENT_METHODS = ['cash','upi','online','cheque','bank_transfer'];

export default function TransportFees() {
  const [fees,       setFees]       = useState([]);
  const [summary,    setSummary]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filters,    setFilters]    = useState({ month: CURRENT_MONTH, year: CURRENT_YEAR, status: '' });
  const [paying,     setPaying]     = useState(null);
  const [payForm,    setPayForm]    = useState({ amount: '', paymentMethod: 'cash', transactionId: '', remarks: '' });
  const [payLoading, setPayLoading] = useState(false);
  const [expanded,   setExpanded]   = useState(null);
  const [search,     setSearch]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, sRes] = await Promise.all([
        transportFeeAPI.getAll(filters),
        transportFeeAPI.summary({ month: filters.month, year: filters.year }),
      ]);
      setFees(fRes.data.data || []);
      setSummary(sRes.data.data);
    } catch {
      toast.error('Failed to load fees');
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const generateFees = async () => {
    setGenerating(true);
    try {
      const res = await transportFeeAPI.generate({ month: filters.month, year: filters.year });
      const d = res.data.data;
      toast.success(`✅ ${d?.created ?? 0} new fees generated, ${d?.skipped ?? 0} already existed`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Generation failed');
    } finally { setGenerating(false); }
  };

  const openPay = (fee) => {
    const balance = fee.totalDue - (fee.paidAmount || 0);
    setPaying(fee);
    setPayForm({ amount: balance, paymentMethod: 'cash', transactionId: '', remarks: '' });
  };

  const recordPayment = async () => {
    if (!payForm.amount || Number(payForm.amount) <= 0) return toast.error('Enter a valid amount');
    setPayLoading(true);
    try {
      await transportFeeAPI.pay(paying._id, payForm);
      toast.success('Payment recorded ✅');
      setPaying(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed');
    } finally { setPayLoading(false); }
  };

  const visibleFees = fees.filter((f) => {
    if (!search) return true;
    const name = f.student?.name?.toLowerCase() || '';
    const roll = f.student?.rollNumber?.toLowerCase() || '';
    return name.includes(search.toLowerCase()) || roll.includes(search.toLowerCase());
  });

  const totalExpected  = summary?.totalExpected  || 0;
  const totalCollected = summary?.totalCollected  || 0;
  const totalPending   = totalExpected - totalCollected;
  const paidCount      = summary?.counts?.paid    || 0;
  const pendingCount   = (summary?.counts?.pending || 0) + (summary?.counts?.partial || 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 Transport Fees</h1>
          <p className="text-sm text-gray-500">Track and collect monthly transport payments</p>
        </div>
        <button onClick={generateFees} disabled={generating}
          className="px-4 py-2.5 bg-blue-600 text-white text-sm rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2">
          {generating ? <><span className="animate-spin">⏳</span> Generating…</> : `⚡ Generate ${MONTHS[filters.month - 1]} ${filters.year} Fees`}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon="💳" label="Total Expected"   value={`₹${totalExpected.toLocaleString('en-IN')}`}  color="blue" />
        <SummaryCard icon="✅" label="Collected"        value={`₹${totalCollected.toLocaleString('en-IN')}`} color="green" />
        <SummaryCard icon="⏳" label="Pending"          value={`₹${totalPending.toLocaleString('en-IN')}`}   color="red" />
        <SummaryCard icon="📊" label="Paid / Total"     value={`${paidCount} / ${fees.length}`}              color="purple"
          sub={pendingCount > 0 ? `${pendingCount} overdue` : 'All clear!'} />
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Month</label>
          <select value={filters.month} onChange={(e) => setFilters({...filters, month: +e.target.value})}
            className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Year</label>
          <select value={filters.year} onChange={(e) => setFilters({...filters, year: +e.target.value})}
            className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Status</label>
          <select value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})}
            className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="waived">Waived</option>
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Search Student</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or roll no…"
            className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <button onClick={load} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200">
          🔄 Refresh
        </button>
      </div>

      {/* Fee table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">
            <div className="animate-spin text-3xl mb-2">⏳</div> Loading fees…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Student','Class','Amount','Late Fee','Total Due','Paid','Balance','Status','Due Date','Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleFees.map((fee) => {
                  const balance = fee.totalDue - (fee.paidAmount || 0);
                  const isPaid  = fee.status === 'paid';
                  const isOverdue = !isPaid && fee.dueDate && new Date(fee.dueDate) < new Date();
                  return (
                    <React.Fragment key={fee._id}>
                      <tr className={`hover:bg-gray-50 cursor-pointer ${isOverdue && !isPaid ? 'bg-red-50/40' : ''}`}
                        onClick={() => setExpanded(expanded === fee._id ? null : fee._id)}>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            <span>{expanded === fee._id ? '▾' : '▸'}</span>
                            {fee.student?.name || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{fee.student?.class || '—'}</td>
                        <td className="px-4 py-3">₹{fee.amount?.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-red-500">{fee.lateFee > 0 ? `+₹${fee.lateFee}` : '—'}</td>
                        <td className="px-4 py-3 font-semibold">₹{fee.totalDue?.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-green-600">{fee.paidAmount > 0 ? `₹${fee.paidAmount.toLocaleString('en-IN')}` : '—'}</td>
                        <td className="px-4 py-3 font-semibold text-red-600">{balance > 0 ? `₹${balance.toLocaleString('en-IN')}` : <span className="text-green-600">✓ Clear</span>}</td>
                        <td className="px-4 py-3"><FeeStatusBadge status={fee.status} /></td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {fee.dueDate ? new Date(fee.dueDate).toLocaleDateString('en-IN') : '—'}
                          {isOverdue && !isPaid && <span className="ml-1 text-red-500 font-semibold">OVERDUE</span>}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {!isPaid && (
                            <button onClick={() => openPay(fee)}
                              className="text-xs px-3 py-1 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg font-semibold whitespace-nowrap">
                              💳 Collect
                            </button>
                          )}
                          {isPaid && fee.receiptNo && (
                            <span className="text-xs text-gray-400 font-mono">{fee.receiptNo}</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded: payment history */}
                      {expanded === fee._id && (
                        <tr>
                          <td colSpan={10} className="bg-blue-50/40 px-6 py-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Payment History</p>
                            {fee.paymentHistory?.length > 0 ? (
                              <div className="space-y-1.5">
                                {fee.paymentHistory.map((p, i) => (
                                  <div key={i} className="flex items-center gap-4 text-xs text-gray-700 bg-white rounded-lg px-3 py-2">
                                    <span className="font-semibold text-green-600">₹{p.amount?.toLocaleString('en-IN')}</span>
                                    <span>{new Date(p.date).toLocaleDateString('en-IN')}</span>
                                    <span className="capitalize px-2 py-0.5 bg-gray-100 rounded-lg">{p.method || 'cash'}</span>
                                    {p.transactionId && <span className="font-mono text-gray-400">{p.transactionId}</span>}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400">No payment history yet.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {visibleFees.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-400">
                    {fees.length === 0
                      ? `No fees for ${MONTHS[filters.month - 1]} ${filters.year}. Click "Generate Fees" above.`
                      : 'No matching students found.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Payment Modal ─────────────────────────────────────────────────── */}
      {paying && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">💳 Record Payment</h2>
                <p className="text-sm text-gray-500">{paying.student?.name} · {MONTHS[(paying.month || 1) - 1]} {paying.year}</p>
              </div>
              <button onClick={() => setPaying(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Fee breakdown */}
              <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-gray-500 text-xs">Total Due</p><p className="font-bold">₹{paying.totalDue?.toLocaleString('en-IN')}</p></div>
                <div><p className="text-gray-500 text-xs">Already Paid</p><p className="font-bold text-green-600">₹{(paying.paidAmount || 0).toLocaleString('en-IN')}</p></div>
                <div><p className="text-gray-500 text-xs">Balance</p><p className="font-bold text-red-600">₹{(paying.totalDue - (paying.paidAmount || 0)).toLocaleString('en-IN')}</p></div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Amount (₹) *</label>
                <input type="number" value={payForm.amount} min="1"
                  onChange={(e) => setPayForm({...payForm, amount: e.target.value})}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Payment Method *</label>
                <div className="flex gap-2 flex-wrap">
                  {PAYMENT_METHODS.map((m) => (
                    <button key={m} onClick={() => setPayForm({...payForm, paymentMethod: m})}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize border transition-all ${
                        payForm.paymentMethod === m ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'
                      }`}>
                      {m === 'upi' ? 'UPI' : m === 'bank_transfer' ? 'Bank Transfer' : m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {(payForm.paymentMethod === 'upi' || payForm.paymentMethod === 'online' || payForm.paymentMethod === 'bank_transfer') && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Transaction ID</label>
                  <input value={payForm.transactionId} onChange={(e) => setPayForm({...payForm, transactionId: e.target.value})}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="UPI Ref / TXN ID" />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Remarks</label>
                <input value={payForm.remarks} onChange={(e) => setPayForm({...payForm, remarks: e.target.value})}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Optional note…" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => setPaying(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={recordPayment} disabled={payLoading}
                className="px-5 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-xl font-semibold disabled:opacity-50">
                {payLoading ? 'Recording…' : '✅ Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, color, sub }) {
  const colors = {
    blue:   { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
    green:  { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
    red:    { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
    purple: { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  };
  const c = colors[color] || colors.blue;
  return (
    <div className="rounded-2xl border p-5" style={{ background: c.bg, borderColor: c.border }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <p className="text-xs font-semibold uppercase" style={{ color: c.text }}>{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: c.text }}>{value}</p>
      {sub && <p className="text-xs mt-1 opacity-70" style={{ color: c.text }}>{sub}</p>}
    </div>
  );
}

function FeeStatusBadge({ status }) {
  const map = {
    paid:    { bg: '#D1FAE5', text: '#065F46', label: '✅ Paid' },
    pending: { bg: '#FEE2E2', text: '#991B1B', label: '❌ Pending' },
    partial: { bg: '#FEF3C7', text: '#92400E', label: '⚠️ Partial' },
    waived:  { bg: '#F3F4F6', text: '#6B7280', label: '🔵 Waived' },
  };
  const s = map[status] || map.pending;
  return <span style={{ background: s.bg, color: s.text }} className="text-xs px-2 py-0.5 rounded-lg font-semibold whitespace-nowrap">{s.label}</span>;
}