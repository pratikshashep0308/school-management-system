// frontend/src/pages/FMS/ApprovalAction.jsx
//
// Approval detail and action — SCR-19 / SCR-16. Route /fms/approvals/:id.
//
// ─── THE BUDGET OUTCOME HAS FOUR VALUES, NOT TWO ─────────────────────────────
// ok · warning · exceeded · notChecked
//
// `notChecked` means NO BUDGET EXISTED for that head. It is not a pass, and
// showing it as one would let spending through against a head nobody had
// budgeted for — while the screen said everything was fine.
//
// ─── ACTIONS CALL THE BACKEND AND SHOW WHAT COMES BACK ───────────────────────
// Including a refusal. The backend's messages name the actual problem — "Out of
// order: the next step is 'principal'" — which is more useful than anything a
// disabled button could convey.

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import Money from '../../components/fms/Money';
import ErrorBanner from '../../components/fms/ErrorBanner';

const BUDGET_TONE = {
  ok:         { label: 'Within budget',            cls: 'border-[var(--border)] bg-white' },
  warning:    { label: 'Near the budget limit',    cls: 'border-[var(--gold)] bg-[var(--gold-soft)]' },
  exceeded:   { label: 'Over budget',              cls: 'border-[var(--danger)] bg-[var(--danger-soft)]' },
  // Deliberately NOT green. "No budget exists" is not approval.
  notChecked: { label: 'No budget was set for this head', cls: 'border-[var(--gold)] bg-[var(--gold-soft)]' },
};

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-6 border-b border-[var(--border)] py-2 last:border-0">
    <dt className="shrink-0 text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt>
    <dd className="min-w-0 text-right text-sm">{children}</dd>
  </div>
);

const ApprovalAction = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [expense, setExpense] = useState(null);
  const [position, setPosition] = useState(null);
  const [history, setHistory] = useState([]);
  const [budget, setBudget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [acting, setActing] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [reason, setReason] = useState('');
  const [showReasonFor, setShowReasonFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [e, p, h] = await Promise.all([
        fmsAPI.getExpense(id),
        fmsAPI.getApprovalPosition(id),
        fmsAPI.getApprovalHistory(id),
      ]);
      setExpense(e?.data?.data ?? e?.data ?? null);
      setPosition(p?.data?.data ?? p?.data ?? null);
      setHistory(h?.data?.data?.approvals ?? h?.data?.approvals ?? h?.data?.data ?? []);

      try {
        const b = await fmsAPI.getBudgetCheck(id);
        setBudget(b?.data?.data ?? b?.data ?? null);
      } catch (_) {
        // A budget check that cannot run is not a reason to hide the expense.
        setBudget(null);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (action) => {
    // Reject and return require a reason — the person who raised it needs to
    // know what to change.
    if ((action === 'reject' || action === 'return') && !reason.trim()) {
      setShowReasonFor(action);
      return;
    }

    setActing(action);
    setActionError(null);

    try {
      const body = reason.trim() ? { reason: reason.trim(), comment: reason.trim() } : {};
      if (action === 'approve') await fmsAPI.approveExpense(id, body);
      else if (action === 'verify') await fmsAPI.verifyExpense(id, body);
      else if (action === 'reject') await fmsAPI.rejectExpense(id, body);
      else if (action === 'return') await fmsAPI.returnExpense(id, body);

      navigate('/fms/approvals');
    } catch (err) {
      // Whatever the backend says, verbatim — it names the actual problem.
      setActionError(err);
    } finally {
      setActing(null);
      setShowReasonFor(null);
    }
  };

  if (loading) {
    return (
      <FmsLayout title="Approval">
        <div className="h-64 animate-pulse rounded-lg bg-white" />
      </FmsLayout>
    );
  }

  if (error) {
    return (
      <FmsLayout title="Approval">
        <ErrorBanner error={error} onRetry={load} />
      </FmsLayout>
    );
  }

  const b = budget?.budgetCheck || budget;
  const outcome = b?.outcome || (b?.checked === false ? 'notChecked' : null);
  const tone = outcome ? BUDGET_TONE[outcome] : null;

  return (
    <FmsLayout title={`Expense ${expense?.expenseNumber || ''}`}>
      {actionError && <ErrorBanner error={actionError} className="mb-4" />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ── Detail ─────────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-[var(--border)] bg-white p-5 lg:col-span-2">
          <dl>
            <Row label="Purpose">{expense?.purpose}</Row>
            <Row label="Department">{expense?.department?.name || '—'}</Row>
            <Row label="Raised by">{expense?.requestedByName || '—'}</Row>
            <Row label="Head">
              {expense?.budgetHeadCode
                ? `${expense.budgetHeadCode} ${expense.category || ''}`
                : (expense?.category || '—')}
            </Row>
            <Row label="Vendor">{expense?.vendor?.name || '—'}</Row>
            <Row label="Amount">
              <span className="text-base font-semibold"><Money paise={expense?.totalAmount} /></span>
            </Row>
            <Row label="Status">
              <span className="capitalize">{expense?.expenseStatus}</span>
            </Row>
            {expense?.remarks && <Row label="Remarks">{expense.remarks}</Row>}
          </dl>

          {(expense?.attachments || []).length > 0 && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                Attachments
              </div>
              <ul className="space-y-1 text-sm">
                {expense.attachments.map((a, i) => (
                  <li key={i}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--mod)] underline"
                    >
                      {a.filename || `Attachment ${i + 1}`}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Budget position ────────────────────────────────────────────── */}
        <div className="space-y-4">
          {tone && (
            <div className={`rounded-lg border p-4 ${tone.cls}`}>
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Budget</div>
              <div className="mt-1 text-sm font-medium">{tone.label}</div>

              {outcome === 'notChecked' ? (
                <p className="mt-2 text-xs leading-relaxed">
                  No budget was set for this head, so there was nothing to check against.
                  This is not the same as being within budget — nobody has decided what
                  this head should spend.
                </p>
              ) : (
                <dl className="mt-3 space-y-1 text-xs">
                  {b?.budgetAmount !== undefined && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--muted)]">Budget</dt>
                      <dd><Money paise={b.budgetAmount} /></dd>
                    </div>
                  )}
                  {b?.consumed !== undefined && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--muted)]">Already used</dt>
                      <dd><Money paise={b.consumed} /></dd>
                    </div>
                  )}
                  {b?.available !== undefined && (
                    <div className="flex justify-between font-medium">
                      <dt className="text-[var(--muted)]">Available</dt>
                      <dd><Money paise={b.available} /></dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          )}

          {/* ── The chain ────────────────────────────────────────────────── */}
          {position && (
            <div className="rounded-lg border border-[var(--border)] bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Approval chain · tier {position.tier}
              </div>

              <ol className="mt-3 space-y-2">
                {(position.chain || []).map((s) => {
                  const isNext = position.next?.step === s.step;
                  return (
                    <li key={s.step} className="flex items-start gap-2 text-sm">
                      <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border text-center text-[10px] leading-4 ${
                        s.completed
                          ? 'border-[var(--mod)] bg-[var(--mod)] text-white'
                          : isNext
                            ? 'border-[var(--gold)] text-[var(--gold)]'
                            : 'border-[var(--border)] text-[var(--muted)]'
                      }`}>
                        {s.completed ? '✓' : ''}
                      </span>
                      <span className={isNext ? 'font-medium' : s.completed ? '' : 'text-[var(--muted)]'}>
                        <span className="capitalize">{s.step}</span>
                        <span className="ml-1 text-xs text-[var(--muted)]">
                          ({(s.roles || []).join(' / ')})
                        </span>
                        {isNext && <span className="ml-2 text-xs text-[var(--gold)]">← next</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* ── What has happened so far ──────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold">History</h2>
          <ul className="space-y-3">
            {history.map((h, i) => (
              <li key={h._id || i} className="flex gap-3 text-sm">
                <span className="w-32 shrink-0 text-xs text-[var(--muted)]">
                  {h.actedAt ? new Date(h.actedAt).toLocaleString('en-IN') : ''}
                </span>
                <span>
                  <span className="font-medium capitalize">{h.action}</span>
                  {h.actorRole && <span className="ml-1 text-xs text-[var(--muted)]">by {h.actorRole}</span>}
                  {h.comment && <div className="mt-0.5 text-xs text-[var(--ink)]">{h.comment}</div>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="mt-4 rounded-lg border border-[var(--border)] bg-white p-5">
        {showReasonFor && (
          <div className="mb-3">
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Reason for {showReasonFor} — required
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              autoFocus
              placeholder="The person who raised this needs to know what to change."
              className="mt-1 w-full rounded-md border border-[var(--border)] p-2 text-sm"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!acting}
            onClick={() => act('approve')}
            className="rounded-md bg-[var(--mod)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {acting === 'approve' ? 'Approving…' : 'Approve'}
          </button>

          <button
            type="button"
            disabled={!!acting}
            onClick={() => act('return')}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40"
          >
            Return for changes
          </button>

          <button
            type="button"
            disabled={!!acting}
            onClick={() => act('reject')}
            className="rounded-md border border-[var(--danger)] px-4 py-2 text-sm text-[var(--danger)] disabled:opacity-40"
          >
            Reject
          </button>

          <button
            type="button"
            onClick={() => navigate('/fms/approvals')}
            className="ml-auto rounded-md px-4 py-2 text-sm text-[var(--muted)]"
          >
            Back
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
          The finance system decides whether an action is allowed — the step order, your
          role, and the rule that nobody approves their own request. If it refuses, its
          reason is shown above.
        </p>
      </div>
    </FmsLayout>
  );
};

export default ApprovalAction;