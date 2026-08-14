// components/StudentHomeworkTab.jsx
// Homework tab for the admin Student Profile. Homework is assigned per class, so
// we fetch the student's class homework and read this student's own status from
// each homework's studentStatuses[]. Search + status filter included.
import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { EmptyState, LoadingState } from './ui';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Derive a display status for THIS student from a homework record.
function deriveStatus(hw, studentId) {
  const mine = (hw.studentStatuses || []).find(s => (s.student?._id || s.student)?.toString() === studentId?.toString());
  const done = mine?.status === 'completed';
  if (done) return { key: 'submitted', label: 'Submitted', bg: 'var(--sage-soft,#eef4ef)', fg: 'var(--sage,#4a7c59)' };
  const overdue = hw.dueDate && new Date(hw.dueDate) < new Date();
  return overdue
    ? { key: 'overdue', label: 'Overdue', bg: 'var(--danger-soft,#fdecec)', fg: 'var(--danger,#dc2626)' }
    : { key: 'pending', label: 'Pending', bg: 'var(--gold-soft,#f8f1e2)', fg: 'var(--gold,#b8862b)' };
}

export default function StudentHomeworkTab({ studentId, classId }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoad]  = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    setLoad(true);
    const params = classId ? { class: classId } : {};
    api.get('/homework', { params })
      .then(r => { if (alive) setItems(r.data?.data || r.data || []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoad(false); });
    return () => { alive = false; };
  }, [classId]);

  const rows = useMemo(() => {
    return items
      .map(hw => ({ hw, st: deriveStatus(hw, studentId) }))
      .filter(({ hw, st }) => {
        if (filter !== 'all' && st.key !== filter) return false;
        if (search) {
          const q = search.toLowerCase();
          return (hw.title || '').toLowerCase().includes(q) || (hw.subject?.name || '').toLowerCase().includes(q);
        }
        return true;
      });
  }, [items, studentId, search, filter]);

  if (loading) return <LoadingState rows={4} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input className="form-input" style={{ maxWidth: 260 }} placeholder="Search homework…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-input" style={{ maxWidth: 170 }} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="submitted">Submitted</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {rows.length === 0 ? <EmptyState icon="📚" title="No homework" subtitle="Nothing matches the current filter." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(({ hw, st }) => (
            <div key={hw._id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-sm" style={{ color: 'var(--color-ink)' }}>{hw.title}</p>
                  <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    {hw.subject?.name || '—'}{hw.teacherName ? ` · ${hw.teacherName}` : ''}
                  </p>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: st.bg, color: st.fg, whiteSpace: 'nowrap' }}>{st.label}</span>
              </div>
              <div className="flex items-center justify-between mt-2" style={{ flexWrap: 'wrap', gap: 6 }}>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  📅 Assigned: {fmt(hw.assignedDate)} · Due: {fmt(hw.dueDate)}
                </p>
                {hw.attachments?.length > 0 && (
                  <a href={hw.attachments[0].url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent,#d4522a)', fontWeight: 600 }}>📎 Attachment</a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}