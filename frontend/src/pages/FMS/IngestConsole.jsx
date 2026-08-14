// frontend/src/pages/FMS/IngestConsole.jsx
//
// Bringing school-system data into the books. Route /fms/integrations.
//
// ─── THIS IS HOW ~500 REAL FEE PAYMENTS FIRST MEET THIS SYSTEM ───────────────
// So DRY RUN IS THE DEFAULT PATH, always. It resolves every record and reports
// exactly what would happen — writing nothing.
//
// The failures it surfaces are the point. An unmapped fee type fails the whole
// record deliberately, rather than being pooled into "unclassified", because
// pooling would hide a new fee type for a year. Seeing that on a report before
// anything is written is the difference between a five-minute fix and a
// reconciliation nobody can explain.
//
// ─── REPLAYS ARE SAFE ────────────────────────────────────────────────────────
// Idempotency is a unique index, not a code check. Running twice posts nothing
// twice — it reports the second run as already-present.

import React, { useCallback, useEffect, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import ErrorBanner from '../../components/fms/ErrorBanner';
import Money, { formatPaise } from '../../components/fms/Money';

const SOURCES = [
  { key: 'fees',     label: 'Fee payments',  status: 'getFeeIngestStatus',     sync: 'syncFees',
    blurb: 'Receipts recorded in the school system, brought in as income postings.' },
  { key: 'payroll',  label: 'Salary slips',  status: 'getPayrollStatus',       sync: 'syncPayroll',
    blurb: 'Paid salary slips, posted as salary expense and the deductions withheld.' },
  { key: 'expenses', label: 'Expenses',      status: 'getExpenseIngestStatus', sync: 'syncExpenses',
    blurb: 'Expenses already recorded as spent in the school system.' },
  { key: 'admissions', label: 'Registration fees', status: 'getAdmissionIngestStatus',
    sync: 'syncAdmissions',
    blurb: 'Fees taken when an application is submitted. Recorded as cash received — the '
      + 'school system does not record how these were paid.' },
];

const Result = ({ cycle }) => {
  if (!cycle) return null;
  const counts = cycle.counts || {};
  const failures = cycle.failures || [];

  return (
    <div className={`mt-4 rounded-lg border p-4 ${
      cycle.dryRun ? 'border-[var(--info)] bg-[var(--info-soft)]' : 'border-[var(--border)] bg-white'
    }`}>
      <p className="text-sm font-medium">
        {cycle.dryRun ? 'Preview — nothing was written' : 'Import complete'}
      </p>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        {Object.entries(counts).map(([k, v]) => (
          <span key={k}>
            <span className="text-[var(--muted)]">{k}: </span>
            <strong>{v}</strong>
          </span>
        ))}
      </div>

      {cycle.unmappedCategories > 0 && (
        <p className="mt-2 text-xs text-[var(--gold)]">
          {cycle.unmappedCategories} record(s) went to an unclassified head and are flagged
          for reclassification.
        </p>
      )}

      {/* Failures are the reason the preview exists. */}
      {failures.length > 0 && (
        <div className="mt-3 rounded-md bg-[var(--danger-soft)] p-3">
          <p className="text-sm font-medium text-[var(--danger)]">
            {failures.length} record(s) could not be posted:
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {failures.slice(0, 25).map((f, i) => (
              <li key={i}>
                <span className="font-mono">{f.sourceId}</span>
                {f.stage ? ` · ${f.stage}` : ''} — {f.reason}
                {f.hint && <div className="text-[var(--muted)]">{f.hint}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cycle.note && (
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">{cycle.note}</p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// D1 — receipts the books hold that the school system no longer has.
//
// The school system lets a fee payment be deleted outright. When that happens
// the posting stays — correctly, because the books never delete anything — but
// nothing tells anybody the two sides no longer agree. This is the only place
// that comparison is made.
//
// It writes nothing. There is no "fix it" button and there should not be: a
// posting is reversed by an accountant who has established what actually
// happened, through the normal approval route. A button here would turn one bad
// answer from the school system into a ledger full of wrong reversals.
// ─────────────────────────────────────────────────────────────────────────────
const Reconciliation = () => {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fmsAPI.getFeeReconciliation({ limit: 100 });
      setReport(res?.data?.data ?? res?.data ?? null);
    } catch (err) {
      setError(err);
      setReport(null);
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Deleted receipts</h2>
          <p className="mt-0.5 max-w-xl text-xs text-[var(--muted)]">
            Compares every receipt the books have posted against what the school system
            still holds. Reports only — nothing is changed.
          </p>
        </div>
        <button type="button" onClick={run} disabled={busy}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40">
          {busy ? 'Checking…' : 'Check now'}
        </button>
      </div>

      {error && <ErrorBanner error={error} className="mt-3" />}

      {report && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span><span className="text-[var(--muted)]">In school system: </span>
              <strong>{report.smsReceipts}</strong></span>
            <span><span className="text-[var(--muted)]">Posted in books: </span>
              <strong>{report.postedClaims}</strong></span>
            <span><span className="text-[var(--muted)]">Awaiting import: </span>
              <strong>{report.pendingIngest}</strong></span>
          </div>

          {/* The suspect flag is not a footnote. Above the threshold the list is
              far more likely to be a bad fetch than that many deletions, and
              acting on it would be the expensive mistake. */}
          {report.suspect && (
            <div className="mt-3 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
              <p className="text-sm font-medium text-[var(--danger)]">
                Do not act on this list yet.
              </p>
              <p className="mt-1 text-xs">{report.suspectReason}</p>
            </div>
          )}

          {report.orphanCount === 0 && (
            <p className="mt-3 rounded-md bg-[var(--sage-soft)] px-3 py-2 text-sm text-[var(--sage)]">
              Every posted receipt is still present in the school system. Nothing to review.
            </p>
          )}

          {report.orphanCount > 0 && (
            <>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span className="text-[var(--danger)]">
                  <strong>{report.outstandingCount}</strong> need review
                </span>
                <span><span className="text-[var(--muted)]">Value: </span>
                  <Money paise={report.outstandingPaise} /></span>
                {report.alreadyReversedCount > 0 && (
                  <span className="text-[var(--muted)]">
                    {report.alreadyReversedCount} already reversed
                  </span>
                )}
                {report.danglingClaimCount > 0 && (
                  <span className="text-[var(--gold)]">
                    {report.danglingClaimCount} with no posting found
                  </span>
                )}
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[var(--muted)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="py-2 pr-3 font-medium">Receipt</th>
                      <th className="py-2 pr-3 font-medium">Paid by</th>
                      <th className="py-2 pr-3 font-medium">Amount</th>
                      <th className="py-2 pr-3 font-medium">Voucher</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.exceptions.map((x) => (
                      <tr key={x.receiptNumber} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 pr-3 font-mono">{x.receiptNumber}</td>
                        <td className="py-2 pr-3">
                          {x.evidence.payerName || <span className="text-[var(--muted)]">unknown</span>}
                          {x.evidence.className ? ` · ${x.evidence.className}` : ''}
                        </td>
                        <td className="py-2 pr-3"><Money paise={x.evidence.amountPaise} /></td>
                        <td className="py-2 pr-3 font-mono">
                          {x.posting?.voucherNumber || '—'}
                        </td>
                        <td className="py-2">
                          {x.posting?.alreadyReversed
                            ? <span className="text-[var(--muted)]">reversed</span>
                            : <span className="text-[var(--danger)]">live posting</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {report.truncated && (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Showing the first {report.exceptions.length} of {report.orphanCount}.
                </p>
              )}

              <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                A receipt on this list was deleted in the school system after it had been
                posted. Find out why before doing anything. If the payment genuinely did not
                happen, reverse the voucher through the approval workflow — do not delete it.
              </p>
            </>
          )}

          {report.sourceAnomalies > 0 && (
            <p className="mt-2 text-xs text-[var(--gold)]">
              {report.sourceAnomalies} payment(s) in the school system have no receipt number.
              Those can never be imported or reconciled until they are given one.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// B1 — deductions the books cannot break out.
//
// The salary slip has four deduction fields: PF, tax, loan, other. There is no
// ESIC field and no professional tax field, so those two accounts can never be
// fed and will read zero however much is actually deducted — which looks like
// "nothing was taken" rather than "this cannot be measured".
//
// Anything taken under those heads is sitting in `other`. This shows how much,
// for whom, and since when. It does not guess: a figure in `other` is equally
// consistent with professional tax, a uniform deduction and a typo, and only
// the accountant can say which. So it asks.
// ─────────────────────────────────────────────────────────────────────────────
const PayrollMapping = () => {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fmsAPI.getPayrollMappingReport();
      setReport(res?.data?.data ?? res?.data ?? null);
    } catch (err) {
      setError(err); setReport(null);
    } finally { setBusy(false); }
  };

  // The accountant will want this on paper, or in a mail to whoever runs payroll.
  const downloadCsv = () => {
    if (!report?.affectedSlips?.length) return;
    const head = ['Employee', 'Employee ID', 'Month', 'Year', 'Status',
      'Unexplained deduction', 'PF', 'Tax', 'Loan', 'Gross'];
    const rows = report.affectedSlips.map((r) => [
      r.employee, r.employeeId || '', r.month ?? '', r.year ?? '', r.status || '',
      formatPaise(r.otherPaise), formatPaise(r.pfPaise), formatPaise(r.taxPaise),
      formatPaise(r.loanPaise), formatPaise(r.grossPaise),
    ]);
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-unexplained-deductions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Payroll deductions the books cannot name</h2>
          <p className="mt-0.5 max-w-xl text-xs text-[var(--muted)]">
            The salary slip records PF, tax and loan separately. Everything else goes into a
            single "other" figure. This shows what is in there.
          </p>
        </div>
        <button type="button" onClick={run} disabled={busy}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40">
          {busy ? 'Checking…' : 'Check now'}
        </button>
      </div>

      {error && <ErrorBanner error={error} className="mt-3" />}

      {report && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span><span className="text-[var(--muted)]">Slips read: </span>
              <strong>{report.slipsRead}</strong></span>
            <span><span className="text-[var(--muted)]">With an unexplained deduction: </span>
              <strong>{report.affectedSlipCount}</strong></span>
            <span><span className="text-[var(--muted)]">Total: </span>
              <Money paise={report.otherTotalPaise} /></span>
          </div>

          {/* The question. Everything else on this panel is evidence for it. */}
          <div className="mt-3 rounded-md border border-[var(--info)] bg-[var(--info-soft)] p-3">
            <p className="text-sm font-medium">A decision is needed</p>
            <p className="mt-1 text-xs leading-relaxed">{report.decisionRequired}</p>
          </div>

          {report.looksRecurring && (
            <p className="mt-2 text-xs text-[var(--gold)]">
              The same amount recurs across slips, which is the shape a statutory deduction
              makes. Worth asking about specifically.
            </p>
          )}

          {report.unsourcedHeads?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-[var(--muted)]">Accounts that can never be fed</p>
              <ul className="mt-1 space-y-1 text-xs">
                {report.unsourcedHeads.map((h) => (
                  <li key={h.code}>
                    <span className="font-mono">{h.code}</span> {h.name}
                    {' — '}{h.existsInChart ? h.consequence : 'not in the chart'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.affectedSlipCount > 0 && (
            <>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[var(--muted)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="py-2 pr-3 font-medium">Employee</th>
                      <th className="py-2 pr-3 font-medium">Slips</th>
                      <th className="py-2 font-medium">Unexplained total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.perEmployee.map((e) => (
                      <tr key={e.employeeId || e.employee}
                        className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 pr-3">
                          {e.employee}
                          {e.employeeId ? <span className="text-[var(--muted)]"> · {e.employeeId}</span> : null}
                        </td>
                        <td className="py-2 pr-3">{e.slips}</td>
                        <td className="py-2"><Money paise={e.totalPaise} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button type="button" onClick={downloadCsv}
                className="mt-3 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs">
                Download slip-by-slip CSV
              </button>
            </>
          )}

          {report.unbalancedSlipCount > 0 && (
            <p className="mt-3 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {report.unbalancedSlipCount} slip(s) do not add up — gross does not equal net plus
              deductions. Those cannot be imported at all until the payroll figures are corrected.
            </p>
          )}

          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            New slips break every deduction out by head — {report.schemaChange?.after}.
            Anything shown above predates that change and still sits in the unnamed account.
            Moving it is a journal voucher and the accountant's call, not something this
            screen will do on its own.
          </p>
        </div>
      )}
    </div>
  );
};

const IngestConsole = () => {
  const [statuses, setStatuses] = useState({});
  const [cycles, setCycles] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const next = {};
    for (const s of SOURCES) {
      try {
        const res = await fmsAPI[s.status]();
        next[s.key] = res?.data?.data ?? res?.data ?? null;
      } catch (err) {
        next[s.key] = { error: err?.response?.data?.error?.message || err.message };
      }
    }
    setStatuses(next);
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (source, dryRun) => {
    setBusy(`${source.key}:${dryRun}`); setError(null);
    try {
      const res = await fmsAPI[source.sync]({ dryRun });
      setCycles((c) => ({ ...c, [source.key]: res?.data?.data ?? res?.data ?? null }));
      if (!dryRun) load();
    } catch (err) {
      setError(err);
    } finally { setBusy(null); setConfirming(null); }
  };

  return (
    <FmsLayout title="Import from the school system">
      {error && <ErrorBanner error={error} className="mb-4" />}

      <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-relaxed">
        <p>
          <strong>Always preview first.</strong> A preview resolves every record and reports
          exactly what would happen — without writing anything.
        </p>
        <p className="mt-2 text-[var(--muted)]">
          Running an import twice is safe: the second run posts nothing and reports the
          records as already present.
        </p>
      </div>

      <div className="space-y-4">
        {SOURCES.map((s) => {
          const st = statuses[s.key] || {};
          const cycle = cycles[s.key];

          return (
            <div key={s.key} className="rounded-lg border border-[var(--border)] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{s.label}</h2>
                  <p className="mt-0.5 max-w-xl text-xs text-[var(--muted)]">{s.blurb}</p>
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={() => run(s, true)} disabled={!!busy}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40">
                    {busy === `${s.key}:true` ? 'Previewing…' : 'Preview'}
                  </button>
                  <button type="button" onClick={() => setConfirming(s.key)} disabled={!!busy}
                    className="rounded-md bg-[var(--mod)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
                    Import
                  </button>
                </div>
              </div>

              {/* The backend explains when it cannot run — usually the chart. */}
              {st.error && (
                <p className="mt-3 rounded-md bg-[var(--gold-soft)] px-3 py-2 text-xs text-[var(--gold)]">
                  {st.error}
                </p>
              )}

              {!st.error && (
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
                  {st.chartReady === false && (
                    <span className="text-[var(--gold)]">Chart of accounts not set up</span>
                  )}
                  {st.postedReceipts !== undefined && <span>{st.postedReceipts} posted</span>}
                  {st.importedExpenses !== undefined && <span>{st.importedExpenses} imported</span>}
                  {st.postedSlips !== undefined && <span>{st.postedSlips} slips posted</span>}
                  {st.postedFees !== undefined && <span>{st.postedFees} posted</span>}
                  {st.incomeAccount && st.usingDedicatedAccount === false && (
                    <span className="text-[var(--gold)]">
                      posting to {st.incomeAccount} Other Fee Income
                    </span>
                  )}
                  {st.failedRecords > 0 && (
                    <span className="text-[var(--danger)]">{st.failedRecords} failed previously</span>
                  )}
                  {st.unmappedFeeTypes > 0 && (
                    <span className="text-[var(--gold)]">{st.unmappedFeeTypes} fee type(s) unmapped</span>
                  )}
                </div>
              )}

              {st.note && (
                <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{st.note}</p>
              )}

              {confirming === s.key && (
                <div className="mt-3 rounded-md border border-[var(--gold)] bg-[var(--gold-soft)] p-4">
                  <p className="text-sm font-medium text-[var(--gold)]">
                    This writes to the books.
                  </p>
                  <p className="mt-1 text-xs">
                    Postings cannot be deleted afterwards — a mistake is corrected by
                    reversing it, which stays on the record. Preview first if you have not.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => run(s, false)} disabled={!!busy}
                      className="rounded-md bg-[var(--mod)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                      {busy === `${s.key}:false` ? 'Importing…' : 'Yes, import'}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}
                      className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancel</button>
                  </div>
                </div>
              )}

              <Result cycle={cycle} />
            </div>
          );
        })}

        <Reconciliation />
        <PayrollMapping />
      </div>
    </FmsLayout>
  );
};

export default IngestConsole;
