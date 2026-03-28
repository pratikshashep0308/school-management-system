// frontend/src/pages/transport/TransportFees.js
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { transportFeeAPI } from '../../utils/transportAPI';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function TransportFees() {
  const [fees,    setFees]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), status: '' });
  const [payModal,setPayModal]= useState(null);  // fee record
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'cash', transactionId: '' });
  const [generating, setGen]  = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await transportFeeAPI.getAll({ month: filter.month, year: filter.year, status: filter.status || undefined });
      setFees(res.data.data);
    } catch { toast.error('Failed to load fees'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);

  const handleGenerate = async () => {
    setGen(true);
    try {
      const res = await transportFeeAPI.generate({ month: filter.month, year: filter.year });
      toast.success(res.data.message);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
    finally { setGen(false); }
  };

  const handlePay = async () => {
    try {
      await transportFeeAPI.pay(payModal._id, { ...payForm, amount: +payForm.amount, totalDue: payModal.totalDue });
      toast.success('Payment recorded ✅');
      setPayModal(null);
      load();
    } catch { toast.error('Error recording payment'); }
  };

  const summary = {
    total:   fees.reduce((s, f) => s + f.totalDue, 0),
    paid:    fees.filter(f => f.status === 'paid').reduce((s, f) => s + f.paidAmount, 0),
    pending: fees.filter(f => f.status === 'pending').reduce((s, f) => s + f.totalDue, 0),
  };

  const statusColors = {
    pending: 'bg-amber-100 text-amber-700',
    paid:    'bg-green-100 text-green-700',
    partial: 'bg-blue-100 text-blue-700',
    waived:  'bg-gray-100 text-gray-500',
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Transport Fees</h2>
          <p className="text-sm text-gray-500">{fees.length} records for {MONTHS[filter.month - 1]} {filter.year}</p>
        </div>
        <button onClick={handleGenerate} disabled={generating}
          className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
          {generating ? '⏳ Generating...' : '⚡ Generate Monthly Fees'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Billed',  value: summary.total,   color: 'bg-blue-50 text-blue-700',   icon: '📋' },
          { label: 'Collected',     value: summary.paid,    color: 'bg-green-50 text-green-700',  icon: '✅' },
          { label: 'Pending',       value: summary.pending, color: 'bg-amber-50 text-amber-700',  icon: '⏳' },
        ].map(c => (
          <div key={c.label} className={`${c.color} rounded-2xl p-5`}>
            <div className="text-2xl mb-1">{c.icon}</div>
            <div className="text-2xl font-bold">₹{c.value.toLocaleString('en-IN')}</div>
            <div className="text-sm font-medium opacity-75">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex gap-1">
          {MONTHS.map((m, i) => (
            <button key={m} onClick={() => setFilter(f => ({ ...f, month: i + 1 }))}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${filter.month === i + 1 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {m}
            </button>
          ))}
        </div>
        <input type="number" value={filter.year} onChange={e => setFilter(f => ({ ...f, year: +e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-1 text-sm w-24" />
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-1 text-sm">
          <option value="">All Status</option>
          {['pending','paid','partial','waived'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
              <tr>
                {['Student','Class','Amount','Late Fee','Total Due','Status','Due Date','Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : fees.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">
                  No fees for this period. Click "Generate Monthly Fees" to create them.
                </td></tr>
              ) : fees.map(f => (
                <tr key={f._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{f.student?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{f.student?.class || '—'}</td>
                  <td className="px-4 py-3">₹{f.amount}</td>
                  <td className="px-4 py-3 text-red-500">{f.lateFee > 0 ? `+₹${f.lateFee}` : '—'}</td>
                  <td className="px-4 py-3 font-bold text-gray-900">₹{f.totalDue}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[f.status]}`}>
                      {f.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {f.dueDate ? new Date(f.dueDate).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {f.status !== 'paid' && f.status !== 'waived' && (
                      <button onClick={() => { setPayModal(f); setPayForm({ amount: f.totalDue - (f.paidAmount || 0), paymentMethod: 'cash', transactionId: '' }); }}
                        className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-lg hover:bg-green-100 font-semibold">
                        💳 Pay
                      </button>
                    )}
                    {f.receiptNo && <span className="text-xs text-gray-400 ml-2">{f.receiptNo}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between">
              <h3 className="font-bold">Record Payment — {payModal.student?.name}</h3>
              <button onClick={() => setPayModal(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 rounded-xl p-4 text-sm">
                <div className="flex justify-between"><span>Amount Due:</span><span className="font-bold">₹{payModal.totalDue}</span></div>
                {payModal.lateFee > 0 && <div className="flex justify-between text-red-600"><span>Late Fee:</span><span>₹{payModal.lateFee}</span></div>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount Paying (₹)</label>
                <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                <select value={payForm.paymentMethod} onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {['cash','upi','online','cheque'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              {payForm.paymentMethod !== 'cash' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Transaction / Reference ID</label>
                  <input value={payForm.transactionId} onChange={e => setPayForm(f => ({ ...f, transactionId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="UPI ref / Cheque no" />
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setPayModal(null)} className="px-4 py-2 border border-gray-300 rounded-xl text-sm">Cancel</button>
              <button onClick={handlePay} className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700">
                ✅ Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}