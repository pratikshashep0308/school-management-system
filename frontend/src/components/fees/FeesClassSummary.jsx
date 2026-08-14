// frontend/src/components/fees/FeesClassSummary.jsx
import React from 'react';

const fmt = (n = 0) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const StatusPill = ({ count, type }) => {
  const styles = {
    paid:     'bg-emerald-100 text-emerald-700',
    partial:  'bg-amber-100 text-amber-700',
    not_paid: 'bg-rose-100 text-rose-700'
  };
  const labels = { paid: 'Paid', partial: 'Partial', not_paid: 'Unpaid' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${styles[type]}`}>
      {count} {labels[type]}
    </span>
  );
};

export default function FeesClassSummary({ data = [] }) {
  if (!data.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 shadow-sm">
        <p className="text-4xl mb-2">📋</p>
        <p className="font-medium">No class fee data yet</p>
        <p className="text-sm mt-1">Use "Setup Class Ledger" to initialise fee records for a class</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Class-wise Fee Summary</h2>
        <span className="text-xs text-slate-400">{data.length} classes</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <th className="px-6 py-3 text-left font-semibold">Class</th>
              <th className="px-4 py-3 text-center font-semibold">Students</th>
              <th className="px-4 py-3 text-center font-semibold">Payment Status</th>
              <th className="px-4 py-3 text-right font-semibold">Expected</th>
              <th className="px-4 py-3 text-right font-semibold">Collected</th>
              <th className="px-4 py-3 text-right font-semibold">Pending</th>
              <th className="px-4 py-3 text-center font-semibold">Collection %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row) => {
              const rate = Number(row.collectionRate || 0);
              return (
                <tr key={row.classId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-800">{row.className || 'Class'}</div>
                    <div className="text-xs text-slate-400">Section {row.section}</div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-slate-700 font-medium">{row.totalStudents}</span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1 justify-center">
                      <StatusPill count={row.paidCount}    type="paid"     />
                      <StatusPill count={row.partialCount} type="partial"  />
                      <StatusPill count={row.notPaidCount} type="not_paid" />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right text-slate-600">{fmt(row.totalExpected)}</td>
                  <td className="px-4 py-4 text-right font-semibold text-emerald-700">{fmt(row.totalCollected)}</td>
                  <td className="px-4 py-4 text-right font-semibold text-rose-600">{fmt(row.totalPending)}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`text-xs font-bold ${rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {rate.toFixed(1)}%
                      </span>
                      <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`}
                          style={{ width: `${Math.min(100, rate)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
