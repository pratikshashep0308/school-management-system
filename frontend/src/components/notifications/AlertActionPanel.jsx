// components/notifications/AlertActionPanel.jsx
// Lets staff record what was done about an alert: a status dropdown, free-text
// details, and a full audit history (who, when, what). Resolved alerts drop off
// the dashboard but stay visible here.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { notificationAPI } from '../../utils/api';

export const ACTION_STATUS = {
  pending:            { label: 'Pending',            bg: '#FEF3C7', fg: '#92400E' },
  in_progress:        { label: 'In Progress',        bg: '#DBEAFE', fg: '#1E40AF' },
  resolved:           { label: 'Resolved',           bg: '#DCFCE7', fg: '#166534' },
  no_action_required: { label: 'No Action Required', bg: '#F3F4F6', fg: '#4B5563' },
};

const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—';

const INP = {
  width: '100%', padding: '8px 12px', border: '1.5px solid #E5E7EB',
  borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff',
  boxSizing: 'border-box',
};

export default function AlertActionPanel({ notification, onSaved }) {
  const n = notification;
  const [open,    setOpen]    = useState(false);
  const [status,  setStatus]  = useState(n.actionStatus || 'pending');
  const [details, setDetails] = useState(n.actionDetails || '');
  const [saving,  setSaving]  = useState(false);
  const [showLog, setShowLog] = useState(false);

  const current = ACTION_STATUS[n.actionStatus || 'pending'];
  const log = n.actionLog || [];

  const save = async () => {
    if (status === 'pending') {
      return toast.error('Please choose an action from the dropdown');
    }
    if (status !== 'no_action_required' && !details.trim()) {
      return toast.error('Please describe the action taken');
    }
    setSaving(true);
    try {
      await notificationAPI.recordAction(n._id, { actionStatus: status, actionDetails: details.trim() });
      toast.success('Action recorded');
      setOpen(false);
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record action');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F3F4F6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
          background: current.bg, color: current.fg,
        }}>
          {current.label}
        </span>

        {n.actionByName && (
          <span style={{ fontSize: 11.5, color: '#6B7280' }}>
            by {n.actionByName} · {fmt(n.actionAt)}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {log.length > 0 && (
            <button onClick={() => setShowLog(v => !v)}
              style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                border: '1px solid #E5E7EB', background: '#fff', color: '#4B5563', cursor: 'pointer' }}>
              {showLog ? 'Hide history' : `History (${log.length})`}
            </button>
          )}
          <button onClick={() => setOpen(v => !v)}
            style={{ padding: '4px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 700,
              border: '1px solid #1D4ED8', background: '#fff', color: '#1D4ED8', cursor: 'pointer' }}>
            {open ? 'Cancel' : (n.actionStatus && n.actionStatus !== 'pending' ? 'Update action' : 'Record action')}
          </button>
        </div>
      </div>

      {n.actionDetails && !open && (
        <div style={{ fontSize: 12.5, color: '#4B5563', marginTop: 6 }}>
          {n.actionDetails}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10, padding: 12, background: '#F9FAFB', borderRadius: 9, border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                Action Taken *
              </label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={INP}>
                <option value="pending">— Select —</option>
                <option value="resolved">Resolved</option>
                <option value="in_progress">In Progress</option>
                <option value="no_action_required">No Action Required</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                Action Details
              </label>
              <textarea rows={3} value={details} onChange={e => setDetails(e.target.value)}
                placeholder="Describe what was done about this alert…"
                style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setOpen(false)} disabled={saving}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB',
                  background: '#fff', color: '#6B7280', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none',
                  background: '#1D4ED8', color: '#fff', fontSize: 12.5, fontWeight: 700,
                  cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLog && log.length > 0 && (
        <div style={{ marginTop: 10, padding: 12, background: '#F9FAFB', borderRadius: 9, border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Audit history
          </div>
          {log.slice().reverse().map((e, i) => {
            const st = ACTION_STATUS[e.status] || ACTION_STATUS.pending;
            return (
              <div key={i} style={{ padding: '7px 0', borderBottom: i < log.length - 1 ? '1px solid #E5E7EB' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.fg }}>
                    {st.label}
                  </span>
                  <span style={{ fontSize: 11, color: '#6B7280' }}>
                    {e.userName || 'Unknown'}{e.userRole ? ` (${e.userRole})` : ''} · {fmt(e.at)}
                  </span>
                </div>
                {e.details && (
                  <div style={{ fontSize: 12, color: '#4B5563', marginTop: 4 }}>{e.details}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}