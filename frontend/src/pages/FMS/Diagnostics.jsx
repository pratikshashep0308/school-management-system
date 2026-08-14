// frontend/src/pages/FMS/Diagnostics.jsx
//
// Integration health, in one place. Route /fms/diagnostics.
//
// ─── WHAT THIS SCREEN IS FOR ─────────────────────────────────────────────────
// Every check here started life as a query in a gap-analysis document. Queries
// in documents get run once, by the person who wrote them. This is the same
// checks, run by whoever is worried, at the moment they are worried.
//
// ─── THE DESIGN RULE ─────────────────────────────────────────────────────────
// A check that could not run must never look like a check that found nothing.
// Those are opposite facts and the screen renders them differently: "could not
// be checked" is amber and says why, "nothing found" is green and means it.
//
// Nothing on this screen changes anything. Every finding ends in a sentence
// about what a person should do, not a button that does it — because every one
// of these findings needs a human to establish what actually happened before
// anything is posted or reversed.

import React, { useCallback, useEffect, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import ErrorBanner from '../../components/fms/ErrorBanner';

const TONE = {
  critical: { border: 'var(--danger)',  bg: 'var(--danger-soft)', text: 'var(--danger)', label: 'Needs attention' },
  warn:     { border: 'var(--gold)',    bg: 'var(--gold-soft)',   text: 'var(--gold)',   label: 'Worth a look' },
  info:     { border: 'var(--info)',    bg: 'var(--info-soft)',   text: 'var(--info)',   label: 'For information' },
  none:     { border: 'var(--border)',  bg: 'transparent',        text: 'var(--sage)',   label: 'Clear' },
};

const OVERALL = {
  critical: 'Something needs attention',
  warn: 'A few things are worth a look',
  info: 'Nothing wrong, a couple of things to know',
  none: 'Everything checks out',
};

const Check = ({ check }) => {
  const [open, setOpen] = useState(false);
  const tone = TONE[check.severity] || TONE.none;
  const hasDetail = !!(check.detail || check.recommendation || check.affected?.length);

  return (
    <div className="rounded-lg border bg-white p-4"
      style={{ borderColor: tone.border, background: check.severity === 'none' ? 'white' : tone.bg }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{check.title}</h3>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ color: tone.text, background: 'white', border: `1px solid ${tone.border}` }}>
              {/* A failed check is neither clear nor a finding. Say so plainly. */}
              {check.ok ? tone.label : 'Could not run'}
            </span>
          </div>
          <p className="mt-1 text-sm">{check.headline}</p>
        </div>

        {hasDetail && (
          <button type="button" onClick={() => setOpen((o) => !o)}
            className="shrink-0 rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs">
            {open ? 'Less' : 'More'}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-2 text-xs leading-relaxed">
          {check.detail && <p>{check.detail}</p>}

          {check.recommendation && (
            <p className="rounded-md bg-white px-3 py-2">
              <span className="font-medium">What to do: </span>{check.recommendation}
            </p>
          )}

          {check.affected?.length > 0 && (
            <div className="overflow-x-auto rounded-md bg-white p-2">
              <table className="w-full text-left">
                <tbody>
                  {check.affected.slice(0, 25).map((row, i) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0">
                      {Object.entries(row)
                        .filter(([k]) => k !== '_id' && k !== 'id')
                        .slice(0, 5)
                        .map(([k, v]) => (
                          <td key={k} className="py-1.5 pr-3 align-top">
                            <span className="text-[var(--muted)]">{k}: </span>
                            <span className="break-all">
                              {v === null || v === undefined || v === ''
                                ? '—'
                                : String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 80)}
                            </span>
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {check.affected.length > 25 && (
                <p className="mt-1 text-[var(--muted)]">
                  Showing 25 of {check.affected.length}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Diagnostics = () => {
  const [report, setReport] = useState(null);
  const [syncSummary, setSyncSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fmsAPI.getDiagnostics();
      setReport(res?.data?.data ?? res?.data ?? null);
      // Secondary, and allowed to fail quietly — the checks are the point of
      // this screen and a missing sync history should not hide them.
      try {
        const s = await fmsAPI.getSyncLogs({ limit: 1 });
        setSyncSummary((s?.data?.data ?? s?.data)?.summary || []);
      } catch { /* no history yet */ }
    } catch (err) {
      setError(err); setReport(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const overallTone = TONE[report?.overall] || TONE.none;

  return (
    <FmsLayout
      title="Diagnostics"
      actions={
        <button type="button" onClick={load} disabled={loading}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40">
          {loading ? 'Checking…' : 'Run again'}
        </button>
      }
    >
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-relaxed">
        <p>
          These checks compare what the school system holds against what the books have
          recorded. <strong>Nothing here changes anything</strong> — every finding ends in
          something for a person to decide.
        </p>
      </div>

      {loading && !report && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      )}

      {report && (
        <>
          <div className="mb-4 rounded-lg border p-4"
            style={{ borderColor: overallTone.border, background: overallTone.bg }}>
            <p className="text-sm font-medium" style={{ color: overallTone.text }}>
              {OVERALL[report.overall]}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {report.checksRun} checks, {report.durationMs}ms
              {report.checksFailed > 0 && (
                <span className="text-[var(--gold)]">
                  {' · '}{report.checksFailed} could not run
                </span>
              )}
              {' · '}{new Date(report.ranAt).toLocaleString('en-IN')}
            </p>
          </div>

          <div className="space-y-3">
            {report.checks.map((c) => <Check key={c.id} check={c} />)}
          </div>

          {syncSummary.length > 0 && (
            <div className="mt-6 rounded-lg border border-[var(--border)] bg-white p-4">
              <h3 className="text-sm font-semibold">Last import run</h3>
              <table className="mt-2 w-full text-left text-xs">
                <thead className="text-[var(--muted)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-1.5 pr-3 font-medium">Source</th>
                    <th className="py-1.5 pr-3 font-medium">When</th>
                    <th className="py-1.5 pr-3 font-medium">Result</th>
                    <th className="py-1.5 font-medium">Runs</th>
                  </tr>
                </thead>
                <tbody>
                  {syncSummary.map((s) => (
                    <tr key={s.source} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-1.5 pr-3">{s.source}</td>
                      <td className="py-1.5 pr-3">
                        {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="py-1.5 pr-3"
                        style={{ color: ['failed', 'aborted'].includes(s.lastOutcome)
                          ? 'var(--danger)' : 'var(--muted)' }}>
                        {s.lastOutcome || '—'}
                      </td>
                      <td className="py-1.5">
                        {s.runs}
                        {s.failedRuns > 0 && (
                          <span className="text-[var(--danger)]"> · {s.failedRuns} failed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </FmsLayout>
  );
};

export default Diagnostics;
