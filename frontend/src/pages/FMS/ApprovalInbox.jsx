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


/**
 * What this person has already decided.
 *
 * Sits below the inbox rather than on a screen of its own. The inbox empties as
 * things are actioned, so without this an approver's own record disappears the
 * moment they give it — and "did I approve that?" is asked more often than
 * "what is pending?".
 *
 * Defaults to the signed-in person's OWN actions. The school-wide view is one
 * checkbox away, but it is not what somebody opening this screen usually wants.
 */
const MyApprovalHistory = () => {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [mineOnly, setMineOnly] = useState(true);
  // undefined = not looked up yet · null = looked up, not available · string = id
  const [me, setMe] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fmsAPI.checkFinanceSession()
      .then((r) => {
        const d = r?.data?.data ?? r?.data;
        setMe(d?.userId || null);
      })
      // Resolve to null on failure rather than leaving it undefined — the guard
      // below waits for a lookup to COMPLETE, not to succeed. Leaving it unset
      // left the section reading "Loading…" indefinitely.
      .catch(() => setMe(null));
  }, []);

  const load = useCallback(async () => {
    // Wait for the lookup to COMPLETE, not to succeed. Firing early would show
    // the whole school's log for a moment before correcting itself; waiting on
    // success meant waiting forever when the id was unavailable.
    if (me === undefined) return;

    // Looked up and there is no id — the personal filter cannot be applied, so
    // say so rather than silently showing everybody's actions under a heading
    // that claims they are yours.
    if (mineOnly && me === null) {
      setRows([]); setTotal(0); setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const res = await fmsAPI.getApprovalLog({
        page: 1,
        limit: expanded ? 50 : 5,
        actor: mineOnly && me ? me : undefined,
      });
      const body = res?.data ?? {};
      setRows(body.data || []);
      setTotal(body.pagination?.total ?? (body.data || []).length);
    } catch (err) {
      setError(err);
    } finally { setLoading(false); }
  }, [mineOnly, me, expanded]);

  useEffect(() => { load(); }, [load]);

  const TONE = {
    verify: 'var(--info)', approve: 'var(--sage)',
    reject: 'var(--danger)', return: 'var(--gold)',
  };

  return (
    <div className="mt-8 rounded-lg border border-[var(--border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            {mineOnly ? 'What you have decided' : 'What everybody has decided'}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            These entries are the audit record of each action and are never edited.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={!mineOnly} disabled={!me}
            onChange={(e) => setMineOnly(!e.target.checked)} />
          Show everybody
        </label>
      </div>

      {error && <ErrorBanner error={error} onRetry={load} className="mt-3" />}

      {loading && rows.length === 0 && (
        <p className="mt-3 text-xs text-[var(--muted)]">Loading…</p>
      )}

      {!loading && rows.length === 0 && !error && mineOnly && me === null && (
        <p className="mt-3 text-sm text-[var(--gold)]">
          Could not tell which actions are yours. Tick “Show everybody” to see the
          full record.
        </p>
      )}

      {!loading && rows.length === 0 && !error && !(mineOnly && me === null) && (
        <p className="mt-3 text-sm text-[var(--muted)]">
          {mineOnly
            ? 'You have not approved anything yet.'
            : 'Nothing has been approved yet.'}
        </p>
      )}

      {rows.length > 0 && (
        <>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Expense</th>
                <th className="py-2 pr-3 font-medium">Step</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                {!mineOnly && <th className="py-2 pr-3 font-medium">By</th>}
                <th className="py-2 pr-3 text-right font-medium">Amount</th>
                <th className="py-2 font-medium">Comment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2 pr-3 text-xs">
                    {r.actedAt ? new Date(r.actedAt).toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.expenseNumber || '—'}</td>
                  <td className="py-2 pr-3 text-xs capitalize">{r.step}</td>
                  <td className="py-2 pr-3 text-xs font-medium"
                    style={{ color: TONE[r.action] || 'var(--muted)' }}>
                    {r.action}
                  </td>
                  {!mineOnly && (
                    <td className="py-2 pr-3 text-xs">
                      {r.actorName || r.actorEmail || '—'}
                    </td>
                  )}
                  <td className="py-2 pr-3 text-right">
                    {/* The amount AT THE TIME of the action — an expense edited
                        afterwards must not rewrite what was signed off. */}
                    <Money paise={r.amountAtAction ?? r.totalAmount ?? 0} />
                  </td>
                  <td className="py-2 text-xs italic text-[var(--muted)]">
                    {r.comment || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > rows.length && !expanded && (
            <button type="button" onClick={() => setExpanded(true)}
              className="mt-3 rounded border border-[var(--border)] px-2 py-1 text-xs">
              Show more ({total} in total)
            </button>
          )}
        </>
      )}
    </div>
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

      <MyApprovalHistory />
    </FmsLayout>
  );
};

export default ApprovalInbox;