// frontend/src/pages/FMS/CashBankBook.jsx
//
// Cash Book and Bank Book — SCR-50/51. Route /fms/books.
//
// ─── THE DAILY CLOSING IS A CONTROL, NOT PAPERWORK ───────────────────────────
// Somebody counts the physical cash and records what they found. If it differs
// from the books, that difference must be VERIFIED BY A DIFFERENT PERSON before
// it can be posted.
//
// That is the whole point: the person who counts cannot also be the person who
// signs off a shortfall. The backend enforces it; this screen makes sure nobody
// is surprised by it.
//
// A day left open cannot be reconciled later against what was actually there.

import React, { useCallback, useEffect, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import Money, { formatPaise } from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

function toPaise(v) {
  const n = Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return null;
  const p = Math.round(n * 100);
  return Math.abs(n * 100 - p) > 0.001 ? null : p;
}

const CashBankBook = () => {
  const [bookType, setBookType] = useState('cash');
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [closing, setClosing] = useState(null);   // { account, date, count }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      const res = await fmsAPI.getBook(bookType, params);
      setData(res?.data?.data ?? res?.data ?? null);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [bookType, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const submitClosing = async () => {
    const counted = toPaise(closing.count);
    if (counted === null) return;

    setSaving(true);
    try {
      await fmsAPI.closeDay({
        account: closing.account,
        date: closing.date,
        physicalCount: counted,
        varianceReason: closing.reason || undefined,
      });
      setClosing(null);
      load();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const rows = data?.days || data?.entries || [];
  const expectedPaise = data?.closingBalance;
  const countedPaise = closing ? toPaise(closing.count) : null;
  const variance = (countedPaise !== null && expectedPaise !== undefined)
    ? countedPaise - expectedPaise : null;

  return (
    <FmsLayout
      title={bookType === 'cash' ? 'Cash Book' : 'Bank Book'}
      actions={
        <div className="flex gap-1 rounded-md border border-[var(--border)] p-0.5">
          {['cash', 'bank'].map((t) => (
            <button key={t} type="button" onClick={() => setBookType(t)}
              className={`rounded px-3 py-1 text-sm capitalize ${
                bookType === t ? 'bg-[var(--mod)] text-white' : 'text-[var(--ink)]'
              }`}>{t}</button>
          ))}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-[var(--muted)]">From
          <input type="date" value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm" /></label>
        <label className="text-xs text-[var(--muted)]">To
          <input type="date" value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm" /></label>
      </div>

      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}
      {loading && <div className="h-40 animate-pulse rounded-lg bg-white" />}

      {!loading && data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase text-[var(--muted)]">Opening</div>
              <div className="mt-1 text-sm"><Money paise={data.openingBalance} /></div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase text-[var(--muted)]">Receipts</div>
              <div className="mt-1 text-sm"><Money paise={data.totalReceipts} /></div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase text-[var(--muted)]">Payments</div>
              <div className="mt-1 text-sm"><Money paise={data.totalPayments} /></div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase text-[var(--muted)]">Closing</div>
              <div className="mt-1 text-sm font-semibold"><Money paise={data.closingBalance} /></div>
            </div>
          </div>

          {bookType === 'cash' && (data.accounts || []).length > 0 && !closing && (
            <button type="button"
              onClick={() => setClosing({
                account: data.accounts[0]._id,
                date: new Date().toISOString().slice(0, 10),
                count: '', reason: '',
              })}
              className="mb-4 rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm hover:bg-[var(--canvas)]">
              Count the cash and close the day
            </button>
          )}

          {closing && (
            <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-5">
              <h2 className="text-sm font-semibold">Daily cash closing</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Count the physical cash and enter what is actually there. If it differs from
                the books, someone else must verify the difference before it can be posted.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="text-xs text-[var(--muted)]">Account
                  <select value={closing.account}
                    onChange={(e) => setClosing((c) => ({ ...c, account: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                    {(data.accounts || []).map((a) => (
                      <option key={a._id} value={a._id}>{a.accountCode} — {a.accountName}</option>
                    ))}
                  </select></label>
                <label className="text-xs text-[var(--muted)]">Date
                  <input type="date" value={closing.date}
                    onChange={(e) => setClosing((c) => ({ ...c, date: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" /></label>
                <label className="text-xs text-[var(--muted)]">Counted ₹
                  <input value={closing.count} inputMode="decimal" autoFocus
                    onChange={(e) => setClosing((c) => ({ ...c, count: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-right text-sm" /></label>
              </div>

              {/* The variance, shown as it is typed. */}
              {variance !== null && (
                <div className={`mt-3 rounded-md px-4 py-2.5 text-sm ${
                  variance === 0
                    ? 'bg-[var(--canvas)]'
                    : 'bg-[var(--gold-soft)] text-[var(--gold)]'
                }`}>
                  {variance === 0 ? (
                    'The count matches the books exactly.'
                  ) : (
                    <>
                      <strong>{formatPaise(Math.abs(variance))} {variance < 0 ? 'short' : 'over'}</strong>
                      {' '}against the books ({formatPaise(expectedPaise)}).
                      <div className="mt-1 text-xs">
                        A difference must be explained, and verified by someone other than
                        whoever counted, before it can be posted to the books.
                      </div>
                    </>
                  )}
                </div>
              )}

              {variance !== null && variance !== 0 && (
                <label className="mt-3 block text-xs text-[var(--muted)]">
                  Reason for the difference — required
                  <textarea rows={2} value={closing.reason}
                    onChange={(e) => setClosing((c) => ({ ...c, reason: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-[var(--border)] p-2 text-sm" />
                </label>
              )}

              <div className="mt-4 flex gap-2">
                <button type="button" disabled={saving || countedPaise === null
                  || (variance !== 0 && !closing.reason?.trim())}
                  onClick={submitClosing}
                  className="rounded-md bg-[var(--mod)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                  {saving ? 'Recording…' : 'Record the count'}
                </button>
                <button type="button" onClick={() => setClosing(null)}
                  className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancel</button>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState title="No movement in this period"
              reason={`Nothing has been received into or paid out of ${bookType} for the dates selected.`} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--canvas)]">
                    <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Particulars</th>
                    <th className="px-4 py-2.5 text-right text-xs uppercase text-[var(--muted)]">Receipts</th>
                    <th className="px-4 py-2.5 text-right text-xs uppercase text-[var(--muted)]">Payments</th>
                    <th className="px-4 py-2.5 text-right text-xs uppercase text-[var(--muted)]">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d, i) => (
                    <tr key={d.date || i} className="border-b border-[var(--border)] last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 text-xs">
                        {d.date ? new Date(d.date).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="px-4 py-2">{d.narration || d.particulars || '—'}</td>
                      <td className="px-4 py-2 text-right"><Money paise={d.receipts ?? d.debit} /></td>
                      <td className="px-4 py-2 text-right"><Money paise={d.payments ?? d.credit} /></td>
                      <td className="px-4 py-2 text-right text-[var(--muted)]">
                        <Money paise={d.balance ?? d.runningBalance} />
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

export default CashBankBook;