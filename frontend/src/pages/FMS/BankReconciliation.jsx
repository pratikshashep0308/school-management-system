// frontend/src/pages/FMS/BankReconciliation.jsx
//
// Bank reconciliation — SCR-41/42. Route /fms/banking/reconcile.
//
// The most complex screen in the build.
//
// ─── THE BALANCING RULE IS THE WHOLE POINT ───────────────────────────────────
//   statement − ledger = unpresented cheques − deposits in transit
//                        + charges not booked + other adjustments
//
// It is shown LIVE as adjustments are entered, with the unexplained remainder
// always visible. The backend refuses to close an unbalanced reconciliation, so
// the screen's job is to make it obvious WHY it is refusing rather than leaving
// somebody pressing a dead button.
//
// ─── A SILENTLY SKIPPED ROW IS THE FAILURE THIS EXISTS TO CATCH ──────────────
// Import reports parse errors per row. Those are shown. A statement line that
// never made it in is a transaction the reconciliation will never know is
// missing — which defeats the purpose of reconciling at all.
//
// ─── THE PERIOD LOCK ─────────────────────────────────────────────────────────
// Once reconciled, NOTHING can be dated into that period — including a journal
// voucher. That is enforced at the posting layer, not just in these screens, so
// it is worth stating before somebody confirms.

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import Money, { formatPaise } from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

function toPaise(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return null;
  const p = Math.round(n * 100);
  return Math.abs(n * 100 - p) > 0.001 ? null : p;
}

const Pane = ({ title, subtitle, children }) => (
  <div className="rounded-lg border border-[var(--border)] bg-white">
    <div className="border-b border-[var(--border)] bg-[var(--canvas)] px-4 py-2.5">
      <div className="text-sm font-semibold">{title}</div>
      {subtitle && <div className="text-xs text-[var(--muted)]">{subtitle}</div>}
    </div>
    <div className="max-h-96 overflow-y-auto">{children}</div>
  </div>
);

const BankReconciliation = () => {
  const [accounts, setAccounts] = useState([]);
  const [account, setAccount] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });

  const [recon, setRecon] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [pickedStatement, setPickedStatement] = useState(null);
  const [pickedLedger, setPickedLedger] = useState(null);
  const [busy, setBusy] = useState(null);

  const [importResult, setImportResult] = useState(null);
  const [adjust, setAdjust] = useState({
    bankClosing: '', unpresented: '', inTransit: '', charges: '', other: '', notes: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fmsAPI.getBankAccounts();
        const list = res?.data?.data ?? res?.data ?? [];
        setAccounts(list);
        if (list.length === 1) setAccount(list[0]._id);
      } catch (err) { setError(err); }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true); setError(null);
    try {
      const params = {};
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      const [r, t] = await Promise.all([
        fmsAPI.getReconciliation(account, params),
        fmsAPI.getBankTransactions(account, { ...params, limit: 300 }),
      ]);
      setRecon(r?.data?.data ?? r?.data ?? null);
      setTxns(t?.data?.data ?? t?.data ?? []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [account, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const unmatchedStatement = txns.filter((t) => t.reconciliationStatus === 'unreconciled');
  const unmatchedLedger = recon?.outstandingEntries || [];

  // ── The balancing equation, live ──────────────────────────────────────────
  const maths = useMemo(() => {
    const bank = toPaise(adjust.bankClosing);
    const ledger = recon?.ledgerBalance ?? recon?.closingBalance ?? 0;
    const unpresented = toPaise(adjust.unpresented);
    const inTransit = toPaise(adjust.inTransit);
    const charges = toPaise(adjust.charges);
    const other = toPaise(adjust.other);

    if ([bank, unpresented, inTransit, charges, other].some((v) => v === null)) {
      return { invalid: true };
    }

    const difference = bank - ledger;
    const explained = unpresented - inTransit + charges + other;
    return {
      invalid: false, bank, ledger, difference, explained,
      unexplained: difference - explained,
    };
  }, [adjust, recon]);

  const importFile = async (file) => {
    if (!file || !account) return;
    setBusy('import'); setError(null); setImportResult(null);
    try {
      const text = await file.text();
      const res = await fmsAPI.importStatement(account, { csv: text, filename: file.name });
      setImportResult(res?.data?.data ?? res?.data ?? null);
      load();
    } catch (err) { setError(err); } finally { setBusy(null); }
  };

  const autoMatch = async () => {
    setBusy('auto'); setError(null);
    try { await fmsAPI.autoMatch(account, {}); load(); }
    catch (err) { setError(err); } finally { setBusy(null); }
  };

  const pair = async () => {
    if (!pickedStatement || !pickedLedger) return;
    setBusy('match'); setError(null);
    try {
      await fmsAPI.matchTransaction(pickedStatement._id, { ledgerEntry: pickedLedger._id });
      setPickedStatement(null); setPickedLedger(null);
      load();
    } catch (err) { setError(err); } finally { setBusy(null); }
  };

  const complete = async () => {
    setBusy('reconcile'); setError(null);
    try {
      await fmsAPI.reconcile(account, {
        from: range.from || undefined,
        to: range.to || undefined,
        bankClosingBalance: toPaise(adjust.bankClosing),
        unpresentedCheques: toPaise(adjust.unpresented),
        depositsInTransit: toPaise(adjust.inTransit),
        chargesNotBooked: toPaise(adjust.charges),
        otherAdjustments: toPaise(adjust.other),
        notes: adjust.notes || undefined,
      });
      load();
    } catch (err) {
      // The backend refuses an unbalanced reconciliation — show its reason.
      setError(err);
    } finally { setBusy(null); }
  };

  return (
    <FmsLayout title="Bank Reconciliation">
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-white p-4">
        <label className="text-xs text-[var(--muted)]">Account
          <select value={account} onChange={(e) => setAccount(e.target.value)}
            className="ml-2 min-w-[16rem] rounded-md border border-[var(--border)] px-2 py-1 text-sm">
            <option value="">Choose…</option>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>{a.accountName} {a.accountNumber ? `· ${a.accountNumber}` : ''}</option>
            ))}
          </select></label>
        <label className="text-xs text-[var(--muted)]">From
          <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm" /></label>
        <label className="text-xs text-[var(--muted)]">To
          <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm" /></label>

        {account && (
          <>
            <label className="cursor-pointer rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--canvas)]">
              {busy === 'import' ? 'Importing…' : 'Import statement (CSV)'}
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => importFile(e.target.files?.[0])} />
            </label>
            <button type="button" onClick={autoMatch} disabled={!!busy}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40">
              {busy === 'auto' ? 'Matching…' : 'Auto-match'}
            </button>
          </>
        )}
      </div>

      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      {/* Per-row parse errors — a silently skipped line is the failure this
          screen exists to catch. */}
      {importResult && (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-4">
          <p className="text-sm">
            Imported {importResult.imported ?? 0} line(s).
            {importResult.duplicates ? ` ${importResult.duplicates} already present.` : ''}
          </p>
          {(importResult.errors || []).length > 0 && (
            <div className="mt-3 rounded-md bg-[var(--danger-soft)] p-3">
              <p className="text-sm font-medium text-[var(--danger)]">
                {importResult.errors.length} row(s) could not be read — they are NOT in the
                reconciliation:
              </p>
              <ul className="mt-2 space-y-0.5 text-xs">
                {importResult.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>Row {e.row ?? i + 1}: {e.message || e.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!account && (
        <EmptyState title="Choose a bank account"
          reason="Reconciliation compares one bank account's statement against what the books say for the same period." />
      )}

      {account && loading && <div className="h-64 animate-pulse rounded-lg bg-white" />}

      {account && !loading && recon && (
        <>
          {/* ── The two panes ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Pane title="On the statement, not in the books"
              subtitle={`${unmatchedStatement.length} unmatched · a statement CREDIT is a ledger DEBIT`}>
              {unmatchedStatement.length === 0 ? (
                <p className="p-4 text-sm text-[var(--muted)]">Everything on the statement is matched.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <tbody>
                    {unmatchedStatement.map((t) => (
                      <tr key={t._id}
                        onClick={() => setPickedStatement(pickedStatement?._id === t._id ? null : t)}
                        className={`cursor-pointer border-b border-[var(--border)] last:border-0 ${
                          pickedStatement?._id === t._id ? 'bg-[var(--mod-soft)]' : 'hover:bg-[var(--canvas)]'}`}>
                        <td className="px-3 py-2 text-xs">
                          {t.transactionDate ? new Date(t.transactionDate).toLocaleDateString('en-IN') : ''}
                        </td>
                        <td className="px-3 py-2">
                          <div className="max-w-[16rem] truncate">{t.description || t.narration}</div>
                          {t.referenceNumber && (
                            <div className="font-mono text-[10px] text-[var(--muted)]">{t.referenceNumber}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Money paise={t.amount ?? (t.credit || t.debit)} />
                          <div className="text-[10px] uppercase text-[var(--muted)]">
                            {t.credit ? 'credit' : 'debit'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Pane>

            <Pane title="In the books, not on the statement"
              subtitle={`${unmatchedLedger.length} outstanding`}>
              {unmatchedLedger.length === 0 ? (
                <p className="p-4 text-sm text-[var(--muted)]">Nothing outstanding in the books.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <tbody>
                    {unmatchedLedger.map((e) => (
                      <tr key={e._id}
                        onClick={() => setPickedLedger(pickedLedger?._id === e._id ? null : e)}
                        className={`cursor-pointer border-b border-[var(--border)] last:border-0 ${
                          pickedLedger?._id === e._id ? 'bg-[var(--mod-soft)]' : 'hover:bg-[var(--canvas)]'}`}>
                        <td className="px-3 py-2 text-xs">
                          {e.entryDate ? new Date(e.entryDate).toLocaleDateString('en-IN') : ''}
                        </td>
                        <td className="px-3 py-2">
                          <div className="max-w-[16rem] truncate">{e.narration}</div>
                          <div className="font-mono text-[10px] text-[var(--muted)]">
                            {e.voucherNumber}{e.referenceNumber ? ` · ${e.referenceNumber}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Money paise={e.debit || e.credit} />
                          <div className="text-[10px] uppercase text-[var(--muted)]">
                            {e.debit ? 'debit' : 'credit'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Pane>
          </div>

          {(pickedStatement || pickedLedger) && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--mod)] bg-[var(--mod-soft)] px-4 py-3 text-sm">
              <span>
                {pickedStatement ? formatPaise(pickedStatement.amount ?? (pickedStatement.credit || pickedStatement.debit)) : '—'}
                {' ↔ '}
                {pickedLedger ? formatPaise(pickedLedger.debit || pickedLedger.credit) : '—'}
              </span>
              <button type="button" onClick={pair} disabled={!pickedStatement || !pickedLedger || !!busy}
                className="rounded-md bg-[var(--mod)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
                Match these
              </button>
              <button type="button" onClick={() => { setPickedStatement(null); setPickedLedger(null); }}
                className="text-xs text-[var(--muted)] underline">clear</button>
            </div>
          )}

          {/* ── The balancing equation ─────────────────────────────────── */}
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-white p-5">
            <h2 className="text-sm font-semibold">Complete the reconciliation</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Enter the closing balance from the statement and explain any difference. It
              only completes when nothing is left unexplained.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ['bankClosing', 'Statement closing ₹'],
                ['unpresented', 'Unpresented cheques ₹'],
                ['inTransit', 'Deposits in transit ₹'],
                ['charges', 'Charges not booked ₹'],
                ['other', 'Other adjustments ₹'],
              ].map(([k, label]) => (
                <label key={k} className="text-xs text-[var(--muted)]">{label}
                  <input value={adjust[k]} inputMode="decimal"
                    onChange={(e) => setAdjust((a) => ({ ...a, [k]: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-right text-sm" />
                </label>
              ))}
            </div>

            {!maths.invalid && (
              <div className="mt-4 space-y-1 rounded-md bg-[var(--canvas)] px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Statement closing</span>
                  <span>{formatPaise(maths.bank)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Books say</span>
                  <span>{formatPaise(maths.ledger)}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--border)] pt-1">
                  <span className="text-[var(--muted)]">Difference to explain</span>
                  <span>{formatPaise(maths.difference)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Explained by the adjustments</span>
                  <span>{formatPaise(maths.explained)}</span>
                </div>
                <div className={`flex justify-between border-t-2 pt-1 font-semibold ${
                  maths.unexplained === 0 ? 'border-[var(--border-strong)]' : 'border-[var(--danger)] text-[var(--danger)]'
                }`}>
                  <span>Still unexplained</span>
                  <span>{formatPaise(maths.unexplained)}</span>
                </div>
              </div>
            )}

            {maths.invalid && (
              <p className="mt-3 text-sm text-[var(--danger)]">
                One of the amounts is not a valid rupee figure.
              </p>
            )}

            {!maths.invalid && maths.unexplained !== 0 && (
              <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                The reconciliation cannot be completed while anything is unexplained — an
                unexplained difference is a transaction nobody has accounted for, which is
                exactly what reconciling is meant to find.
              </p>
            )}

            <label className="mt-3 block text-xs text-[var(--muted)]">Notes
              <textarea rows={2} value={adjust.notes}
                onChange={(e) => setAdjust((a) => ({ ...a, notes: e.target.value }))}
                className="mt-1 w-full rounded-md border border-[var(--border)] p-2 text-sm" /></label>

            {/* Stated before confirming, not after. */}
            <div className="mt-4 rounded-md bg-[var(--gold-soft)] px-4 py-2.5 text-xs leading-relaxed text-[var(--gold)]">
              Once this period is reconciled, <strong>nothing can be dated into it</strong> —
              including a journal voucher. That is enforced wherever postings are made, not
              just here.
            </div>

            <button type="button" onClick={complete}
              disabled={!!busy || maths.invalid || maths.unexplained !== 0 || !adjust.bankClosing}
              className="mt-4 rounded-md bg-[var(--mod)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40">
              {busy === 'reconcile' ? 'Completing…' : 'Complete reconciliation'}
            </button>
          </div>
        </>
      )}
    </FmsLayout>
  );
};

export default BankReconciliation;