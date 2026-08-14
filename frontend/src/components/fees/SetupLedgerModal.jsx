// frontend/src/components/fees/SetupLedgerModal.jsx
// Used to bulk-create StudentFee records for all students in a class at once
import React, { useState, useEffect } from 'react';
import feeAPI from '../../utils/feeAPI';
import api from '../../utils/api';   // your existing axios instance

export default function SetupLedgerModal({ onClose, onSuccess }) {
  const [classes, setClasses] = useState([]);
  const [form, setForm]       = useState({ classId: '', totalFees: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState('');

  useEffect(() => {
    api.get('/classes')
      .then(r => setClasses(r.data.data || []))
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!form.classId)   return setError('Please select a class');
    if (!form.totalFees || Number(form.totalFees) <= 0) return setError('Enter a valid total fee amount');

    setLoading(true);
    setError('');
    setResult('');
    try {
      const res = await feeAPI.setupLedger({ classId: form.classId, totalFees: Number(form.totalFees) });
      setResult(res.data.message);
      setTimeout(onSuccess, 1500);
    } catch (e) {
      setError(e.response?.data?.message || 'Setup failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Setup Class Ledger</h2>
            <p className="text-xs text-slate-400 mt-0.5">Initialise fee records for all students in a class</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error  && <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
          {result && <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm">{result}</div>}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Select Class *</label>
            <select
              value={form.classId}
              onChange={e => setForm(f => ({ ...f, classId: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">— Choose class —</option>
              {classes.map(c => (
                <option key={c._id} value={c._id}>
                  {c.name} – Section {c.section}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Total Annual Fees (₹) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
              <input
                type="number"
                min="1"
                placeholder="e.g. 60000"
                value={form.totalFees}
                onChange={e => setForm(f => ({ ...f, totalFees: e.target.value }))}
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">This will be set as the total fee for every student in the class. Existing records won't be overwritten.</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Setting up...' : '⚙ Initialize Ledger'}
          </button>
        </div>
      </div>
    </div>
  );
}
