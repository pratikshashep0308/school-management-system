// components/StudentBehaviourTab.jsx
// Behaviour Notes tab for the admin Student Profile. Uses the existing per-student
// history endpoint (GET /behavioural-notes/:studentId?history=1). Shows summary
// cards + a chronological list. The backend categories are general/positive/
// concern — mapped to Positive / Negative / Neutral for display.
import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { EmptyState, LoadingState } from './ui';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TYPE = {
  positive: { label: 'Positive', bg: 'var(--sage-soft,#eef4ef)', fg: 'var(--sage,#4a7c59)', dot: '#4a7c59' },
  concern:  { label: 'Negative', bg: 'var(--danger-soft,#fdecec)', fg: 'var(--danger,#dc2626)', dot: '#dc2626' },
  general:  { label: 'Neutral',  bg: 'var(--color-warm,#f2ede6)', fg: 'var(--color-slate,#4a453f)', dot: '#8a8178' },
};
const typeOf = (c) => TYPE[c] || TYPE.general;

export default function StudentBehaviourTab({ studentId }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoad] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoad(true);
    api.get(`/behavioural-notes/${studentId}`, { params: { history: 1 } })
      .then(r => { if (alive) setNotes(r.data?.data || r.data?.notes || r.data || []); })
      .catch(() => { if (alive) setNotes([]); })
      .finally(() => { if (alive) setLoad(false); });
    return () => { alive = false; };
  }, [studentId]);

  const counts = useMemo(() => {
    const c = { positive: 0, concern: 0, general: 0 };
    notes.forEach(n => { c[n.category] = (c[n.category] || 0) + 1; });
    return c;
  }, [notes]);

  if (loading) return <LoadingState rows={4} />;

  const summary = [
    { label: 'Positive Notes', value: counts.positive, color: 'var(--sage,#4a7c59)' },
    { label: 'Negative Notes', value: counts.concern,  color: 'var(--danger,#dc2626)' },
    { label: 'Neutral Notes',  value: counts.general,  color: 'var(--color-muted,#8a8178)' },
    { label: 'Total Notes',    value: notes.length,    color: 'var(--accent,#d4522a)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
        {summary.map(s => (
          <div key={s.label} className="card p-4">
            <div className="font-display text-3xl leading-none" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Chronological notes */}
      {notes.length === 0 ? <EmptyState icon="📝" title="No behaviour notes" subtitle="Notes recorded by staff will appear here." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notes.map(n => {
            const t = typeOf(n.category);
            return (
              <div key={n._id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: t.bg, color: t.fg }}>{t.label}</span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{fmt(n.date)}</span>
                </div>
                <p className="text-sm mt-2" style={{ color: 'var(--color-slate)' }}>{n.note || '—'}</p>
                {n.createdByName && <p className="text-xs mt-2" style={{ color: 'var(--color-muted)' }}>— {n.createdByName}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}