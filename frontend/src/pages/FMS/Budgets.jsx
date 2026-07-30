// frontend/src/pages/FMS/Budgets.jsx
//
// Budgets — SCR-22/23/24. Route /fms/budgets.
//
// ─── A REVISION PRESERVES THE ORIGINAL ───────────────────────────────────────
// When a budget is revised the original amount is kept, not overwritten. Both
// are shown, along with every revision and its reason — because "we budgeted
// 50,000 and it became 80,000 in March, for this reason" is a different and far
// more useful statement than "the budget is 80,000".
//
// ─── consumed = actual + committed ───────────────────────────────────────────
// Actual is money already spent. Committed is approved but not yet paid. Both
// reduce what is available, and both are shown separately so the arithmetic is
// visible rather than implied.

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

const Budgets = () => {
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ account: '', amount: '', policy: 'warn' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [b, a] = await Promise.all([
        fmsAPI.getBudgets({ limit: 200 }),
        fmsAPI.getAccounts({ limit: 500, status: 'active' }),
      ]);
      setRows(b?.data?.data ?? b?.data ?? []);
      setAccounts((a?.data?.data ?? a?.data ?? []).filter((x) => x.accountType === 'expense'));
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const amount = toPaise(form.amount);
    if (amount === null) return;
    try {
      await fmsAPI.createBudget({
        account: form.account, budgetAmount: amount, overBudgetPolicy: form.policy,
      });
      setCreating(false); setForm({ account: '', amount: '', policy: 'warn' }); load();
    } catch (err) { setError(err); }
  };

  const revise = async (b) => {
    const raw = window.prompt(`Revise the budget for ${b.accountName}.\n\nNew amount in rupees:`);
    if (!raw) return;
    const amount = toPaise(raw);
    if (amount === null) { setError(new Error('That is not a valid rupee amount.')); return; }

    const reason = window.prompt('Reason for the revision — this is kept on the record:');
    if (!reason) return;

    try {
      // The backend keeps the original amount and appends this revision.
      await fmsAPI.reviseBudget(b._id, { revisedAmount: amount, reason });
      load();
    } catch (err) { setError(err); }
  };

  return (
    <FmsLayout title="Budgets"
      actions={!creating && (
        <button type="button" onClick={() => setCreating(true)}
          className="rounded-md bg-[var(--mod)] px-4 py-1.5 text-sm font-medium text-white">New budget</button>
      )}>

      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      {creating && (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold">New budget</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs text-[var(--muted)]">Expense head
              <select value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                <option value="">Choose…</option>
                {accounts.map((a) => <option key={a._id} value={a._id}>{a.accountCode} — {a.accountName}</option>)}
              </select></label>
            <label className="text-xs text-[var(--muted)]">Amount ₹
              <input value={form.amount} inputMode="decimal"
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-right text-sm" /></label>
            <label className="text-xs text-[var(--muted)]">If exceeded
              <select value={form.policy} onChange={(e) => setForm((f) => ({ ...f, policy: e.target.value }))}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                <option value="warn">Warn, but allow</option>
                <option value="block">Block the expense</option>
              </select></label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={create} disabled={!form.account || !form.amount}
              className="rounded-md bg-[var(--mod)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Create</button>
            <button type="button" onClick={() => setCreating(false)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {loading && <div className="h-32 animate-pulse rounded-lg bg-white" />}

      {!loading && rows.length === 0 && !creating && (
        <EmptyState title="No budgets set"
          reason="Without a budget, an expense check reports 'not checked' rather than 'within budget' — those are different statements, and only one of them is reassuring."
          hint="Budgets are set per expense head, per financial year." />
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((b) => {
            const over = b.isOverBudget || (b.available ?? 0) < 0;
            const pct = Math.round((b.utilisation || 0) * 100);
            return (
              <div key={b._id} className={`rounded-lg border bg-white p-4 ${
                over ? 'border-[var(--danger)]' : 'border-[var(--border)]'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium">
                      <span className="font-mono text-xs text-[var(--muted)]">{b.accountCode}</span>
                      <span className="ml-2">{b.accountName}</span>
                    </div>
                    <div className="mt-0.5 text-xs capitalize text-[var(--muted)]">
                      {b.budgetStatus}
                      {b.overBudgetPolicy === 'block' && ' · blocks over-budget expenses'}
                    </div>
                  </div>
                  <button type="button" onClick={() => revise(b)}
                    className="shrink-0 text-xs text-[var(--muted)] underline">Revise</button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                  <div>
                    <div className="text-xs text-[var(--muted)]">Budget</div>
                    <Money paise={b.effectiveBudget ?? b.budgetAmount} />
                    {/* The original survives a revision — show both. */}
                    {b.revisedAmount !== undefined && b.revisedAmount !== null
                      && b.revisedAmount !== b.budgetAmount && (
                      <div className="text-xs text-[var(--muted)]">
                        originally {formatPaise(b.budgetAmount)}
                      </div>
                    )}
                  </div>
                  <div><div className="text-xs text-[var(--muted)]">Spent</div><Money paise={b.actual} /></div>
                  <div><div className="text-xs text-[var(--muted)]">Committed</div><Money paise={b.committed} /></div>
                  <div><div className="text-xs text-[var(--muted)]">Available</div>
                    <span className={over ? 'text-[var(--danger)]' : ''}><Money paise={b.available} /></span></div>
                  <div><div className="text-xs text-[var(--muted)]">Used</div>{pct}%</div>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--canvas)]">
                  <div className={`h-full ${over ? 'bg-[var(--danger)]' : 'bg-[var(--mod)]'}`}
                    style={{ width: `${Math.min(100, pct)}%` }} />
                </div>

                {(b.revisions || []).length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-[var(--muted)]">
                      {b.revisions.length} revision(s)
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs">
                      {b.revisions.map((r, i) => (
                        <li key={i} className="text-[var(--muted)]">
                          {formatPaise(r.fromAmount)} → {formatPaise(r.toAmount)} — {r.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </FmsLayout>
  );
};

export default Budgets;