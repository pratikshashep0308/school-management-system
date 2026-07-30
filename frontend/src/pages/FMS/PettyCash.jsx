// frontend/src/pages/FMS/PettyCash.jsx
//
// Petty Cash — SCR-43/44. Route /fms/petty-cash.
//
// ─── THE IMPREST POSITION IS THE POINT ───────────────────────────────────────
// A petty cash float is a fixed amount of money that gets spent down and topped
// back up. The useful question is never "how much has been spent" on its own —
// it is "how much is in the tin right now, and is it time to replenish".
// Both are shown together for that reason.
//
// ─── LIMITS ARE THE BACKEND'S TO ENFORCE ─────────────────────────────────────
// A single expense above the float's per-transaction limit is refused by the
// server, and the message tells the user to raise an expense request instead.
// That refusal is surfaced rather than pre-empted here.

import React, { useCallback, useEffect, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import Money from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

function toPaise(v) {
  const n = Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return null;
  const p = Math.round(n * 100);
  // Reject anything that will not convert cleanly rather than rounding it.
  return Math.abs(n * 100 - p) > 0.001 ? null : p;
}

const PettyCash = () => {
  const [floats, setFloats] = useState([]);
  const [selected, setSelected] = useState(null);
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [txnOpen, setTxnOpen] = useState(false);
  const [txn, setTxn] = useState({ type: 'expense', amount: '', account: '', particulars: '', paidTo: '' });
  const [accounts, setAccounts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const loadFloats = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fmsAPI.getPettyCashFloats();
      const list = res?.data?.data ?? res?.data ?? [];
      setFloats(Array.isArray(list) ? list : []);
      if (Array.isArray(list) && list.length && !selected) setSelected(list[0]);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { loadFloats(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fmsAPI.getAccounts({ isPostable: true })
      .then((r) => setAccounts(r?.data?.data ?? r?.data ?? []))
      .catch(() => setAccounts([]));
  }, []);

  const loadBook = useCallback(async () => {
    if (!selected?._id) return;
    try {
      const res = await fmsAPI.getPettyCashBook(selected._id);
      setBook(res?.data?.data ?? res?.data ?? null);
    } catch (err) {
      setBook(null);
      setError(err);
    }
  }, [selected]);

  useEffect(() => { loadBook(); }, [loadBook]);

  const submitTxn = async () => {
    if (!selected?._id) return;
    const paise = toPaise(txn.amount);
    if (paise === null || paise <= 0) {
      setActionError({ response: { data: { error: {
        message: 'Enter a valid amount in rupees, to at most two decimal places.',
      } } } });
      return;
    }

    setSubmitting(true); setActionError(null);
    try {
      await fmsAPI.addPettyCashTxn(selected._id, {
        transactionType: txn.type,
        amount: paise,
        account: txn.account || undefined,
        particulars: txn.particulars,
        paidTo: txn.paidTo || undefined,
      });
      setTxnOpen(false);
      setTxn({ type: 'expense', amount: '', account: '', particulars: '', paidTo: '' });
      await Promise.all([loadFloats(), loadBook()]);
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const balance = book?.closingBalance ?? selected?.currentBalance ?? null;
  const floatAmt = selected?.floatAmount ?? null;
  const threshold = selected?.replenishThreshold ?? null;
  const needsTopUp = balance !== null && threshold !== null && balance <= threshold;

  return (
    <FmsLayout title="Petty Cash">
      {error && <ErrorBanner error={error} />}

      {loading && <div className="py-10 text-center text-[var(--muted)]">Loading…</div>}

      {!loading && floats.length === 0 && (
        <EmptyState
          title="No petty cash float has been set up"
          reason={error ? undefined : 'A float is a fixed sum of cash held for small day-to-day expenses.'}
          hint="A float needs a cash account in the Chart of Accounts before it can be created."
        />
      )}

      {!loading && floats.length > 0 && (
        <>
          {floats.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {floats.map((f) => (
                <button
                  key={f._id}
                  onClick={() => setSelected(f)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    selected?._id === f._id ? 'bg-[var(--mod)] text-white' : 'bg-[var(--canvas)] text-[var(--ink)] border border-[var(--border)]'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}

          {/* ── The imprest position ──────────────────────────────────────── */}
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Float amount</div>
              <div className="mt-1 text-xl font-semibold"><Money paise={floatAmt} /></div>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">In hand now</div>
              <div className="mt-1 text-xl font-semibold"><Money paise={balance} /></div>
            </div>
            <div className={`rounded-lg border p-4 ${
              needsTopUp ? 'border-[var(--gold)] bg-[var(--gold-soft)]' : 'border-[var(--border)]'
            }`}>
              <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Replenish at</div>
              <div className="mt-1 text-xl font-semibold"><Money paise={threshold} /></div>
              {needsTopUp && (
                <div className="mt-1 text-xs text-[var(--gold)]">Due for replenishment</div>
              )}
            </div>
          </div>

          <div className="mb-3 flex justify-end">
            <button
              onClick={() => { setTxnOpen(true); setActionError(null); }}
              className="rounded-md bg-[var(--mod)] px-3 py-1.5 text-sm text-white"
            >
              Record a transaction
            </button>
          </div>

          {/* ── The book ──────────────────────────────────────────────────── */}
          {book?.entries?.length ? (
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--canvas)] text-left text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Particulars</th>
                    <th className="px-3 py-2">Paid to</th>
                    <th className="px-3 py-2 text-right">In</th>
                    <th className="px-3 py-2 text-right">Out</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {book.entries.map((e, i) => (
                    <tr key={e._id || i} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">
                        {e.transactionDate
                          ? new Date(e.transactionDate).toLocaleDateString('en-IN')
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {e.particulars || '—'}
                        {e.status === 'cancelled' && (
                          <span className="ml-2 text-xs text-[var(--muted)]">(cancelled)</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{e.paidTo || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {e.inAmount ? <Money paise={e.inAmount} /> : ''}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {e.outAmount ? <Money paise={e.outAmount} /> : ''}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Money paise={e.runningBalance} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No transactions yet"
              hint="Money issued to the float and expenses paid from it will appear here."
            />
          )}
        </>
      )}

      {/* ── Transaction dialog ───────────────────────────────────────────── */}
      {txnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Record a transaction</h3>

            {actionError && <div className="mt-3"><ErrorBanner error={actionError} /></div>}

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Type</span>
                <select
                  value={txn.type}
                  onChange={(e) => setTxn({ ...txn, type: e.target.value })}
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5"
                >
                  <option value="expense">Expense — money out</option>
                  <option value="replenishment">Replenishment — money in</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-[var(--muted)]">Amount (₹)</span>
                <input
                  value={txn.amount}
                  onChange={(e) => setTxn({ ...txn, amount: e.target.value })}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5"
                />
              </label>

              {txn.type === 'expense' && (
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">Expense head</span>
                  <select
                    value={txn.account}
                    onChange={(e) => setTxn({ ...txn, account: e.target.value })}
                    className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5"
                  >
                    <option value="">Select a head…</option>
                    {accounts
                      .filter((a) => a.accountType === 'expense')
                      .map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.accountCode} — {a.accountName}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              <label className="block text-sm">
                <span className="text-[var(--muted)]">Particulars</span>
                <input
                  value={txn.particulars}
                  onChange={(e) => setTxn({ ...txn, particulars: e.target.value })}
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5"
                />
              </label>

              {txn.type === 'expense' && (
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">Paid to</span>
                  <input
                    value={txn.paidTo}
                    onChange={(e) => setTxn({ ...txn, paidTo: e.target.value })}
                    className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5"
                  />
                </label>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setTxnOpen(false)}
                className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                onClick={submitTxn}
                disabled={submitting}
                className="rounded-md bg-[var(--mod)] px-4 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {submitting ? 'Recording…' : 'Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FmsLayout>
  );
};

export default PettyCash;