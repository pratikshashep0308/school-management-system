// pages/Attendance/AttendanceStatusBar.jsx
// Shows the submission state (submitted / pending approval / approved), who did
// what and when, and — for admins — an Approve button when an edit is awaiting
// sign-off. Shared by both Student and Employee attendance.
import React, { useState } from 'react';

const STATE = {
  draft: {
    label: 'Not submitted', icon: '📝',
    bg: 'var(--color-warm,#F9FAFB)', fg: 'var(--color-slate,#4B5563)', border: 'var(--color-border,#E5E7EB)',
  },
  submitted: {
    label: 'Submitted', icon: '✅',
    bg: 'var(--sage-soft,#e8f4ec)', fg: 'var(--sage,#128a4a)', border: 'rgba(18,138,74,0.25)',
  },
  pending_approval: {
    label: 'Edited — awaiting approval', icon: '⏳',
    bg: 'var(--gold-soft,#fdf0e3)', fg: 'var(--gold,#e06a00)', border: 'rgba(224,106,0,0.3)',
  },
  approved: {
    label: 'Approved & finalised', icon: '🔒',
    bg: 'var(--info-soft,#eaf3fb)', fg: 'var(--info,#0f6cbd)', border: 'rgba(15,108,189,0.25)',
  },
};

const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—';

const ACTION_LABEL = {
  submitted: 'Submitted', edited: 'Edited', approved: 'Approved', rejected: 'Rejected',
};

export default function AttendanceStatusBar({ submission, onApprove, approving }) {
  const [showLog, setShowLog] = useState(false);
  if (!submission) return null;

  const status = submission.status || 'draft';
  const s = STATE[status] || STATE.draft;
  const log = submission.auditLog || [];
  const needsApproval = status === 'pending_approval' && submission.canApprove;

  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12,
      padding: '12px 16px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 16 }}>{s.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: s.fg }}>{s.label}</div>
            <div style={{ fontSize: 11.5, color: 'var(--color-muted,#6B7280)', marginTop: 2 }}>
              {status === 'draft' && 'Mark every student, then submit.'}
              {status === 'submitted' && `By ${submission.submittedBy?.name || '—'} · ${fmt(submission.submittedAt)}`}
              {status === 'pending_approval' && `Edited by ${submission.lastEditedBy?.name || '—'} · ${fmt(submission.lastEditedAt)}`}
              {status === 'approved' && `Approved by ${submission.approvedBy?.name || '—'} · ${fmt(submission.approvedAt)}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {log.length > 0 && (
            <button onClick={() => setShowLog(v => !v)}
              style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${s.border}`,
                background: 'var(--color-paper,#fff)', color: s.fg, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {showLog ? 'Hide history' : `History (${log.length})`}
            </button>
          )}
          {needsApproval && (
            <button onClick={onApprove} disabled={approving}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none',
                background: 'var(--sage,#128a4a)', color: '#fff', fontSize: 12.5, fontWeight: 700,
                cursor: approving ? 'default' : 'pointer', opacity: approving ? 0.7 : 1 }}>
              {approving ? 'Approving…' : '✓ Approve'}
            </button>
          )}
        </div>
      </div>

      {showLog && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${s.border}`, paddingTop: 10 }}>
          {log.slice().reverse().map((e, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: i < log.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-ink,#111827)' }}>
                  {ACTION_LABEL[e.action] || e.action}
                  <span style={{ fontWeight: 500, color: 'var(--color-slate,#4B5563)' }}>
                    {' '}by {e.userName || e.user?.name || 'Unknown'}
                    {(e.userRole || e.user?.role) ? ` (${e.userRole || e.user?.role})` : ''}
                  </span>
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--color-muted,#6B7280)' }}>{fmt(e.at)}</span>
              </div>
              {e.note && (
                <div style={{ fontSize: 12, color: 'var(--color-slate,#4B5563)', marginTop: 3 }}>{e.note}</div>
              )}
              {e.changes?.length > 0 && (
                <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {e.changes.map((c, j) => (
                    <span key={j} style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 999,
                      background: 'var(--color-paper,#fff)', border: '1px solid var(--color-border,#E5E7EB)',
                      color: 'var(--color-slate,#4B5563)',
                    }}>
                      {c.name}: <b>{c.from}</b> → <b>{c.to}</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}