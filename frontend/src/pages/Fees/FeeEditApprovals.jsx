// pages/Fees/FeeEditApprovals.jsx
// Pending fee-edit requests awaiting a second administrator's approval, plus a
// full log of every request (who asked, who reviewed, what changed, when).
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, LoadingState } from '../../components/ui';

const STATUS = {
  pending:  { label: 'Awaiting approval', bg: 'var(--gold-soft,#fdf0e3)', fg: 'var(--gold,#e06a00)' },
  approved: { label: 'Approved',          bg: 'var(--sage-soft,#e8f4ec)', fg: 'var(--sage,#128a4a)' },
  rejected: { label: 'Rejected',          bg: 'var(--danger-soft,#fcecec)', fg: 'var(--danger,#d21f1f)' },
};

const FIELD_LABEL = {
  amount: 'Amount', method: 'Payment method', paidOn: 'Paid on',
  transactionId: 'Transaction ID', remarks: 'Remarks', month: 'Month', year: 'Year',
};

const fmtVal = (field, v) => {
  if (v === '' || v === null || v === undefined) return '—';
  if (field === 'amount') return `₹${Number(v).toLocaleString('en-IN')}`;
  if (field === 'paidOn') return new Date(v).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  return String(v);
};
const fmtWhen = (d) => d ? new Date(d).toLocaleString('en-IN', {
  day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit',
}) : '—';

// mode='approvals' → pending action queue only
// mode='logs'      → full history with status + search filters
export default function FeeEditApprovals({ mode = 'approvals' }) {
  const isLogs = mode === 'logs';
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState(mode === 'logs' ? 'all' : 'pending');
  const [search, setSearch]     = useState('');
  const [busyId, setBusyId]     = useState(null);
  // Which request cards have their payment-review panel open
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await feeAPI.getEditRequests(filter === 'all' ? {} : { status: filter });
      setRequests(r.data.data || []);
    } catch { toast.error('Failed to load edit requests'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const review = async (id, action) => {
    const note = action === 'reject'
      ? (window.prompt('Reason for rejecting (optional):') ?? '')
      : '';
    setBusyId(id);
    try {
      await feeAPI.reviewEditRequest(id, { action, note });
      toast.success(action === 'approve' ? 'Edit approved and applied' : 'Request rejected');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to review request');
    } finally { setBusyId(null); }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  // Logs mode can additionally search by student name or receipt number.
  const visibleRequests = !search.trim() ? requests : requests.filter(r => {
    const q = search.toLowerCase();
    return (r.student?.user?.name || '').toLowerCase().includes(q)
        || (r.receiptNumber || '').toLowerCase().includes(q)
        || (r.requestedByName || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div>
        <h3 style={{ fontSize:17, fontWeight:800, color:'var(--color-ink,#111827)', margin:0 }}>
          {isLogs ? '🧾 Fee Edit Logs' : '🔐 Fee Edit Approvals'}
        </h3>
        <p style={{ fontSize:12.5, color:'var(--color-muted,#6B7280)', marginTop:3 }}>
          {isLogs
            ? 'Complete history of every fee edit — who requested it, what changed, who reviewed it and when.'
            : 'Edits to recorded payments must be approved by a second administrator before they take effect.'}
        </p>
      </div>

      {/* Approvals = pending queue only. Logs = filters + search. */}
      {isLogs ? (
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[
              { k:'all',      label:'All' },
              { k:'pending',  label:'Pending' },
              { k:'approved', label:'Approved' },
              { k:'rejected', label:'Rejected' },
            ].map(t => (
              <button key={t.k} onClick={() => setFilter(t.k)}
                style={{ padding:'7px 15px', borderRadius:20, fontSize:12.5, fontWeight:700, cursor:'pointer',
                  border:'1px solid var(--color-border,#E5E7EB)',
                  background: filter===t.k ? 'var(--accent,#0f6cbd)' : 'var(--color-paper,#fff)',
                  color:      filter===t.k ? '#fff' : 'var(--color-slate,#4B5563)' }}>
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student or receipt…"
            style={{ padding:'8px 12px', border:'1.5px solid var(--color-border,#E5E7EB)', borderRadius:9,
              fontSize:12.5, outline:'none', minWidth:220, flex:'0 1 260px',
              background:'var(--color-paper,#fff)', color:'var(--color-ink,#111827)' }} />
        </div>
      ) : pendingCount > 0 && (
        <div style={{ fontSize:12.5, color:'var(--color-muted,#6B7280)' }}>
          {pendingCount} {pendingCount === 1 ? 'request' : 'requests'} awaiting approval
        </div>
      )}

      {loading ? <LoadingState rows={4} /> : visibleRequests.length === 0 ? (
        <EmptyState icon={isLogs ? '🧾' : '🔐'}
          title={isLogs ? 'No fee edits recorded' : 'Nothing to approve'}
          subtitle={isLogs
            ? (search || filter !== 'all' ? 'Nothing matches these filters.' : 'Fee edit activity will appear here.')
            : 'No fee edits are waiting for approval.'} />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {visibleRequests.map(r => {
            const s = STATUS[r.status] || STATUS.pending;
            const isOwn = String(r.requestedBy?._id || r.requestedBy) === String(user?._id || user?.id);
            return (
              <div key={r._id} style={{
                background:'var(--color-paper,#fff)', border:'1px solid var(--color-border,#E5E7EB)',
                borderRadius:12, padding:16, borderLeft:`3px solid ${s.fg}`,
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:999, background:s.bg, color:s.fg }}>
                        {s.label}
                      </span>
                      <span style={{ fontSize:14, fontWeight:700, color:'var(--color-ink,#111827)' }}>
                        {r.student?.user?.name || 'Student'}
                      </span>
                      <span style={{ fontSize:11.5, color:'var(--color-muted,#6B7280)', fontFamily:'monospace' }}>
                        {r.receiptNumber}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--color-muted,#6B7280)', marginTop:5 }}>
                      Requested by <b>{r.requestedByName || r.requestedBy?.name || '—'}</b>
                      {r.requestedBy?.role ? ` (${r.requestedBy.role})` : ''} · {fmtWhen(r.requestedAt)}
                    </div>
                  </div>

                  {!isLogs && r.status === 'pending' && (
                    <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                      {isOwn ? (
                        <span style={{ fontSize:11.5, color:'var(--color-muted,#6B7280)', maxWidth:190, textAlign:'right' }}>
                          You raised this — another admin must approve it.
                        </span>
                      ) : (
                        <>
                          <button onClick={() => review(r._id, 'reject')} disabled={busyId===r._id}
                            style={{ padding:'7px 14px', borderRadius:8, fontSize:12.5, fontWeight:700, cursor:'pointer',
                              border:'1px solid var(--danger,#d21f1f)', background:'var(--color-paper,#fff)', color:'var(--danger,#d21f1f)' }}>
                            Reject
                          </button>
                          <button onClick={() => review(r._id, 'approve')} disabled={busyId===r._id}
                            style={{ padding:'7px 16px', borderRadius:8, fontSize:12.5, fontWeight:700, cursor:'pointer',
                              border:'none', background:'var(--sage,#128a4a)', color:'#fff', opacity: busyId===r._id?0.7:1 }}>
                            {busyId===r._id ? 'Working…' : '✓ Approve'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* The proposed changes */}
                <div style={{ marginTop:10, display:'flex', flexWrap:'wrap', gap:6 }}>
                  {(r.changes || []).map((c, i) => (
                    <span key={i} style={{
                      fontSize:11.5, padding:'4px 10px', borderRadius:8,
                      background:'var(--color-warm,#F9FAFB)', border:'1px solid var(--color-border,#E5E7EB)',
                      color:'var(--color-slate,#4B5563)',
                    }}>
                      {FIELD_LABEL[c.field] || c.field}: <b style={{ textDecoration:'line-through', opacity:.7 }}>{fmtVal(c.field, c.from)}</b>
                      {' → '}<b style={{ color:'var(--color-ink,#111827)' }}>{fmtVal(c.field, c.to)}</b>
                    </span>
                  ))}
                </div>

                {r.reason && (
                  <div style={{ fontSize:12, color:'var(--color-slate,#4B5563)', marginTop:8, fontStyle:'italic' }}>
                    Reason: "{r.reason}"
                  </div>
                )}

                {/* Review panel — the approver needs to see the payment being
                    changed, not just the isolated before/after values. */}
                {r.payment && (
                  <div style={{ marginTop:10 }}>
                    <button
                      onClick={() => setExpanded(e => ({ ...e, [r._id]: !e[r._id] }))}
                      style={{ padding:'5px 12px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
                        border:'1px solid var(--color-border,#E5E7EB)', background:'var(--color-paper,#fff)',
                        color:'var(--accent,#0f6cbd)' }}>
                      {expanded[r._id] ? '▲ Hide payment details' : '▼ Review payment details'}
                    </button>

                    {expanded[r._id] && (
                      <div style={{ marginTop:10, padding:14, borderRadius:10,
                        background:'var(--color-warm,#F9FAFB)', border:'1px solid var(--color-border,#E5E7EB)' }}>
                        <div style={{ fontSize:10.5, fontWeight:700, color:'var(--color-muted,#6B7280)',
                          textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
                          {r.status === 'approved'
                            ? 'Payment record (edit already applied)'
                            : 'Current payment record'}
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
                          {[
                            ['Student',   r.student?.user?.name || '—'],
                            ['Class',     r.student?.class ? `${r.student.class.name} ${r.student.class.section || ''}`.trim() : '—'],
                            ['Roll No',   r.student?.rollNumber || '—'],
                            ['Receipt',   r.receiptNumber || '—'],
                            ['Amount',    r.payment.amount != null ? `₹${Number(r.payment.amount).toLocaleString('en-IN')}` : '—'],
                            ['Method',    r.payment.method || '—'],
                            ['Paid on',   r.payment.paidOn ? new Date(r.payment.paidOn).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'],
                            ['Period',    [r.payment.month, r.payment.year].filter(Boolean).join(' ') || '—'],
                            ['Txn ID',    r.payment.transactionId || '—'],
                          ].map(([k,v]) => (
                            <div key={k}>
                              <div style={{ fontSize:10, color:'var(--color-muted,#6B7280)', textTransform:'uppercase', letterSpacing:'0.04em' }}>{k}</div>
                              <div style={{ fontSize:13, fontWeight:600, color:'var(--color-ink,#111827)', marginTop:2 }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {r.payment.remarks && (
                          <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--color-border,#E5E7EB)' }}>
                            <div style={{ fontSize:10, color:'var(--color-muted,#6B7280)', textTransform:'uppercase' }}>Remarks</div>
                            <div style={{ fontSize:12.5, color:'var(--color-slate,#4B5563)', marginTop:2 }}>{r.payment.remarks}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {r.status !== 'pending' && (
                  <div style={{ fontSize:12, color:'var(--color-muted,#6B7280)', marginTop:8, paddingTop:8, borderTop:'1px solid var(--color-border,#F3F4F6)' }}>
                    {r.status === 'approved' ? 'Approved' : 'Rejected'} by <b>{r.reviewedByName || r.reviewedBy?.name || '—'}</b> · {fmtWhen(r.reviewedAt)}
                    {r.reviewNote ? ` · "${r.reviewNote}"` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}