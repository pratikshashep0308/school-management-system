// pages/Attendance/AttendanceLogs.jsx
// Audit trail of every attendance submit / edit / approval across all classes
// and dates. Shows who did it, when, and exactly what changed.
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api, { classAPI } from '../../utils/api';
import { EmptyState, LoadingState } from '../../components/ui';

const ACTION = {
  submitted: { label: 'Submitted', icon: '✅', bg: 'var(--sage-soft,#e8f4ec)', fg: 'var(--sage,#128a4a)' },
  edited:    { label: 'Edited',    icon: '✏️', bg: 'var(--gold-soft,#fdf0e3)', fg: 'var(--gold,#e06a00)' },
  approved:  { label: 'Approved',  icon: '🔒', bg: 'var(--info-soft,#eaf3fb)', fg: 'var(--info,#0f6cbd)' },
  rejected:  { label: 'Rejected',  icon: '✖',  bg: 'var(--danger-soft,#fcecec)', fg: 'var(--danger,#d21f1f)' },
};

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—';
const fmtDay = (d) => d ? new Date(d).toLocaleDateString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric',
}) : '—';

const INP = {
  padding: '8px 12px', border: '1.5px solid var(--color-border,#E5E7EB)', borderRadius: 8,
  fontSize: 12.5, outline: 'none', background: 'var(--color-paper,#fff)',
  color: 'var(--color-ink,#111827)',
};

export default function AttendanceLogs() {
  const [logs, setLogs]       = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const LIMIT = 50;

  const [scope, setScope]     = useState('');
  const [classId, setClassId] = useState('');
  const [action, setAction]   = useState('');
  const [from, setFrom]       = useState('');
  const [to, setTo]           = useState('');

  useEffect(() => {
    classAPI.getAll().then(r => setClasses(r.data.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (scope)   params.scope = scope;
      if (classId) params.classId = classId;
      if (action)  params.action = action;
      if (from)    params.from = from;
      if (to)      params.to = to;
      const r = await api.get('/attendance/logs', { params });
      setLogs(r.data.data || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load attendance logs'); }
    finally { setLoading(false); }
  }, [scope, classId, action, from, to, page]);

  useEffect(() => { load(); }, [load]);

  const clearFilters = () => {
    setScope(''); setClassId(''); setAction(''); setFrom(''); setTo(''); setPage(1);
  };
  const hasFilters = scope || classId || action || from || to;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-ink,#111827)', margin: 0 }}>
          🧾 Attendance Logs
        </h3>
        <p style={{ fontSize: 12.5, color: 'var(--color-muted,#6B7280)', marginTop: 3 }}>
          Every submission, edit and approval — who did it, when, and what changed.
        </p>
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--color-paper,#fff)', border: '1px solid var(--color-border,#E5E7EB)',
        borderRadius: 12, padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted,#6B7280)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Type</label>
          <select value={scope} onChange={e => { setScope(e.target.value); setPage(1); }} style={INP}>
            <option value="">All</option>
            <option value="student">Students</option>
            <option value="employee">Employees</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted,#6B7280)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Class</label>
          <select value={classId} onChange={e => { setClassId(e.target.value); setPage(1); }} style={INP}>
            <option value="">All classes</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.name} {c.section || ''}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted,#6B7280)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Action</label>
          <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }} style={INP}>
            <option value="">All actions</option>
            <option value="submitted">Submitted</option>
            <option value="edited">Edited</option>
            <option value="approved">Approved</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted,#6B7280)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>From</label>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} style={INP} />
        </div>
        <div>
          <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted,#6B7280)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>To</label>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} style={INP} />
        </div>
        {hasFilters && (
          <button onClick={clearFilters}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border,#E5E7EB)',
              background: 'transparent', color: 'var(--color-slate,#4B5563)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            ✕ Clear
          </button>
        )}
      </div>

      {loading ? <LoadingState rows={5} /> : logs.length === 0 ? (
        <EmptyState icon="🧾" title="No attendance activity"
          subtitle={hasFilters ? 'Nothing matches these filters.' : 'Logs appear once attendance is submitted.'} />
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--color-muted,#6B7280)' }}>
            {total} {total === 1 ? 'entry' : 'entries'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {logs.map((l, i) => {
              const a = ACTION[l.action] || ACTION.submitted;
              return (
                <div key={i} style={{
                  background: 'var(--color-paper,#fff)', border: '1px solid var(--color-border,#E5E7EB)',
                  borderRadius: 12, padding: 14, borderLeft: `3px solid ${a.fg}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                        background: a.bg, color: a.fg,
                      }}>{a.icon} {a.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink,#111827)' }}>
                        {l.userName}
                      </span>
                      {l.userRole && (
                        <span style={{ fontSize: 11, color: 'var(--color-muted,#6B7280)' }}>({l.userRole})</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--color-muted,#6B7280)' }}>{fmtDateTime(l.at)}</span>
                  </div>

                  <div style={{ fontSize: 12.5, color: 'var(--color-slate,#4B5563)', marginTop: 6 }}>
                    {l.scope === 'employee' ? '👤 Employee attendance' : `👥 ${l.class || 'Class'}`}
                    {' · '}for {fmtDay(l.date)}
                  </div>

                  {l.note && (
                    <div style={{ fontSize: 12, color: 'var(--color-slate,#4B5563)', marginTop: 4, fontStyle: 'italic' }}>
                      "{l.note}"
                    </div>
                  )}

                  {l.changes?.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {l.changes.map((c, j) => (
                        <span key={j} style={{
                          fontSize: 11, padding: '3px 9px', borderRadius: 999,
                          background: 'var(--color-warm,#F9FAFB)', border: '1px solid var(--color-border,#E5E7EB)',
                          color: 'var(--color-slate,#4B5563)',
                        }}>
                          {c.name}: <b>{c.from}</b> → <b>{c.to}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--color-border,#E5E7EB)',
                  background: 'var(--color-paper,#fff)', fontSize: 12.5, fontWeight: 600,
                  cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>
                ← Prev
              </button>
              <span style={{ fontSize: 12.5, color: 'var(--color-muted,#6B7280)' }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--color-border,#E5E7EB)',
                  background: 'var(--color-paper,#fff)', fontSize: 12.5, fontWeight: 600,
                  cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}