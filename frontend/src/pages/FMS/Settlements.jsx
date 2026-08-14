// frontend/src/pages/FMS/Settlements.jsx
//
// Settlement of online collections. Route /fms/banking/settlements.
//
// ─── NOTHING ELSE IN THE SYSTEM SHOWS THIS ───────────────────────────────────
// Every online and UPI fee receipt posts to 1202 Bank — Online Collections, not
// to the bank account. That is deliberate: the money has not settled yet, and
// posting it straight to the bank would overstate the balance and leave
// reconciliation nothing to match.
//
// It sits there until somebody settles it against the bank credit that actually
// arrives. The bank shows ONE credit for a day's collections; the clearing head
// holds a dozen individual receipts. Settlement turns many into one, and it has
// to happen before bank reconciliation can work at all.
//
// Without this screen nobody learns the task exists until the clearing head has
// months in it and the bank balance reads low. That is why it was built.
//
// ─── CHARGES ARE POSTED, NEVER NETTED ────────────────────────────────────────
// A gateway credits the NET of its fees. Netting the difference against income
// would understate both the income and the expense, so a short settlement
// REQUIRES an expense account to carry the charge.

import React, { useCallback, useEffect, useMemo, useState } from 'react';

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

const AGE_TONE = (days) =>
  days >= 15 ? 'text-[var(--danger)] font-medium'
    : days >= 8 ? 'text-[var(--gold)]'
      : 'text-[var(--muted)]';

const Settlements = () => {
  const [pending, setPending] = useState(null);
  const [status, setStatus] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState({});
  const [form, setForm] = useState({ bankAccount: '', reference: '', amount: '', date: '', feeAccount: '' });
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [p, s, accts] = await Promise.all([
        fmsAPI.getPendingSettlements(),
        fmsAPI.getSettlementStatus(),
        fmsAPI.getAccounts({ limit: 500, status: 'active' }),
      ]);
      setPending(p?.data?.data ?? p?.data ?? null);
      setStatus(s?.data?.data ?? s?.data ?? null);

      const all = accts?.data?.data ?? accts?.data ?? [];
      setBankAccounts(all.filter((a) => a.isBankAccount));
      setExpenseAccounts(all.filter((a) => a.accountType === 'expense'));
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const entries = pending?.entries || [];
  const chosen = entries.filter((e) => selected[e._id]);
  const grossPaise = chosen.reduce((s, e) => s + (e.debit || 0), 0);
  const settledPaise = form.amount ? toPaise(form.amount) : grossPaise;
  const chargesPaise = settledPaise === null ? null : grossPaise - settledPaise;

  const needsChargeAccount = chargesPaise !== null && chargesPaise > 0;

  const suggest = async () => {
    const amount = toPaise(form.amount);
    if (amount === null) return;
    try {
      const res = await fmsAPI.suggestSettlement({ amount });
      const s = res?.data?.data ?? res?.data;
      setSuggestion(s);
      if (s?.matched) {
        setSelected(Object.fromEntries(s.entries.map((e) => [e._id, true])));
      }
    } catch (err) { setError(err); }
  };

  const settle = async () => {
    setSaving(true); setError(null);
    try {
      await fmsAPI.createSettlement({
        entryIds: chosen.map((e) => e._id),
        bankAccount: form.bankAccount,
        settlementReference: form.reference,
        settlementDate: form.date || undefined,
        settledAmount: form.amount ? toPaise(form.amount) : undefined,
        feeAccount: needsChargeAccount ? form.feeAccount : undefined,
      });
      setSelected({});
      setForm({ bankAccount: '', reference: '', amount: '', date: '', feeAccount: '' });
      setSuggestion(null);
      load();
    } catch (err) {
      setError(err);
    } finally { setSaving(false); }
  };

  const buckets = useMemo(() => Object.entries(pending?.ageBuckets || {}), [pending]);

  return (
    <FmsLayout title="Online collections awaiting settlement">
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}
      {loading && <div className="h-40 animate-pulse rounded-lg bg-white" />}

      {!loading && (
        <>
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-relaxed">
            <p>
              Online and UPI fee payments are recorded against{' '}
              {/* Falls back to the code when the chart has not been set up, so
                  the sentence does not read "recorded against , not the bank
                  account" with a hole where the name should be. */}
              <strong>
                {pending?.clearingAccount
                  ? `${pending.clearingAccount.code} ${pending.clearingAccount.name}`
                  : '1202 Bank — Online Collections'}
              </strong>,
              not the bank account, because the money has not reached the bank yet.
            </p>
            <p className="mt-2 text-[var(--muted)]">
              When the bank credit arrives, match it to the receipts it covers here. Until
              that happens the balance below keeps growing and the bank balance reads low.
              <strong className="text-[var(--ink)]"> This is a weekly task.</strong>
            </p>
          </div>

          {/* The warning that makes a neglected queue visible. */}
          {(pending?.note || status?.warning) && (
            <div className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              {status?.warning || pending?.note}
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase text-[var(--muted)]">Waiting</div>
              <div className="mt-1 text-sm font-semibold">{pending?.count ?? 0} receipts</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase text-[var(--muted)]">Total</div>
              <div className="mt-1 text-sm font-semibold"><Money paise={pending?.totalAmount} /></div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase text-[var(--muted)]">Oldest</div>
              <div className={`mt-1 text-sm ${AGE_TONE(pending?.oldestAgeDays || 0)}`}>
                {pending?.oldestAgeDays ?? 0} days
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <div className="text-xs uppercase text-[var(--muted)]">Settled so far</div>
              <div className="mt-1 text-sm">{status?.settlementsRecorded ?? 0}</div>
            </div>
          </div>

          {buckets.length > 0 && (pending?.count ?? 0) > 0 && (
            <div className="mb-4 flex gap-3 text-xs">
              {buckets.map(([label, amount]) => (
                <span key={label} className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5">
                  <span className="text-[var(--muted)]">{label} days </span>
                  {formatPaise(amount)}
                </span>
              ))}
            </div>
          )}

          {entries.length === 0 ? (
            <EmptyState
              title="Nothing waiting to be settled"
              reason={status?.gatewayNote || 'All online collections have been matched to bank credits.'}
            />
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--canvas)]">
                      <th className="w-10 px-3 py-2.5" />
                      <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Date</th>
                      <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Receipt</th>
                      <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Details</th>
                      <th className="px-4 py-2.5 text-right text-xs uppercase text-[var(--muted)]">Amount</th>
                      <th className="px-4 py-2.5 text-right text-xs uppercase text-[var(--muted)]">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e._id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={!!selected[e._id]}
                            onChange={() => setSelected((s) => ({ ...s, [e._id]: !s[e._id] }))} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-xs">
                          {new Date(e.entryDate).toLocaleDateString('en-IN')}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{e.referenceNumber || e.voucherNumber}</td>
                        <td className="max-w-xs truncate px-4 py-2">
                          {e.narration}{e.partyName ? ` · ${e.partyName}` : ''}
                        </td>
                        <td className="px-4 py-2 text-right"><Money paise={e.debit} /></td>
                        <td className={`px-4 py-2 text-right text-xs ${AGE_TONE(e.ageDays)}`}>
                          {e.ageDays}d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Settle ────────────────────────────────────────────────── */}
              <div className="mt-4 rounded-lg border border-[var(--border)] bg-white p-5">
                <h2 className="text-sm font-semibold">Record a bank credit</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Tick the receipts this credit covers, then enter the credit as it appears
                  on the bank statement.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <label className="text-xs text-[var(--muted)]">Bank account
                    <select value={form.bankAccount}
                      onChange={(e) => setForm((f) => ({ ...f, bankAccount: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                      <option value="">Choose…</option>
                      {bankAccounts.map((a) => (
                        <option key={a._id} value={a._id}>{a.accountCode} — {a.accountName}</option>
                      ))}
                    </select></label>

                  <label className="text-xs text-[var(--muted)]">Bank reference
                    <input value={form.reference}
                      onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                      placeholder="as on the statement"
                      className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" /></label>

                  <label className="text-xs text-[var(--muted)]">Date
                    <input type="date" value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" /></label>

                  <label className="text-xs text-[var(--muted)]">Credit received ₹
                    <input value={form.amount} inputMode="decimal"
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder={grossPaise ? String(grossPaise / 100) : ''}
                      className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-right text-sm" /></label>
                </div>

                {form.amount && !chosen.length && (
                  <button type="button" onClick={suggest}
                    className="mt-3 text-xs text-[var(--mod)] underline">
                    Suggest which receipts this covers
                  </button>
                )}

                {/* The suggestion refuses to guess when nothing fits — show that. */}
                {suggestion && !suggestion.matched && (
                  <div className="mt-3 rounded-md bg-[var(--gold-soft)] px-3 py-2 text-xs text-[var(--gold)]">
                    {suggestion.reason} {suggestion.hint}
                  </div>
                )}

                {chosen.length > 0 && (
                  <div className="mt-4 space-y-1 rounded-md bg-[var(--canvas)] px-4 py-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">{chosen.length} receipt(s) selected</span>
                      <span><Money paise={grossPaise} /></span>
                    </div>
                    {chargesPaise !== null && chargesPaise !== 0 && (
                      <div className={`flex justify-between ${chargesPaise < 0 ? 'text-[var(--danger)]' : ''}`}>
                        <span className="text-[var(--muted)]">
                          {chargesPaise > 0 ? 'Charges withheld' : 'Credit EXCEEDS the receipts'}
                        </span>
                        <span><Money paise={Math.abs(chargesPaise)} /></span>
                      </div>
                    )}
                  </div>
                )}

                {/* Charges are a real expense — they must be posted somewhere. */}
                {needsChargeAccount && (
                  <label className="mt-3 block text-xs text-[var(--muted)]">
                    Account for the charges — required
                    <select value={form.feeAccount}
                      onChange={(e) => setForm((f) => ({ ...f, feeAccount: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                      <option value="">Choose an expense account…</option>
                      {expenseAccounts.map((a) => (
                        <option key={a._id} value={a._id}>{a.accountCode} — {a.accountName}</option>
                      ))}
                    </select>
                    <span className="mt-1 block">
                      The gateway kept {formatPaise(chargesPaise)}. That is a real expense and
                      must be recorded — netting it against income would understate both.
                    </span>
                  </label>
                )}

                <button type="button"
                  disabled={saving || !chosen.length || !form.bankAccount || !form.reference
                    || (needsChargeAccount && !form.feeAccount)}
                  onClick={settle}
                  className="mt-4 rounded-md bg-[var(--mod)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                  {saving ? 'Recording…' : 'Record settlement'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </FmsLayout>
  );
};

export default Settlements;