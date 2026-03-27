// frontend/src/components/fees/SummaryCards.jsx
import React from 'react';

const fmt = (n = 0) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) : 0);

export default function SummaryCards({ summary = {} }) {
  const {
    totalStudents  = 0,
    totalExpected  = 0,
    totalCollected = 0,
    totalPending   = 0,
    paidCount      = 0,
    partialCount   = 0,
    notPaidCount   = 0
  } = summary;

  const cards = [
    {
      label: 'Total Collected',
      value: fmt(totalCollected),
      sub: `${pct(totalCollected, totalExpected)}% of expected`,
      icon: '💰',
      color: 'from-emerald-500 to-teal-600',
      light: 'bg-emerald-50 border-emerald-100',
      text: 'text-emerald-700'
    },
    {
      label: 'Total Pending',
      value: fmt(totalPending),
      sub: `${fmt(totalExpected)} expected total`,
      icon: '⏳',
      color: 'from-orange-400 to-amber-500',
      light: 'bg-amber-50 border-amber-100',
      text: 'text-amber-700'
    },
    {
      label: 'Fully Paid',
      value: paidCount,
      sub: `out of ${totalStudents} students`,
      icon: '✅',
      color: 'from-blue-500 to-indigo-600',
      light: 'bg-blue-50 border-blue-100',
      text: 'text-blue-700'
    },
    {
      label: 'Not Paid',
      value: notPaidCount + partialCount,
      sub: `${notPaidCount} unpaid · ${partialCount} partial`,
      icon: '⚠️',
      color: 'from-rose-400 to-pink-600',
      light: 'bg-rose-50 border-rose-100',
      text: 'text-rose-700'
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`relative overflow-hidden rounded-2xl border ${card.light} p-5 shadow-sm hover:shadow-md transition-shadow`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${card.text} opacity-70`}>
                {card.label}
              </p>
              <p className={`text-2xl font-bold mt-1 ${card.text}`}>
                {card.value}
              </p>
              <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
            </div>
            <span className="text-3xl opacity-80">{card.icon}</span>
          </div>
          {/* Progress bar for collected */}
          {card.label === 'Total Collected' && totalExpected > 0 && (
            <div className="mt-3 h-1.5 bg-white/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, pct(totalCollected, totalExpected))}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
