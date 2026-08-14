// frontend/src/pages/FMS/FinancialYears.jsx
//
// Financial year lifecycle — SCR-67. Route /fms/financial-years.
//
// ─── CLOSED CAN BE REOPENED. LOCKED CANNOT. EVER. ────────────────────────────
// That distinction is the entire reason there are two states. If a locked year
// could be reopened, locking would be a suggestion.
//
//   closed   postings refused, but a genuine omission can still be corrected by
//            reopening — with a reason, by an authorised role, audited.
//   locked   signed off, filed, audited. No reopen. A correction now means
//            posting into the CURRENT year, which is what an auditor expects.
//
// The screen makes that difference unmistakable, and locking requires typing
// the year code because there is no undo.

import React, { useCallback, useEffect, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import Money from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

const STATUS_TONE = {
  open:     'bg-[var(--canvas)] text-[var(--ink)]',
  reopened: 'bg-[var(--gold-soft)] text-[var(--gold)]',
  closed:   'bg-[var(--info-soft)] text-[var(--info)]',
  locked:   'bg-[var(--danger-soft)] text-[var(--danger)]',
};

const FinancialYears = () => {
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [busy, setBusy] = useState(null);
  const [lockConfirm, setLockConfirm] = useState({ id: null, typed: '' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fmsAPI.getFinancialYears({ limit: 50 });
      setYears(res?.data?.data ?? res?.data ?? []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Always check readiness before offering to close — an unbalanced year cannot
  // be closed at all, and closing one with warnings should be a decision.
  const checkReadiness = async (fy) => {
    setBusy(fy._id); setError(null);
    try {
      const res = await fmsAPI.getYearReadiness(fy._id);
      setReadiness({ fy, ...(res?.data?.data ?? res?.data ?? {}) });
    } catch (err) { setError(err); } finally { setBusy(null); }
  };

  const close = async () => {
    setBusy('close');
    try {
      await fmsAPI.closeYear(readiness.fy._id, {
        acknowledgeWarnings: (readiness.warnings || []).length > 0,
        reason: 'Closed from the finance screens',
      });
      setReadiness(null); load();
    } catch (err) { setError(err); } finally { setBusy(null); }
  };

  const lock = async (fy) => {
    setBusy('lock');
    try {
      await fmsAPI.lockYear(fy._id, { confirmYearCode: lockConfirm.typed });
      setLockConfirm({ id: null, typed: '' }); load();
    } catch (err) { setError(err); } finally { setBusy(null); }
  };

  const reopen = async (fy) => {
    const reason = window.prompt(
      `Reopen ${fy.yearCode}?\n\n`
      + 'Reopening changes figures somebody may already have reported. '
      + 'Reason (at least ten characters):',
    );
    if (!reason) return;
    setBusy('reopen');
    try { await fmsAPI.reopenYear(fy._id, { reason }); load(); }
    catch (err) { setError(err); } finally { setBusy(null); }
  };

  return (
    <FmsLayout title="Financial Years">
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}
      {loading && <div className="h-40 animate-pulse rounded-lg bg-white" />}

      {!loading && years.length === 0 && (
        <EmptyState title="No financial years"
          reason="A financial year must exist before anything can be posted — every voucher belongs to one." />
      )}

      {/* ── Readiness, before closing ─────────────────────────────────────── */}
      {readiness && (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-5">
          <h2 className="text-sm font-semibold">Closing {readiness.fy.yearCode}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {readiness.entries} ledger entries · debits {' '}
            <Money paise={readiness.totalDebit} /> · credits <Money paise={readiness.totalCredit} />
          </p>

          {(readiness.blockers || []).length > 0 && (
            <div className="mt-3 rounded-md bg-[var(--danger-soft)] p-3">
              <p className="text-sm font-medium text-[var(--danger)]">
                This year cannot be closed:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-[var(--danger)]">
                {readiness.blockers.map((b, i) => <li key={i}>{b.message}</li>)}
              </ul>
              <p className="mt-2 text-xs">
                Closing an unbalanced year freezes the error in place and makes it somebody
                else's problem later.
              </p>
            </div>
          )}

          {(readiness.warnings || []).length > 0 && (
            <div className="mt-3 rounded-md bg-[var(--gold-soft)] p-3">
              <p className="text-sm font-medium text-[var(--gold)]">
                Worth checking first — you can proceed anyway, and the acknowledgement is
                recorded:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-[var(--gold)]">
                {readiness.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button type="button" disabled={!readiness.canClose || busy === 'close'} onClick={close}
              className="rounded-md bg-[var(--mod)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
              {busy === 'close' ? 'Closing…' : 'Close the year'}
            </button>
            <button type="button" onClick={() => setReadiness(null)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {!loading && years.length > 0 && (
        <div className="space-y-3">
          {years.map((fy) => (
            <div key={fy._id} className="rounded-lg border border-[var(--border)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{fy.yearCode}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      STATUS_TONE[fy.fyStatus] || ''}`}>{fy.fyStatus}</span>
                    {fy.isCurrent && (
                      <span className="text-[10px] uppercase tracking-wide text-[var(--mod)]">current</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--muted)]">
                    {new Date(fy.startDate).toLocaleDateString('en-IN')} – {new Date(fy.endDate).toLocaleDateString('en-IN')}
                    {fy.reopenCount > 0 && ` · reopened ${fy.reopenCount}×`}
                  </div>
                  {fy.reopenReason && (
                    <div className="mt-1 max-w-xl text-xs text-[var(--muted)]">
                      Last reopened: {fy.reopenReason}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {['open', 'reopened'].includes(fy.fyStatus) && (
                    <button type="button" onClick={() => checkReadiness(fy)} disabled={busy === fy._id}
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm">
                      {busy === fy._id ? 'Checking…' : 'Close…'}
                    </button>
                  )}

                  {fy.fyStatus === 'closed' && (
                    <>
                      <button type="button" onClick={() => reopen(fy)}
                        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm">Reopen</button>
                      <button type="button" onClick={() => setLockConfirm({ id: fy._id, typed: '' })}
                        className="rounded-md border border-[var(--danger)] px-3 py-1.5 text-sm text-[var(--danger)]">
                        Lock permanently
                      </button>
                    </>
                  )}

                  {fy.fyStatus === 'locked' && (
                    <span className="self-center text-xs text-[var(--danger)]">
                      Locked — cannot be reopened
                    </span>
                  )}
                </div>
              </div>

              {/* Locking requires typing the code back. There is no undo. */}
              {lockConfirm.id === fy._id && (
                <div className="mt-4 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-4">
                  <p className="text-sm font-medium text-[var(--danger)]">
                    Locking cannot be undone.
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    A <strong>closed</strong> year can be reopened if something was missed.
                    A <strong>locked</strong> year cannot — not by anyone, ever. After this,
                    a correction can only be made by posting into the current year, which
                    leaves a visible record rather than altering accounts somebody has
                    already relied on.
                  </p>
                  <label className="mt-3 block text-xs">
                    Type <strong>{fy.yearCode}</strong> to confirm
                    <input value={lockConfirm.typed} autoFocus
                      onChange={(e) => setLockConfirm((c) => ({ ...c, typed: e.target.value }))}
                      className="mt-1 w-48 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
                  </label>
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={lockConfirm.typed !== fy.yearCode || busy === 'lock'}
                      onClick={() => lock(fy)}
                      className="rounded-md bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                      {busy === 'lock' ? 'Locking…' : 'Lock permanently'}
                    </button>
                    <button type="button" onClick={() => setLockConfirm({ id: null, typed: '' })}
                      className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </FmsLayout>
  );
};

export default FinancialYears;