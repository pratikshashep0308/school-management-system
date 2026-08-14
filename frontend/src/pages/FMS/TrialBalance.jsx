// frontend/src/pages/FMS/TrialBalance.jsx
//
// Trial Balance — SCR-56.
//
// ─── WHY THIS SCREEN MATTERS BEYOND ITS CONTENT ──────────────────────────────
// If this renders and balances, the whole accounting engine is confirmed
// reachable from the UI: authentication, branch scope, the ledger aggregation,
// money formatting and file export all had to work.
//
// ─── AN UNBALANCED TRIAL BALANCE IS NOT A ROUNDING ISSUE ─────────────────────
// Every posting goes through one service that rejects unbalanced entries inside
// a transaction. So debits not equalling credits does not mean "close enough";
// it means something wrote to fms_ledgerentries outside that service, which
// should be impossible.
//
// The screen therefore says so plainly rather than quietly displaying a
// difference and letting somebody assume it will wash out next month.

import React, { useCallback, useEffect, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import { useFms } from '../../context/FmsContext';
import FmsLayout from '../../components/fms/FmsLayout';
import Money from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

/** Trigger a browser download from a blob response. */
function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const TrialBalance = () => {
  const { financialYear } = useFms();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [range, setRange] = useState({ from: '', to: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      const res = await fmsAPI.reportTrialBalance(params);
      setData(res?.data?.data ?? res?.data ?? null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const doExport = async (format) => {
    setExporting(format);
    setExportError(null);
    try {
      const params = {};
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;

      const res = await fmsAPI.downloadReport('trial-balance', params, format);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(res.data, `trial-balance-${stamp}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (err) {
      // A missing export library must not take the on-screen report down with
      // it — the figures are still perfectly readable here.
      setExportError(err);
    } finally {
      setExporting(null);
    }
  };

  const lines = data?.lines || [];
  const totals = data?.totals;

  return (
    <FmsLayout
      title="Trial Balance"
      actions={
        <>
          <button
            type="button"
            disabled={!!exporting || !lines.length}
            onClick={() => doExport('pdf')}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--canvas)] disabled:opacity-40"
          >
            {exporting === 'pdf' ? 'Preparing…' : 'Download PDF'}
          </button>
          <button
            type="button"
            disabled={!!exporting || !lines.length}
            onClick={() => doExport('excel')}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--canvas)] disabled:opacity-40"
          >
            {exporting === 'excel' ? 'Preparing…' : 'Download Excel'}
          </button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-[var(--muted)]">
          From
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm text-[var(--ink)]"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          To
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm text-[var(--ink)]"
          />
        </label>
        {(range.from || range.to) && (
          <button
            type="button"
            onClick={() => setRange({ from: '', to: '' })}
            className="text-xs text-[var(--muted)] underline"
          >
            clear
          </button>
        )}
        {financialYear && !range.from && !range.to && (
          <span className="text-xs text-[var(--muted)]">
            showing all postings to date · {financialYear}
          </span>
        )}
      </div>

      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}
      {exportError && (
        <ErrorBanner
          error={exportError}
          className="mb-4"
        />
      )}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-white" />
          ))}
        </div>
      )}

      {!loading && !error && lines.length === 0 && (
        <EmptyState
          title="No postings yet"
          reason="Nothing has been posted to the ledger for this period, so there is nothing to balance."
          hint="Once the Chart of Accounts is set up and the first receipts are recorded, they will appear here."
        />
      )}

      {!loading && lines.length > 0 && (
        <>
          {/* The balanced state is the headline, not a footnote. */}
          {totals && (
            <div
              className={`mb-4 rounded-lg border px-4 py-3 ${
                totals.balanced
                  ? 'border-[var(--border)] bg-white'
                  : 'border-[var(--danger)] bg-[var(--danger-soft)]'
              }`}
            >
              {totals.balanced ? (
                <p className="text-sm font-medium text-[var(--ink)]">
                  Balanced — debits equal credits across {totals.accounts} accounts.
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-[var(--danger)]">
                    This trial balance does not balance. Difference:{' '}
                    <Money paise={totals.difference} />
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--ink)]">
                    Every posting goes through a single service that rejects unbalanced
                    entries inside a transaction, so this should not be possible. It
                    indicates something wrote to the ledger outside that service. Do not
                    rely on any report until it is investigated.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--canvas)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Code</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Account</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Type</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Debit</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Credit</th>
                </tr>
              </thead>

              <tbody>
                {lines.map((l) => (
                  <tr key={l.accountCode} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2 font-mono text-xs text-[var(--muted)]">{l.accountCode}</td>
                    <td className="px-4 py-2">{l.accountName}</td>
                    <td className="px-4 py-2 text-xs capitalize text-[var(--muted)]">{l.accountType || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      {l.totalDebit ? <Money paise={l.totalDebit} /> : <span className="text-[var(--muted)]">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {l.totalCredit ? <Money paise={l.totalCredit} /> : <span className="text-[var(--muted)]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>

              {totals && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--border-strong)] bg-[var(--canvas)] font-semibold">
                    <td className="px-4 py-3" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-right"><Money paise={totals.totalDebit} /></td>
                    <td className="px-4 py-3 text-right"><Money paise={totals.totalCredit} /></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <p className="mt-4 text-xs text-[var(--muted)]">
            Computed from the general ledger at request time. Nothing is cached.
          </p>
        </>
      )}
    </FmsLayout>
  );
};

export default TrialBalance;