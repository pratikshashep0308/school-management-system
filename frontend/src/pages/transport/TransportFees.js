// frontend/src/pages/transport/TransportFees.js
// Admin: manage transport fees — generate, collect, track per student

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { transportFeeAPI } from '../../utils/transportAPI';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_YEAR  = new Date().getFullYear();

export default function TransportFees() {
  const [fees,    setFees]    = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ month: CURRENT_MONTH, year: CURRENT_YEAR, status: '' });
  const [paying,  setPaying]  = useState(null);  // fee record being paid
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'cash', transactionId: '', remarks: '' });
  const [generating, setGenerating] = useState(false);

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
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const generateFees = async () => {
    setGenerating(true);
    try {
      const res = await transportFeeAPI.generate({ month: filters.month, year: filters.year });
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const openPayModal = (fee) => {
    setPaying(fee);
    setPayForm({
      amount:        fee.totalDue - (fee.paidAmount || 0),
      paymentMethod: 'cash',
      transactionId: '',
      remarks:       '',
    });
  };

  const recordPayment = async () => {
    try {
      await transportFeeAPI.pay(paying._id, payForm);
      toast.success('Payment recorded');
      setPaying(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed');
    }
  };

  const pendingCount    = fees.filter((f) => f.status === 'pending' || f.status === 'partial').length;
  const collectedAmount = fees.filter((f) => f.status === 'paid').reduce((s, f) => s + f.paidAmount, 0);
  const pendingAmount   = fees.filter((f) => f.status !== 'paid').reduce((s, f) => s + (f.totalDue - f.paidAmount), 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 Transport Fees</h1>
          <p className="text-sm text-gray-500">Track and collect monthly transport payments</p>
        </div>
        <button onClick={generateFees} disabled={generating}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
          {generating ? '⏳ Generating…' : `⚡ Generate ${MONTHS[filters.month - 1]} Fees`}
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard icon="💳" label="Total Expected"  value={`₹${(summary.totalExpected || 0).toLocaleString('en-IN')}`}  color="blue" />
          <SummaryCard icon="✅" label="Collected"       value={`₹${(summary.totalCollected || 0).toLocaleString('en-IN')}`} color="green" />
          <SummaryCard icon="⏳" label="Pending"         value={`₹${(pendingAmount || 0).toLocaleString('en-IN')}`}          color="red" />
          <SummaryCard icon="📊" label="Paid Students"   value={`${fees.filter((f) => f.status === 'paid').length}/${fees.length}`} color="purple" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">Month</label>
          <select value={filters.month}
            onChange={(e) => setFilters({ ...filters, month: parseInt(e.target.value) })}
            className="border rounded-xl px-3 py-1.5 text-sm">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">Year</label>
          <select value={filters.year}
            onChange={(e) => setFilters({ ...filters, year: parseInt(e.target.value) })}
            className="border rounded-xl px-3 py-1.5 text-sm">
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">Status</label>
          <select value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="border rounded-xl px-3 py-1.5 text-sm">
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
          </select>
        </div>
        <span className="text-sm text-gray-400 ml-auto">{fees.length} records</span>
      </div>

      {/* Fee table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Student', 'Class', 'Amount', 'Late Fee', 'Total', 'Paid', 'Status', 'Due Date', 'Action'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fees.map((fee) => (
                <tr key={fee._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{fee.student?.name}</td>
                  <td className="px-4 py-3 text-gray-500">{fee.student?.class}</td>
                  <td className="px-4 py-3">₹{fee.amount}</td>
                  <td className="px-4 py-3 text-red-500">
                    {fee.lateFee > 0 ? `+₹${fee.lateFee}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold">₹{fee.totalDue}</td>
                  <td className="px-4 py-3 text-green-600">
                    {fee.paidAmount > 0 ? `₹${fee.paidAmount}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={fee.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {fee.dueDate ? new Date(fee.dueDate).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {fee.status !== 'paid' && (
                      <button onClick={() => openPayModal(fee)}
                        className="text-xs px-3 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-semibold">
                        Collect
                      </button>
                    )}
                    {fee.receiptNo && (
                      <span className="text-xs text-gray-400 ml-1">{fee.receiptNo}</span>
                    )}
                  </td>
                </tr>
              ))}
              {fees.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    No fee records. Click "Generate Fees" to create them.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Payment modal */}
      {paying && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold">Collect Payment</h2>
              <button onClick={() => setPaying(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-sm text-gray-600">Student: <strong>{paying.student?.name}</strong></p>
                <p className="text-sm text-gray-600">Total Due: <strong>₹{paying.totalDue}</strong></p>
                {paying.paidAmount > 0 && (
                  <p className="text-sm text-gray-600">Balance: <strong className="text-red-600">₹{paying.totalDue - paying.paidAmount}</strong></p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Amount (₹)</label>
                <input type="number" value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Payment Method</label>
                <select value={payForm.paymentMethod}
                  onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm">
                  {['cash', 'online', 'upi', 'cheque', 'bank_transfer'].map((m) => (
                    <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Transaction ID (optional)</label>
                <input value={payForm.transactionId}
                  onChange={(e) => setPayForm({ ...payForm, transactionId: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="UPI/cheque/online ref" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Remarks</label>
                <input value={payForm.remarks}
                  onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Optional note" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <button onClick={() => setPaying(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={recordPayment}
                className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">
                ✅ Record Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, color }) {
  const colors = {
    blue:   { bg: '#EFF6FF', text: '#1D4ED8' },
    green:  { bg: '#F0FDF4', text: '#15803D' },
    red:    { bg: '#FEF2F2', text: '#B91C1C' },
    purple: { bg: '#F5F3FF', text: '#6D28D9' },
  };
  const c = colors[color] || colors.blue;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-2">
        <span style={{ background: c.bg, color: c.text }}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg">
          {icon}
        </span>
        <span className="text-xs font-semibold text-gray-500 uppercase">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    paid:    { bg: '#D1FAE5', text: '#065F46', label: '✅ Paid' },
    pending: { bg: '#FEE2E2', text: '#991B1B', label: '❌ Pending' },
    partial: { bg: '#FEF3C7', text: '#92400E', label: '⚠️ Partial' },
    waived:  { bg: '#F3F4F6', text: '#6B7280', label: 'Waived' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.text }}
      className="text-xs px-2 py-0.5 rounded-lg font-semibold">
      {s.label}
    </span>
  );
}
