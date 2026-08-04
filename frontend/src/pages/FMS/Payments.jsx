// frontend/src/pages/FMS/Payments.jsx
//
// Payments — route /fms/payments.
//
// ─── WHY THIS SCREEN MATTERS ─────────────────────────────────────────────────
// Without it the workflow stops dead: an expense can be raised, verified and
// approved, and then there is no way to actually pay it. The approval chain
// ends in a queue nobody can reach.
//
// ─── THE BACKEND DECIDES, THIS SCREEN SHOWS ──────────────────────────────────
// Paying is refused if the expense is not fully approved, if it has already
// been paid, or if the payer is the same person who approved it. None of that
// is re-checked here — the endpoint is called and its answer rendered,
// including its refusal. A second implementation of those rules would
// eventually disagree with the first.

import React, { useCallback, useEffect, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import Money from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

const MODES = ['cash', 'cheque', 'neft', 'rtgs', 'upi', 'dd'];

const Payments = () => {
  const [tab, setTab] = useState('queue');          // queue | paid
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emptyReason, setEmptyReason] = useState(null);

  const [paying, setPaying] = useState(null);        // the expense being paid
  const [form, setForm] = useState({ paymentMode: 'neft', reference: '', bankAccount: '', creditAccount: '', remarks: '' });
  const [cashAccounts, setCashAccounts] = useState([]);
  const [banks, setBanks] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setEmptyReason(null);
    try {
      const res = tab === 'queue'
        ? await fmsAPI.getPaymentQueue()
        : await fmsAPI.getPayments();
      const body = res?.data;
      const list = body?.data ?? body ?? [];
      setRows(Array.isArray(list) ? list : (list.items || []));
      if (body?.note) setEmptyReason(body.note);
    } catch (err) {
      // A 403 here usually means no finance role rather than a fault.
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Cash heads, for the picker below. A school with both a cash box and a
    // petty cash float has two, and the payment must say which.
    fmsAPI.getAccounts({ limit: 500 })
      .then((r) => {
        const all = r?.data?.data ?? r?.data ?? [];
        setCashAccounts(all.filter((a) => a.isCashAccount && a.isPostable !== false));
      })
      .catch(() => setCashAccounts([]));

    fmsAPI.getBankAccounts({ limit: 200 })
      .then((r) => setBanks(r?.data?.data ?? r?.data ?? []))
      .catch(() => setBanks([]));   // a missing bank list must not break the page
  }, []);

  const openPay = (row) => {
    setPaying(row);
    setActionError(null);
    setForm({ paymentMode: 'neft', reference: '', bankAccount: '', creditAccount: '', remarks: '' });
  };

  const submitPayment = async () => {
    if (!paying) return;
    setSubmitting(true); setActionError(null);
    try {
      await fmsAPI.payExpense(paying._id, {
        paymentMode: form.paymentMode,
        referenceNumber: form.reference || undefined,
        bankAccount: form.bankAccount || undefined,
        // Named explicitly when more than one account could fund the payment.
        // This school has both 1101 Cash in Hand and 1102 Petty Cash, and the
        // server rightly refuses to guess which one paid.
        creditAccount: form.creditAccount || undefined,
        remarks: form.remarks || undefined,
      });
      setPaying(null);
      await load();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const cash = form.paymentMode === 'cash';

  return (
    <FmsLayout title="Payments">
      <div className="mb-4 flex gap-2">
        {[['queue', 'Awaiting payment'], ['paid', 'Paid']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === k ? 'bg-[var(--mod)] text-white' : 'bg-[var(--canvas)] text-[var(--ink)] border border-[var(--border)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <ErrorBanner error={error} />}

      {loading && <div className="py-10 text-center text-[var(--muted)]">Loading…</div>}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          title={tab === 'queue' ? 'Nothing is waiting to be paid' : 'No payments yet'}
          reason={emptyReason}
          hint={tab === 'queue'
            ? 'Expenses appear here once they are fully approved.'
            : undefined}
        />
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--canvas)] text-left text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Expense</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Purpose</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2 text-right">Amount</th>
                {tab === 'paid' && <th className="px-3 py-2">Paid on</th>}
                {tab === 'paid' && <th className="px-3 py-2">Mode</th>}
                {tab === 'queue' && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.expenseNumber || r.paymentNumber || '—'}
                  </td>
                  <td className="px-3 py-2">{r.department?.name || '—'}</td>
                  <td className="px-3 py-2">{r.purpose || r.narration || '—'}</td>
                  <td className="px-3 py-2">{r.vendor?.name || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <Money paise={r.totalAmount ?? r.amount} />
                  </td>
                  {tab === 'paid' && (
                    <td className="px-3 py-2">
                      {r.paymentDate ? new Date(r.paymentDate).toLocaleDateString('en-IN') : '—'}
                    </td>
                  )}
                  {tab === 'paid' && <td className="px-3 py-2">{r.paymentMode || '—'}</td>}
                  {tab === 'queue' && (
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => openPay(r)}
                        className="rounded-md bg-[var(--mod)] px-3 py-1.5 text-xs text-white"
                      >
                        Pay
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pay dialog ───────────────────────────────────────────────────── */}
      {paying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">
              Pay {paying.expenseNumber}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {paying.purpose} — <Money paise={paying.totalAmount ?? paying.amount} />
            </p>

            {actionError && <div className="mt-3"><ErrorBanner error={actionError} /></div>}

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Payment mode</span>
                <select
                  value={form.paymentMode}
                  onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5"
                >
                  {MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                </select>
              </label>

              {/* Cash leaves no BANK trail — but it still leaves the school from a
                  specific cash head, and there is more than one. */}
              {cash && cashAccounts.length > 1 && (
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">Paid from</span>
                  <select
                    value={form.creditAccount}
                    onChange={(e) => setForm({ ...form, creditAccount: e.target.value })}
                    className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5"
                  >
                    <option value="">Select a cash account…</option>
                    {cashAccounts.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.accountCode} — {a.accountName}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {!cash && (
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">Paid from</span>
                  <select
                    value={form.bankAccount}
                    onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                    className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5"
                  >
                    <option value="">Select an account…</option>
                    {banks.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.accountName} {b.accountNumber ? `— ${b.accountNumber}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block text-sm">
                <span className="text-[var(--muted)]">
                  Reference {form.paymentMode === 'cheque' ? '(cheque number)' : '(UTR / transaction id)'}
                </span>
                <input
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5"
                />
              </label>

              <label className="block text-sm">
                <span className="text-[var(--muted)]">Remarks</span>
                <input
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPaying(null)}
                className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                onClick={submitPayment}
                disabled={submitting}
                className="rounded-md bg-[var(--mod)] px-4 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {submitting ? 'Recording…' : 'Record payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FmsLayout>
  );
};

export default Payments;