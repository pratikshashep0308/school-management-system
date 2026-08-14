// frontend/src/pages/FMS/Reports.jsx
//
// Reports centre and financial statements — SCR-55/57/58/59, SCR-25.
// Route /fms/reports and /fms/reports/:report.
//
// ─── THREE THINGS THAT MUST BE RIGHT ─────────────────────────────────────────
//
// 1. THE SURPLUS IS ITS OWN LINE IN EQUITY. Not folded into a total. It is what
//    makes the balance sheet balance, and a reader should be able to see WHY
//    the two sides agree rather than being asked to trust it.
//
// 2. "INCOME & EXPENDITURE", NOT "PROFIT & LOSS". "Surplus"/"Deficit", not
//    "Profit". The school is a non-profit; the wrong word invites the wrong
//    question at a trustee meeting.
//
// 3. THE CASH REPORT SAYS IT IS NOT A STATUTORY CASH FLOW. A statutory indirect
//    cash flow needs opening and closing balance sheets and working-capital
//    movements. This is a movement statement. Overclaiming would matter.
//
// ─── THE VERIFICATION BLOCK ──────────────────────────────────────────────────
// The balance sheet response carries three identities. If any fails, the
// statements should not be circulated — and the screen says so rather than
// leaving a reader to notice.

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import Money from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

const REPORTS = [
  { key: 'balance-sheet',      label: 'Balance Sheet',        api: 'reportBalanceSheet' },
  { key: 'income-expenditure', label: 'Income & Expenditure', api: 'reportIncomeExpenditure' },
  { key: 'cash-flow',          label: 'Cash Movement',        api: 'reportCashFlow' },
  { key: 'budget-vs-actual',   label: 'Budget vs Actual',     api: 'reportBudgetVsActual' },
  { key: 'trial-balance',      label: 'Trial Balance',        api: 'reportTrialBalance' },
  { key: 'fee-collection',     label: 'Fee Collection',       api: 'reportFeeCollection' },
  { key: 'department-expense', label: 'Department Expense',   api: 'reportDepartmentExpense' },
];

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}

/** A section of a statement: rows plus a total. */
const Section = ({ title, rows = [], total }) => (
  <div className="mb-5">
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h3>
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.accountCode || i} className="border-b border-[var(--border)] last:border-0">
            <td className="w-20 py-1.5 font-mono text-xs text-[var(--muted)]">
              {r.accountCode === '—' ? '' : r.accountCode}
            </td>
            <td className={`py-1.5 ${r.derived ? 'font-medium' : ''}`}>
              {r.accountName}
              {/* The surplus line explains itself — it is the reason the two
                  sides of the sheet agree. */}
              {r.note && (
                <div className="text-xs font-normal text-[var(--muted)]">{r.note}</div>
              )}
            </td>
            <td className="py-1.5 text-right"><Money paise={r.amount} /></td>
          </tr>
        ))}
      </tbody>
      {total !== undefined && (
        <tfoot>
          <tr className="border-t-2 border-[var(--border-strong)] font-semibold">
            <td /><td className="py-2">Total</td>
            <td className="py-2 text-right"><Money paise={total} /></td>
          </tr>
        </tfoot>
      )}
    </table>
  </div>
);

const Verification = ({ verification }) => {
  if (!verification) return null;
  const { allPassed, checks = [] } = verification;

  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 ${
      allPassed ? 'border-[var(--border)] bg-white' : 'border-[var(--danger)] bg-[var(--danger-soft)]'
    }`}>
      <p className={`text-sm font-medium ${allPassed ? '' : 'text-[var(--danger)]'}`}>
        {allPassed
          ? 'Verified — the statements agree with the ledger and with each other.'
          : 'One or more checks failed. Do not rely on these statements.'}
      </p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {checks.map((c) => (
          <li key={c.name} className={c.passed ? 'text-[var(--muted)]' : 'text-[var(--danger)]'}>
            {c.passed ? '✓' : '✗'} {c.name}
          </li>
        ))}
      </ul>
    </div>
  );
};

const Reports = () => {
  const { report } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [range, setRange] = useState({ from: '', to: '' });

  const def = REPORTS.find((r) => r.key === report);

  const load = useCallback(async () => {
    if (!def) { setData(null); return; }
    setLoading(true); setError(null);
    try {
      const params = {};
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      if (report === 'balance-sheet' && range.to) params.to = range.to;

      const res = await fmsAPI[def.api](params);
      setData(res?.data?.data ?? res?.data ?? null);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [def, report, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const doExport = async (format) => {
    setExporting(format); setExportError(null);
    try {
      const params = {};
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      const res = await fmsAPI.downloadReport(report, params, format);
      downloadBlob(res.data, `${report}-${new Date().toISOString().slice(0, 10)}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (err) {
      setExportError(err);
    } finally { setExporting(null); }
  };

  // ── Catalogue ─────────────────────────────────────────────────────────────
  if (!report) {
    return (
      <FmsLayout title="Reports">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <button key={r.key} type="button"
              onClick={() => navigate(`/fms/reports/${r.key}`)}
              className="rounded-lg border border-[var(--border)] bg-white p-4 text-left hover:border-[var(--mod)]">
              <div className="font-medium">{r.label}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">PDF · Excel</div>
            </button>
          ))}
        </div>
        <p className="mt-6 text-xs text-[var(--muted)]">
          Every report is computed from the general ledger at request time. Nothing is
          stored or cached.
        </p>
      </FmsLayout>
    );
  }

  const isBalanceSheet = report === 'balance-sheet';
  const isPL = report === 'income-expenditure';
  const isCash = report === 'cash-flow';
  const isBudget = report === 'budget-vs-actual';

  return (
    <FmsLayout
      title={def?.label || 'Report'}
      actions={
        <>
          <button type="button" onClick={() => navigate('/fms/reports')}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)]">All reports</button>
          <button type="button" disabled={!!exporting || !data} onClick={() => doExport('pdf')}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40">
            {exporting === 'pdf' ? 'Preparing…' : 'PDF'}</button>
          <button type="button" disabled={!!exporting || !data} onClick={() => doExport('excel')}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40">
            {exporting === 'excel' ? 'Preparing…' : 'Excel'}</button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {!isBalanceSheet && (
          <label className="text-xs text-[var(--muted)]">From
            <input type="date" value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm" /></label>
        )}
        <label className="text-xs text-[var(--muted)]">
          {isBalanceSheet ? 'As at' : 'To'}
          <input type="date" value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm" /></label>
      </div>

      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}
      {exportError && <ErrorBanner error={exportError} className="mb-4" />}
      {loading && <div className="h-64 animate-pulse rounded-lg bg-white" />}

      {!loading && data && (
        <div className="rounded-lg border border-[var(--border)] bg-white p-6">
          {/* ── Balance sheet ──────────────────────────────────────────── */}
          {isBalanceSheet && (
            <>
              <Verification verification={data.verification} />

              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div>
                  <Section title="Assets" rows={data.assets?.rows} total={data.assets?.total} />
                </div>
                <div>
                  <Section title="Liabilities" rows={data.liabilities?.rows} total={data.liabilities?.total} />
                  {/* The surplus appears here as its own labelled row — it is
                      supplied by the API with derived: true and a note. */}
                  <Section title="Funds & Equity" rows={data.equity?.rows} total={data.equity?.total} />
                </div>
              </div>

              <div className={`mt-4 rounded-md px-4 py-3 text-sm ${
                data.totals?.balanced ? 'bg-[var(--canvas)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'
              }`}>
                {data.totals?.balanced ? (
                  <>Assets <Money paise={data.totals.assets} /> = Liabilities and Equity{' '}
                    <Money paise={data.totals.liabilitiesAndEquity} /></>
                ) : (
                  <>Out of balance by <Money paise={data.totals?.difference} />. {data.note}</>
                )}
              </div>

              {data.note && data.totals?.balanced && (
                <p className="mt-3 text-xs text-[var(--muted)]">{data.note}</p>
              )}
            </>
          )}

          {/* ── Income & Expenditure ───────────────────────────────────── */}
          {isPL && (
            <>
              <Section title="Income" rows={data.income?.rows} total={data.income?.total} />
              <Section title="Expenditure" rows={data.expenditure?.rows} total={data.expenditure?.total} />

              <div className={`mt-2 rounded-md px-4 py-3 ${
                data.isDeficit ? 'bg-[var(--danger-soft)]' : 'bg-[var(--canvas)]'
              }`}>
                <div className="flex justify-between text-sm font-semibold">
                  {/* "Surplus"/"Deficit" — never "Profit". */}
                  <span>{data.label}</span>
                  <span><Money paise={data.surplus} /></span>
                </div>
              </div>
            </>
          )}

          {/* ── Cash movement ──────────────────────────────────────────── */}
          {isCash && (
            <>
              <div className="mb-4 flex justify-between border-b border-[var(--border)] pb-3 text-sm">
                <span className="text-[var(--muted)]">Opening cash and bank</span>
                <span><Money paise={data.openingCash} /></span>
              </div>

              <Section title="Money in" rows={(data.inflows?.rows || []).map((r) => ({
                accountCode: r.accountCode, accountName: r.head, amount: r.amount,
              }))} total={data.inflows?.total} />

              <Section title="Money out" rows={(data.outflows?.rows || []).map((r) => ({
                accountCode: r.accountCode, accountName: r.head, amount: r.amount,
              }))} total={data.outflows?.total} />

              <div className="mt-2 space-y-1 rounded-md bg-[var(--canvas)] px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Net movement</span>
                  <span><Money paise={data.netMovement} /></span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Closing cash and bank</span>
                  <span><Money paise={data.closingCash} /></span>
                </div>
                {!data.reconciles && (
                  <p className="pt-2 text-xs text-[var(--danger)]">
                    This does not reconcile to the ledger closing balance.
                  </p>
                )}
              </div>

              {/* Do not omit this — it is the difference between a movement
                  statement and a statutory cash flow. */}
              {data.note && (
                <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--muted)]">
                  {data.note}
                </p>
              )}
            </>
          )}

          {/* ── Budget vs actual ───────────────────────────────────────── */}
          {isBudget && (
            (data.lines || []).length === 0 ? (
              <EmptyState title="No budgets to report against"
                reason={data.note || 'No active budgets exist for this financial year.'} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-2 text-left text-xs uppercase text-[var(--muted)]">Head</th>
                    <th className="py-2 text-right text-xs uppercase text-[var(--muted)]">Budget</th>
                    <th className="py-2 text-right text-xs uppercase text-[var(--muted)]">Actual</th>
                    <th className="py-2 text-right text-xs uppercase text-[var(--muted)]">Committed</th>
                    <th className="py-2 text-right text-xs uppercase text-[var(--muted)]">Available</th>
                    <th className="py-2 text-right text-xs uppercase text-[var(--muted)]">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.accountCode} className={`border-b border-[var(--border)] last:border-0 ${
                      l.isOverBudget ? 'bg-[var(--danger-soft)]' : l.isNearLimit ? 'bg-[var(--gold-soft)]' : ''
                    }`}>
                      <td className="py-2">
                        <span className="font-mono text-xs text-[var(--muted)]">{l.accountCode}</span>
                        <span className="ml-2">{l.accountName}</span>
                      </td>
                      <td className="py-2 text-right"><Money paise={l.effectiveBudget} /></td>
                      {/* actual and committed shown separately, because
                          consumed = actual + committed and the arithmetic
                          should be visible rather than implied. */}
                      <td className="py-2 text-right"><Money paise={l.actual} /></td>
                      <td className="py-2 text-right text-[var(--muted)]"><Money paise={l.committed} /></td>
                      <td className="py-2 text-right"><Money paise={l.available} /></td>
                      <td className="py-2 text-right text-xs">
                        {Math.round((l.utilisation || 0) * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {/* ── Anything else: generic line table ──────────────────────── */}
          {!isBalanceSheet && !isPL && !isCash && !isBudget && (
            <pre className="overflow-x-auto text-xs text-[var(--muted)]">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </FmsLayout>
  );
};

export default Reports;