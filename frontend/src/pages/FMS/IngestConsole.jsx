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

const SOURCES = [
  { key: 'fees',     label: 'Fee payments',  status: 'getFeeIngestStatus',     sync: 'syncFees',
    blurb: 'Receipts recorded in the school system, brought in as income postings.' },
  { key: 'payroll',  label: 'Salary slips',  status: 'getPayrollStatus',       sync: 'syncPayroll',
    blurb: 'Paid salary slips, posted as salary expense and the deductions withheld.' },
  { key: 'expenses', label: 'Expenses',      status: 'getExpenseIngestStatus', sync: 'syncExpenses',
    blurb: 'Expenses already recorded as spent in the school system.' },
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
      </div>
    </FmsLayout>
  );
};

export default IngestConsole;
