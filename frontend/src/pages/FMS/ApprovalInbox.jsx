// frontend/src/pages/FMS/ApprovalInbox.jsx
//
// Approval inbox — SCR-18. Route /fms/approvals.
//
// ─── THE CAPABILITY THE SMS DOES NOT HAVE ────────────────────────────────────
// The school management system records expenses but has no approval chain.
// This is the clearest thing the finance module adds that the school cannot do
// today.
//
// ─── THE ROUTING IS THE BACKEND'S JOB ────────────────────────────────────────
// The backend decides who may act, in what order, and enforces that nobody
// approves their own request or occupies two steps of the same chain. The inbox
// already excludes anything this person cannot act on.
//
// This screen does not recompute any of that. If it did, the two would
// eventually disagree — and then whether an expense could be approved would
// depend on which screen somebody happened to open.

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import fmsAPI from '../../utils/fmsAPI';
import { useFms } from '../../context/FmsContext';
import FmsLayout from '../../components/fms/FmsLayout';
import Money from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

/** How long an expense has been waiting — the thing that makes a queue urgent. */
function ageInDays(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

const AgeBadge = ({ days }) => {
  if (days === null) return null;

  const tone = days >= 7
    ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
    : days >= 3
      ? 'bg-[var(--gold-soft)] text-[var(--gold)]'
      : 'text-[var(--muted)]';

  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${tone}`}>
      {days === 0 ? 'today' : `${days}d`}
    </span>
  );
};

const ApprovalInbox = () => {
  const navigate = useNavigate();
  const { fmsRole } = useFms();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fmsAPI.getApprovalInbox({ limit: 100 });
      setData(res?.data?.data ?? res?.data ?? null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The ROUTE returns { success, count, pagination, role, data: [...] } — the
  // service's internal { total, items } shape never reaches the browser.
  const items = Array.isArray(data) ? data : (data?.items || data?.data || []);

  return (
    <FmsLayout
      title="Approvals"
      actions={
        <span className="self-center text-xs text-[var(--muted)]">
          {fmsRole ? `as ${fmsRole}` : ''}
        </span>
      }
    >
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-white" />)}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="Nothing waiting for you"
          reason="No expense requests are currently at a step your role can act on."
          hint="This list only shows what YOU can act on — it excludes your own requests, and anything you have already acted on in the same chain."
        />
      )}

      {!loading && items.length > 0 && (
        <>
          <p className="mb-3 text-sm text-[var(--muted)]">
            {items.length} request{items.length === 1 ? '' : 's'} waiting for you.
          </p>

          <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--canvas)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Number</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Department</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Purpose</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Amount</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Waiting on</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Age</th>
                </tr>
              </thead>

              <tbody>
                {items.map((e) => (
                  <tr
                    key={e._id}
                    onClick={() => navigate(`/fms/approvals/${e._id}`)}
                    className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--canvas)]"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{e.expenseNumber}</td>
                    <td className="px-4 py-3">{e.department?.name || '—'}</td>
                    <td className="max-w-xs truncate px-4 py-3">{e.purpose}</td>
                    <td className="px-4 py-3 text-right"><Money paise={e.totalAmount} /></td>
                    <td className="px-4 py-3">
                      <div className="text-xs capitalize">{e.awaitingStep}</div>
                      {e.isFinalApproval && (
                        <div className="text-[10px] uppercase tracking-wide text-[var(--mod)]">
                          final step
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AgeBadge days={ageInDays(e.requestDate || e.createdAt)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
            This list is produced by the finance system, which already applies the approval
            rules — the amount thresholds, the order of steps, and the rule that nobody
            approves their own request or acts twice in the same chain.
          </p>
        </>
      )}
    </FmsLayout>
  );
};

export default ApprovalInbox;