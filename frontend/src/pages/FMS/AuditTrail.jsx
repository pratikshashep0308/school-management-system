// frontend/src/pages/FMS/AuditTrail.jsx
//
// Audit trail — SCR-61. Route /fms/audit.
//
// ─── SHOW THE DIFF, NOT THE SNAPSHOTS ────────────────────────────────────────
// The API returns a `changes` array — the fields that actually moved, with
// money fields first. Rendering raw before/after would put forty unchanged
// fields on screen for every entry, which is how an audit trail becomes
// unreadable and therefore unread.
//
// Read-only by construction: there is no write endpoint, and the records cannot
// be edited or deleted. An audit trail with an edit button is not one.

import React, { useCallback, useEffect, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import Money from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

const AuditTrail = () => {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ actions: [], entities: [] });
  const [filters, setFilters] = useState({ entity: '', action: '', actorEmail: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fmsAPI.getAuditActions();
        setMeta(res?.data?.data ?? res?.data ?? { actions: [], entities: [] });
      } catch (_) { /* filters are a convenience */ }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = { page, limit: 50 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await fmsAPI.getAuditTrail(params);
      setRows(res?.data?.data ?? res?.data ?? []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  return (
    <FmsLayout title="Audit Trail">
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-white p-4">
        <label className="text-xs text-[var(--muted)]">Record type
          <select value={filters.entity} onChange={(e) => setF('entity', e.target.value)}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm">
            <option value="">All</option>
            {(meta.entities || []).map((e) => <option key={e} value={e}>{e}</option>)}
          </select></label>
        <label className="text-xs text-[var(--muted)]">Action
          <select value={filters.action} onChange={(e) => setF('action', e.target.value)}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm">
            <option value="">All</option>
            {(meta.actions || []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select></label>
        <label className="text-xs text-[var(--muted)]">Who
          <input value={filters.actorEmail} onChange={(e) => setF('actorEmail', e.target.value)}
            placeholder="email"
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm" /></label>
        <label className="text-xs text-[var(--muted)]">From
          <input type="date" value={filters.from} onChange={(e) => setF('from', e.target.value)}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm" /></label>
        <label className="text-xs text-[var(--muted)]">To
          <input type="date" value={filters.to} onChange={(e) => setF('to', e.target.value)}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm" /></label>
      </div>

      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}
      {loading && <div className="h-40 animate-pulse rounded-lg bg-white" />}

      {!loading && rows.length === 0 && (
        <EmptyState title="Nothing recorded yet"
          reason="Every change to a financial record is logged here — who made it, when, from where, and exactly what moved." />
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r._id} className="rounded-lg border border-[var(--border)] bg-white">
                <button type="button"
                  onClick={() => setOpen((o) => ({ ...o, [r._id]: !o[r._id] }))}
                  className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left">
                  <div className="min-w-0">
                    <div className="text-sm">
                      <span className="font-medium capitalize">{r.action}</span>
                      <span className="ml-2 font-mono text-xs text-[var(--muted)]">{r.entity}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      {r.actorEmail || 'system'}
                      {r.actorRole ? ` · ${r.actorRole}` : ''}
                      {r.ipAddress ? ` · ${r.ipAddress}` : ''}
                    </div>
                    {(r.changes || []).length > 0 && (
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {r.changes.length} field(s) changed: {r.changes.slice(0, 4).map((c) => c.field).join(', ')}
                        {r.changes.length > 4 ? '…' : ''}
                      </div>
                    )}
                    {r.notes && <div className="mt-1 text-xs">{r.notes}</div>}
                  </div>
                  <div className="shrink-0 text-right text-xs text-[var(--muted)]">
                    {r.at ? new Date(r.at).toLocaleString('en-IN') : ''}
                  </div>
                </button>

                {/* The diff — what actually moved, money first. */}
                {open[r._id] && (r.changes || []).length > 0 && (
                  <div className="border-t border-[var(--border)] px-4 py-3">
                    <table className="w-full text-xs">
                      <tbody>
                        {r.changes.map((c) => (
                          <tr key={c.field} className="border-b border-[var(--border)] last:border-0">
                            <td className="py-1.5 pr-3 font-medium">{c.field}</td>
                            <td className="py-1.5 pr-3 text-[var(--muted)]">
                              {c.isMoney ? <Money paise={c.from} /> : JSON.stringify(c.from)}
                            </td>
                            <td className="py-1.5 pr-3 text-[var(--muted)]">→</td>
                            <td className="py-1.5">
                              {c.isMoney ? <Money paise={c.to} /> : JSON.stringify(c.to)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-end gap-2 text-xs">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40">Previous</button>
            <button type="button" onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-[var(--border)] px-3 py-1">Next</button>
          </div>

          <p className="mt-4 text-xs text-[var(--muted)]">
            Records here cannot be edited or removed. An audit trail that can be changed is
            not one.
          </p>
        </>
      )}
    </FmsLayout>
  );
};

export default AuditTrail;