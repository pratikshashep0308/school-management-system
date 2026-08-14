// frontend/src/components/admissions/StatsCards.js
import React from 'react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function StatsCards({ stats }) {
  const s = stats?.status || {};
  const byClass  = stats?.byClass  || [];
  const monthly  = stats?.monthly  || [];
  const bySource = stats?.bySource || [];

  const cards = [
    { label: 'Total Applications', value: s.total || 0,        icon: '📋', color: 'from-slate-100 to-slate-200',   text: 'text-slate-700'   },
    { label: 'Pending Review',     value: (s.pending || 0) + (s.under_review || 0), icon: '⏳', color: 'from-amber-50 to-amber-100',   text: 'text-amber-700'   },
    { label: 'Approved',           value: s.approved || 0,     icon: '✅', color: 'from-emerald-50 to-emerald-100', text: 'text-emerald-700' },
    { label: 'Enrolled',           value: s.enrolled || 0,     icon: '🎓', color: 'from-teal-50 to-teal-100',       text: 'text-teal-700'    },
    { label: 'Interviews',         value: s.interview_scheduled || 0, icon: '🗓', color: 'from-violet-50 to-violet-100', text: 'text-violet-700' },
    { label: 'Conversion Rate',    value: `${s.conversionRate || 0}%`, icon: '📈', color: 'from-blue-50 to-blue-100',   text: 'text-blue-700'    },
    { label: 'Rejected',           value: s.rejected || 0,     icon: '❌', color: 'from-red-50 to-red-100',         text: 'text-red-700'     },
    { label: 'Waitlisted',         value: s.waitlisted || 0,   icon: '⏸', color: 'from-orange-50 to-orange-100',   text: 'text-orange-700'  },
  ];

  return (
    <div className="space-y-4">
      {/* Main stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {cards.map(card => (
          <div key={card.label} className={`bg-gradient-to-br ${card.color} rounded-2xl p-4 border border-white/60`}>
            <div className="text-2xl mb-1">{card.icon}</div>
            <div className={`text-xl font-bold ${card.text}`}>{card.value}</div>
            <div className="text-xs text-slate-500 mt-0.5 leading-tight">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Secondary charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Monthly trend */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Monthly Trend</h3>
          {monthly.length === 0 ? (
            <p className="text-slate-400 text-xs">No data yet</p>
          ) : (
            <div className="flex items-end gap-1.5 h-16">
              {monthly.map((m, i) => {
                const max = Math.max(...monthly.map(x => x.count), 1);
                const h   = Math.round((m.count / max) * 100);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-indigo-500 rounded-sm transition-all"
                      style={{ height: `${h}%`, minHeight: '4px' }}
                      title={`${m.label}: ${m.count}`}
                    />
                    <span className="text-[9px] text-slate-400">{m.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* By Class */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Applications by Class</h3>
          {byClass.length === 0 ? (
            <p className="text-slate-400 text-xs">No data yet</p>
          ) : (
            <div className="space-y-1.5 max-h-24 overflow-y-auto">
              {byClass.slice(0, 6).map(c => {
                const max = Math.max(...byClass.map(x => x.count), 1);
                return (
                  <div key={c.class} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-14 flex-shrink-0">Grade {c.class}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(c.count / max) * 100}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-600 w-4">{c.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* By Source */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Source of Applications</h3>
          {bySource.length === 0 ? (
            <p className="text-slate-400 text-xs">No data yet</p>
          ) : (
            <div className="space-y-2">
              {bySource.map(src => {
                const icons = { online: '🌐', walk_in: '🚶', referral: '👥', agent: '🤝', unknown: '❓' };
                const total = bySource.reduce((a, b) => a + b.count, 0);
                return (
                  <div key={src.source} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{icons[src.source] || '📌'}</span>
                      <span className="text-xs text-slate-600 capitalize">{src.source?.replace('_', ' ') || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5">
                        <div className="h-full bg-teal-400 rounded-full" style={{ width: `${total > 0 ? (src.count / total) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs font-bold text-slate-600">{src.count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
