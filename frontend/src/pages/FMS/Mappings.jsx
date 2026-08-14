// frontend/src/pages/FMS/Mappings.jsx
//
// Fee type → income account mappings. Route /fms/settings/mappings.
//
// ─── WHY THIS SCREEN PREVENTS A FAILURE RATHER THAN CAUSING ONE ──────────────
// An unmapped fee type fails the whole ingest record, deliberately. It is NOT
// pooled into "unclassified", because pooling would hide a newly-added fee type
// for a year — the money would be in the books, in the wrong place, looking
// fine.
//
// So the import refuses and names the fee type. This screen is where that gets
// fixed, and ideally before the import is ever run.

import React, { useCallback, useEffect, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

const Mappings = () => {
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({ sourceKey: '', sourceLabel: '', account: '' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [m, a] = await Promise.all([
        fmsAPI.getMappings({ mappingType: 'feeType' }),
        fmsAPI.getAccounts({ limit: 500, status: 'active' }),
      ]);
      setRows(m?.data?.data ?? m?.data ?? []);
      setAccounts((a?.data?.data ?? a?.data ?? []).filter((x) => x.accountType === 'income'));
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await fmsAPI.upsertMapping({
        mappingType: 'feeType',
        sourceKey: draft.sourceKey,
        sourceLabel: draft.sourceLabel || undefined,
        account: draft.account,
      });
      setDraft({ sourceKey: '', sourceLabel: '', account: '' });
      load();
    } catch (err) { setError(err); }
  };

  return (
    <FmsLayout title="Fee type mappings">
      <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-relaxed">
        <p>Each fee type in the school system needs to know which income account its money belongs to.</p>
        <p className="mt-2 text-[var(--muted)]">
          A fee type with no mapping will <strong>fail the import and name itself</strong>,
          rather than being quietly pooled into an unclassified account — which would hide a
          newly-added fee type for a year while the money sat in the wrong place.
        </p>
      </div>

      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold">Add a mapping</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs text-[var(--muted)]">Fee type id
            <input value={draft.sourceKey} onChange={(e) => setDraft((d) => ({ ...d, sourceKey: e.target.value }))}
              placeholder="from the school system"
              className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-[var(--muted)]">Label
            <input value={draft.sourceLabel} onChange={(e) => setDraft((d) => ({ ...d, sourceLabel: e.target.value }))}
              placeholder="e.g. Tuition Fee"
              className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-[var(--muted)]">Income account
            <select value={draft.account} onChange={(e) => setDraft((d) => ({ ...d, account: e.target.value }))}
              className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
              <option value="">Choose…</option>
              {accounts.map((a) => <option key={a._id} value={a._id}>{a.accountCode} — {a.accountName}</option>)}
            </select></label>
        </div>
        <button type="button" onClick={save} disabled={!draft.sourceKey || !draft.account}
          className="mt-3 rounded-md bg-[var(--mod)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          Save mapping
        </button>
      </div>

      {loading && <div className="h-32 animate-pulse rounded-lg bg-white" />}

      {!loading && rows.length === 0 && (
        <EmptyState title="No mappings yet"
          reason="Fee imports will refuse until each fee type knows where its money goes." />
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--canvas)]">
                <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Fee type</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Goes to</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m._id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2">
                    {m.sourceLabel || '—'}
                    <div className="font-mono text-[10px] text-[var(--muted)]">{m.sourceKey}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs text-[var(--muted)]">{m.accountCode}</span>
                    <span className="ml-2">{m.accountName}</span>
                  </td>
                  <td className="px-4 py-2 text-xs">{m.isActive === false ? 'inactive' : 'active'}</td>
                  <td className="px-4 py-2 text-right">
                    {m.isActive !== false && (
                      <button type="button"
                        onClick={async () => {
                          try { await fmsAPI.deactivateMapping(m._id); load(); }
                          catch (err) { setError(err); }
                        }}
                        className="text-xs text-[var(--muted)] underline">Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FmsLayout>
  );
};

export default Mappings;