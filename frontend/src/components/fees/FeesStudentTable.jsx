// frontend/src/components/fees/FeesStudentTable.jsx
import React, { useState, useEffect, useCallback } from 'react';
import feeAPI from '../../utils/feeAPI';

const fmt = (n = 0) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const statusConfig = {
  paid:     { label: 'Paid',    bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  partial:  { label: 'Partial', bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  not_paid: { label: 'Unpaid',  bg: 'bg-rose-100',    text: 'text-rose-700',    dot: 'bg-rose-500'    }
};

export default function FeesStudentTable({ onPayClick, onReceiptClick }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal]     = useState(0);

  const [filters, setFilters] = useState({ classId: '', section: '', status: '' });
  const [page, setPage]       = useState(1);
  const limit = 20;

  const [expanded, setExpanded] = useState(null); // expanded student ID

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
      const res = await feeAPI.getStudents(params);
      setRecords(res.data.data);
      setTotal(res.data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const handleFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Status</label>
            <select
              value={filters.status}
              onChange={e => handleFilter('status', e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">All Status</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="not_paid">Unpaid</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Section</label>
            <input
              type="text"
              placeholder="e.g. A"
              value={filters.section}
              onChange={e => handleFilter('section', e.target.value)}
              className="px-3 py-2 w-24 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <button
            onClick={() => { setFilters({ classId: '', section: '', status: '' }); setPage(1); }}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-500 text-sm hover:bg-slate-100"
          >
            Reset
          </button>
          <span className="ml-auto text-sm text-slate-400">{total} students</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">Loading...</div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No records found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="px-6 py-3 text-left font-semibold">Student</th>
                  <th className="px-4 py-3 text-left font-semibold">Class</th>
                  <th className="px-4 py-3 text-right font-semibold">Total Fees</th>
                  <th className="px-4 py-3 text-right font-semibold">Paid</th>
                  <th className="px-4 py-3 text-right font-semibold">Pending</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map(rec => {
                  const cfg = statusConfig[rec.paymentStatus] || statusConfig.not_paid;
                  const studentId = rec.student?._id;
                  const isExp = expanded === studentId;
                  return (
                    <React.Fragment key={rec._id}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {rec.student?.user?.name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800">{rec.student?.user?.name || 'N/A'}</p>
                              <p className="text-xs text-slate-400">{rec.student?.admissionNumber}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {rec.class?.name} – {rec.section || rec.class?.section}
                        </td>
                        <td className="px-4 py-4 text-right text-slate-600">{fmt(rec.totalFees)}</td>
                        <td className="px-4 py-4 text-right font-semibold text-emerald-700">{fmt(rec.paidAmount)}</td>
                        <td className="px-4 py-4 text-right font-semibold text-rose-600">{fmt(rec.pendingAmount)}</td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => setExpanded(isExp ? null : studentId)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-100"
                            >
                              {isExp ? 'Hide' : 'History'}
                            </button>
                            {rec.paymentStatus !== 'paid' && (
                              <button
                                onClick={() => onPayClick(rec)}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                              >
                                Pay
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded payment history */}
                      {isExp && (
                        <tr>
                          <td colSpan={7} className="px-6 py-0 bg-slate-50">
                            <PaymentHistory
                              studentId={studentId}
                              onReceiptClick={onReceiptClick}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>Page {page} of {Math.ceil(total / limit)}</span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-100"
              >
                ← Prev
              </button>
              <button
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-100"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Inline payment history sub-component
function PaymentHistory({ studentId, onReceiptClick }) {
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(true);

  useEffect(() => {
    feeAPI.getStudentFee(studentId)
      .then(res => setData(res.data.data))
      .catch(console.error)
      .finally(() => setLoad(false));
  }, [studentId]);

  if (loading) return <div className="py-4 text-slate-400 text-sm">Loading history...</div>;
  if (!data?.paymentHistory?.length) return (
    <div className="py-4 text-slate-400 text-sm">No payments recorded yet</div>
  );

  return (
    <div className="py-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Payment History</p>
      <div className="space-y-2">
        {data.paymentHistory.slice().reverse().map((p, i) => (
          <div key={i} className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="text-emerald-600 font-bold text-sm">
                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.amount)}
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">{p.method?.toUpperCase()} · {p.month || '—'}</p>
                {p.transactionId && <p className="text-xs text-slate-400">TXN: {p.transactionId}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                {new Date(p.paidOn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              <button
                onClick={() => onReceiptClick(p.receiptNumber)}
                className="px-3 py-1 rounded-lg border border-indigo-200 text-indigo-600 text-xs hover:bg-indigo-50 font-medium"
              >
                📄 Receipt
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
