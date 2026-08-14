// frontend/src/pages/FMS/GeneralLedger.jsx
//
// General Ledger — SCR-46. Route /fms/ledger.
//
// ─── FIGURES GO ON THEIR NATURAL SIDE ────────────────────────────────────────
// The API returns { balance, naturalBalance, drCr } for opening and closing.
//
//   balance         raw Σdebit − Σcredit — negative for income and liabilities
//   naturalBalance  positive when the account sits on its normal side
//
// "Tuition Fee Income: −₹90,000" is arithmetically true and useless to a reader.
// Use naturalBalance, and show Dr/Cr so the direction is still explicit.

import React, { useCallback, useEffect, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import Money from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

const Balance = ({ value }) => {
  if (!value) return <span className="text-[var(--muted)]">—</span>;
  return (
    <span>
      <Money paise={value.naturalBalance} />
      {value.drCr && (
        <span className="ml-1 text-xs text-[var(--muted)]">{value.drCr}</span>
      )}
    </span>
  );
};

const GeneralLedger = () => {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fmsAPI.getAccounts({ limit: 500, status: 'active' });
        setAccounts(res?.data?.data ?? res?.data ?? []);
      } catch (err) {
        setError(err);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!selected) { setData(null); return; }
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 100 };
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      const res = await fmsAPI.getAccountLedger(selected, params);
      setData(res?.data?.data ?? res?.data ?? null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [selected, range.from, range.to, page]);

  useEffect(() => { load(); }, [load]);

  const entries = data?.entries || [];

  return (
    <FmsLayout title="General Ledger">
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-white p-4">
        <label className="text-xs text-[var(--muted)]">
          Account
          <select
            value={selected}
            onChange={(e) => { setSelected(e.target.value); setPage(1); }}
            className="ml-2 min-w-[18rem] rounded-md border border-[var(--border)] px-2 py-1 text-sm text-[var(--ink)]"
          >
            <option value="">Choose an account…</option>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.accountCode} — {a.accountName}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[var(--muted)]">
          From
          <input type="date" value={range.from}
            onChange={(e) => { setRange((r) => ({ ...r, from: e.target.value })); setPage(1); }}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          To
          <input type="date" value={range.to}
            onChange={(e) => { setRange((r) => ({ ...r, to: e.target.value })); setPage(1); }}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm" />
        </label>
      </div>

      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      {!selected && (
        <EmptyState
          title="Choose an account"
          reason="Pick an account above to see every posting made to it, with a running balance."
        />
      )}

      {loading && <div className="h-48 animate-pulse rounded-lg bg-white" />}

      {selected && !loading && data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Opening</div>
              <div className="mt-1 text-sm font-medium"><Balance value={data.opening} /></div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Debits</div>
              <div className="mt-1 text-sm"><Money paise={data.movement?.totalDebit} /></div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Credits</div>
              <div className="mt-1 text-sm"><Money paise={data.movement?.totalCredit} /></div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Closing</div>
              <div className="mt-1 text-sm font-semibold"><Balance value={data.closing} /></div>
            </div>
          </div>

          {entries.length === 0 ? (
            <EmptyState
              title="No postings in this period"
              reason="This account exists but nothing has been posted to it for the dates selected."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--canvas)]">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Voucher</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Narration</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Debit</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Credit</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e._id} className="border-b border-[var(--border)] last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 text-xs">
                        {new Date(e.entryDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {e.voucherNumber}
                        {/* Reversals draw from their own REV- series so receipt
                            numbers stay gapless. Show them as reversals. */}
                        {e.isReversal && (
                          <span className="ml-1 rounded bg-[var(--gold-soft)] px-1 text-[10px] uppercase text-[var(--gold)]">
                            reversal
                          </span>
                        )}
                      </td>
                      <td className="max-w-md px-4 py-2">
                        {e.narration}
                        {e.partyName && (
                          <span className="ml-1 text-xs text-[var(--muted)]">· {e.partyName}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {e.debit ? <Money paise={e.debit} /> : <span className="text-[var(--muted)]">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {e.credit ? <Money paise={e.credit} /> : <span className="text-[var(--muted)]">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--muted)]">
                        <Money paise={e.runningBalance} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.pagination && data.pagination.total > entries.length && (
            <div className="mt-3 flex justify-end gap-2 text-xs">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40">Previous</button>
              <button type="button" onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-[var(--border)] px-3 py-1">Next</button>
            </div>
          )}
        </>
      )}
    </FmsLayout>
  );
};

export default GeneralLedger;