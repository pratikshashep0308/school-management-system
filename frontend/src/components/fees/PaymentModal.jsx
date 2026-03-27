// frontend/src/components/fees/PaymentModal.jsx
import React, { useState, useEffect } from 'react';
import feeAPI from '../../utils/feeAPI';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

export default function PaymentModal({ student, onClose, onSuccess }) {
  // student may be a StudentFee record (from table) or null (add new)
  const prefill = student ? {
    studentId: student.student?._id || '',
    className: student.class ? `${student.class.name} – ${student.class.section}` : '',
    totalFees: student.totalFees || '',
    pendingAmount: student.pendingAmount || 0,
    classId:  student.class?._id || '',
    section:  student.section || '',
    studentName: student.student?.user?.name || ''
  } : {};

  const now = new Date();
  const [form, setForm] = useState({
    studentId:    prefill.studentId || '',
    classId:      prefill.classId   || '',
    section:      prefill.section   || '',
    totalFees:    prefill.totalFees || '',
    amount:       '',
    method:       'cash',
    transactionId:'',
    month:        `${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    year:         now.getFullYear(),
    remarks:      ''
  });

  const [structures, setStructures] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    feeAPI.getStructures()
      .then(r => setStructures(r.data.data || []))
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.studentId) return setError('Student ID is required');
    if (!form.amount || Number(form.amount) <= 0) return setError('Enter a valid amount');
    if (!student && (!form.classId || !form.totalFees)) return setError('Class and Total Fees required for new records');

    setLoading(true);
    setError('');
    try {
      const payload = {
        studentId:     form.studentId,
        amount:        Number(form.amount),
        method:        form.method,
        transactionId: form.transactionId || undefined,
        month:         form.month,
        year:          Number(form.year),
        remarks:       form.remarks || undefined,
      };
      if (!student) {
        payload.classId   = form.classId;
        payload.section   = form.section;
        payload.totalFees = Number(form.totalFees);
      }
      const res = await feeAPI.recordPayment(payload);
      onSuccess(res.data.receiptNumber);
    } catch (e) {
      setError(e.response?.data?.message || 'Payment failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Record Payment</h2>
            {prefill.studentName && (
              <p className="text-sm text-indigo-600 font-medium mt-0.5">
                {prefill.studentName} · {prefill.className}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
          )}

          {/* If no pre-filled student, show manual entry */}
          {!student && (
            <>
              <Field label="Student ID *">
                <input
                  type="text"
                  placeholder="MongoDB ObjectId of student"
                  value={form.studentId}
                  onChange={e => set('studentId', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Class ID *">
                  <input type="text" placeholder="Class ObjectId" value={form.classId}
                    onChange={e => set('classId', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Section">
                  <input type="text" placeholder="e.g. A" value={form.section}
                    onChange={e => set('section', e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label="Total Annual Fees (₹) *">
                <input type="number" placeholder="e.g. 50000" value={form.totalFees}
                  onChange={e => set('totalFees', e.target.value)} className={inputCls} />
              </Field>
            </>
          )}

          {/* Pending info */}
          {prefill.pendingAmount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              Pending amount: <strong>₹{prefill.pendingAmount.toLocaleString('en-IN')}</strong>
            </div>
          )}

          {/* Amount */}
          <Field label="Payment Amount (₹) *">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
              <input
                type="number"
                min="1"
                placeholder="Enter amount"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                className={`${inputCls} pl-8`}
              />
            </div>
            {prefill.pendingAmount > 0 && (
              <button
                type="button"
                onClick={() => set('amount', prefill.pendingAmount)}
                className="mt-1 text-xs text-indigo-500 hover:underline"
              >
                Fill full pending amount
              </button>
            )}
          </Field>

          {/* Payment method */}
          <Field label="Payment Method">
            <div className="grid grid-cols-5 gap-2">
              {['cash','upi','online','cheque','bank'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('method', m)}
                  className={`py-2 rounded-lg text-xs font-semibold capitalize border transition-all ${
                    form.method === m
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {m === 'cash' ? '💵' : m === 'upi' ? '📱' : m === 'online' ? '🌐' : m === 'cheque' ? '📝' : '🏦'}
                  <br />{m}
                </button>
              ))}
            </div>
          </Field>

          {/* Transaction ID (for non-cash) */}
          {form.method !== 'cash' && (
            <Field label="Transaction / Reference ID">
              <input
                type="text"
                placeholder="UTR, cheque no, ref ID..."
                value={form.transactionId}
                onChange={e => set('transactionId', e.target.value)}
                className={inputCls}
              />
            </Field>
          )}

          {/* Month */}
          <Field label="For Month">
            <input
              type="text"
              value={form.month}
              onChange={e => set('month', e.target.value)}
              className={inputCls}
            />
          </Field>

          {/* Remarks */}
          <Field label="Remarks (optional)">
            <input
              type="text"
              placeholder="Any notes..."
              value={form.remarks}
              onChange={e => set('remarks', e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Processing...' : '✓ Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-colors";
