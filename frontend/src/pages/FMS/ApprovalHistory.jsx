// frontend/src/pages/FMS/ApprovalHistory.jsx
//
// What has already been approved. Route /fms/approvals/history.
//
// ─── WHY THIS IS SEPARATE FROM THE INBOX ─────────────────────────────────────
// The inbox answers "what needs me now" and empties as things are actioned.
// That is correct behaviour and also means every approval a person has ever
// given disappears the moment they give it.
//
// This is the other half: a standing record of what was approved, by whom, when
// and for how much. It is the screen somebody opens to answer "did we approve
// that?" — which is asked far more often than "what is pending?".
//
// Reads fms_expenseapprovals, which is the audit record of each action, not the
// expense documents. An expense can be edited; an approval action cannot.

import React, { useCallback, useEffect, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import ErrorBanner from '../../components/fms/ErrorBanner';
import Money from '../../components/fms/Money';

const STEPS = ['', 'accounts', 'deptHead', 'principal', 'chairman', 'trustee'];
const ACTIONS = ['', 'verify', 'approve', 'reject', 'return'];

const ACTION_TONE = {
  verify: 'var(--info)',
  approve: 'var(--sage)',
  reject: 'var(--danger)',
  return: 'var(--gold)',
};

const PAGE = 25;

const ApprovalHistory = () => {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [step, setStep] = useState('');
  const [action, setAction] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Who am I? Needed for the "only mine" filter, which is the common case —
  // an approver usually wants their own record, not the school's.
  useEffect(() => {
    fmsAPI.checkFinanceSession()
      .then((r) => {
        const d = r?.data?.data ?? r?.data;
        setMe(d?.userId || d?.id || null);
      })
      .catch(() => setMe(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fmsAPI.getApprovalLog({
        page,
        limit: PAGE,
        step: step || undefined,
        action: action || undefined,
        actor: mineOnly && me ? me : undefined,
      });
      const body = res?.data ?? {};
      setRows(body.data || []);
      setTotal(body.pagination?.total ?? (body.data || []).length);
    } catch (err) {
      setError(err);
    } finally { setLoading(false); }
  }, [page, step, action, mineOnly, me]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  const Filter = ({ label, value, set: setter, options }) => (
    <label className="text-xs">
      <span className="text-[var(--muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => { setter(e.target.value); setPage(1); }}
        className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-xs"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o === '' ? 'All' : o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <FmsLayout
      title="Approval History"
      actions={
        <button type="button" onClick={load} disabled={loading}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      }
    >
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-relaxed">
        <p>
          Every approval, verification, rejection and return that has been recorded — newest
          first. The inbox shows what is waiting; this shows what has already been decided.
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          These entries are the audit record of each action and are never edited or removed.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Filter label="Step" value={step} set={setStep} options={STEPS} />
        <Filter label="Action" value={action} set={setAction} options={ACTIONS} />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={mineOnly}
            disabled={!me}
            onChange={(e) => { setMineOnly(e.target.checked); setPage(1); }}
          />
          Only what I acted on
        </label>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-white p-4">
        {loading && rows.length === 0 && (
          <p className="text-xs text-[var(--muted)]">Loading…</p>
        )}

        {!loading && rows.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            Nothing recorded yet
            {(step || action || mineOnly) ? ' for these filters.' : '.'}
          </p>
        )}

        {rows.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Expense</th>
                <th className="py-2 pr-3 font-medium">Step</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">By</th>
                <th className="py-2 pr-3 text-right font-medium">Amount</th>
                <th className="py-2 font-medium">Comment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2.5 pr-3 text-xs">
                    {r.actedAt ? new Date(r.actedAt).toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">{r.expenseNumber || '—'}</td>
                  <td className="py-2.5 pr-3 text-xs capitalize">{r.step}</td>
                  <td className="py-2.5 pr-3 text-xs font-medium"
                    style={{ color: ACTION_TONE[r.action] || 'var(--muted)' }}>
                    {r.action}
                  </td>
                  <td className="py-2.5 pr-3 text-xs">
                    {r.actorName || r.actorEmail || '—'}
                    {r.actorRole && (
                      <span className="ml-1 text-[var(--muted)]">· {r.actorRole}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    {/* The amount AT THE TIME of the action. An expense edited
                        afterwards must not rewrite what was approved. */}
                    <Money paise={r.amountAtAction ?? r.totalAmount ?? 0} />
                  </td>
                  <td className="py-2.5 text-xs italic text-[var(--muted)]">
                    {r.comment || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pages > 1 && (
          <div className="mt-3 flex items-center gap-3 text-xs">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="rounded border border-[var(--border)] px-2 py-0.5 disabled:opacity-30">
              Previous
            </button>
            <span className="text-[var(--muted)]">
              Page {page} of {pages} · {total} action{total === 1 ? '' : 's'}
            </span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
              className="rounded border border-[var(--border)] px-2 py-0.5 disabled:opacity-30">
              Next
            </button>
          </div>
        )}
      </div>
    </FmsLayout>
  );
};

export default ApprovalHistory;
