// frontend/src/pages/FMS/BankAccounts.jsx
//
// Registering the school's bank accounts. Route /fms/bank-accounts.
//
// ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// `fms_bankaccounts` is a separate collection from the chart of accounts. A GL
// head like "1201 Bank — Current A/c" is where the money is RECORDED; a bank
// account is the real account it sits in, with a number, an IFSC and a
// statement that can be reconciled against.
//
// The endpoint and the API method both existed. Only the form did not — so the
// collection was empty, and that quietly disabled more than it looked:
//
//   · every payment except cash — the "Paid from" dropdown had nothing in it
//   · bank reconciliation entirely
//   · settlement of online fee collections
//
// Account 1202 Bank — Online Collections currently holds ₹96,299.81 of imported
// fee receipts with no bank account registered to reconcile it against.

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import ErrorBanner from '../../components/fms/ErrorBanner';
import Money from '../../components/fms/Money';

const ACCOUNT_TYPES = [
  { value: 'current', label: 'Current' },
  { value: 'savings', label: 'Savings' },
  { value: 'cc', label: 'Cash credit' },
  { value: 'od', label: 'Overdraft' },
];

const BLANK = {
  accountName: '', bankName: '', accountNumber: '', ifsc: '',
  branch: '', accountType: 'current', ledgerAccount: '', openingBalance: '',
};

const describeError = (err) => {
  const e = err?.response?.data?.error;
  if (!e) return err?.message || 'Something went wrong';
  const map = e.details?.fields || e.details;
  if (!map || typeof map !== 'object') return e.message || err.message;
  const parts = Object.entries(map)
    .filter(([, why]) => typeof why === 'string')
    .map(([f, why]) => `${f} ${why}`);
  return parts.length ? `${e.message} — ${parts.join(' · ')}` : (e.message || err.message);
};

const BankAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [b, a] = await Promise.all([
        fmsAPI.getBankAccounts({ limit: 200 }),
        fmsAPI.getAccounts({ limit: 500 }),
      ]);
      setAccounts((b?.data?.data ?? b?.data) || []);

      // Only accounts flagged as bank heads. Offering the whole chart would let
      // somebody point a bank account at, say, Tuition Income — which would
      // post and balance and be entirely wrong.
      const all = (a?.data?.data ?? a?.data) || [];
      setLedgers(all.filter((x) => x.isBankAccount && x.isPostable !== false));
    } catch (err) {
      setError(err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const { accountName, bankName, accountNumber, ifsc, ledgerAccount } = form;
    if (!accountName || !bankName || !accountNumber || !ifsc || !ledgerAccount) {
      toast.error('Name, bank, account number, IFSC and ledger head are all required');
      return;
    }

    const rupees = Number(form.openingBalance || 0);
    if (!Number.isFinite(rupees)) { toast.error('Opening balance must be a number'); return; }

    setSaving(true);
    try {
      await fmsAPI.createBankAccount({
        accountName: accountName.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        branch: form.branch.trim(),
        accountType: form.accountType,
        ledgerAccount,
        openingBalance: Math.round(rupees * 100),   // integer paise
      });
      toast.success(`${accountName} registered`);
      setForm(BLANK); setShowForm(false);
      await load();
    } catch (err) {
      // The server refuses a GL head already used by another bank account —
      // two banks sharing one head would make the ledger balance meaningless.
      toast.error(describeError(err), { duration: 10000 });
    } finally { setSaving(false); }
  };

  return (
    <FmsLayout
      title="Bank Accounts"
      actions={
        <button type="button" onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-[var(--mod)] px-3 py-1.5 text-sm font-medium text-white">
          {showForm ? 'Cancel' : 'Register a bank account'}
        </button>
      }
    >
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-relaxed">
        <p>
          A bank account is the real account the school holds — with a number, an IFSC and
          a statement. It is linked to a ledger head, which is where the money is recorded
          in the books.
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Until at least one is registered, only cash payments can be recorded, and bank
          reconciliation cannot run.
        </p>
      </div>

      {showForm && (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-5">
          <h2 className="text-sm font-semibold">New bank account</h2>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--muted)]">Account name</label>
              <input value={form.accountName} onChange={(e) => set('accountName', e.target.value)}
                placeholder="School Current Account"
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)]">Bank</label>
              <input value={form.bankName} onChange={(e) => set('bankName', e.target.value)}
                placeholder="Bank of Maharashtra"
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)]">Account number</label>
              <input value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)]">IFSC</label>
              <input value={form.ifsc}
                onChange={(e) => set('ifsc', e.target.value.toUpperCase())}
                placeholder="MAHB0000123"
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)]">Branch (optional)</label>
              <input value={form.branch} onChange={(e) => set('branch', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)]">Type</label>
              <select value={form.accountType} onChange={(e) => set('accountType', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-[var(--muted)]">Ledger head</label>
              <select value={form.ledgerAccount} onChange={(e) => set('ledgerAccount', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                <option value="">Choose a bank ledger head…</option>
                {ledgers.map((l) => (
                  <option key={l._id} value={l._id}>{l.accountCode} — {l.accountName}</option>
                ))}
              </select>
              {ledgers.length === 0 && (
                <p className="mt-1 text-xs text-[var(--gold)]">
                  No ledger head is marked as a bank account. Add one under Chart of
                  Accounts with “This is a bank account” ticked.
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--muted)]">
                Each ledger head belongs to one bank account only — two accounts sharing a
                head would make its balance impossible to reconcile.
              </p>
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)]">Opening balance (₹)</label>
              <input type="number" step="0.01" value={form.openingBalance}
                onChange={(e) => set('openingBalance', e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
              <p className="mt-1 text-xs text-[var(--muted)]">
                The balance as at the start of this financial year, per the bank statement.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <button type="button" onClick={save} disabled={saving}
              className="rounded-md bg-[var(--mod)] px-3 py-1.5 text-sm text-white disabled:opacity-40">
              {saving ? 'Registering…' : 'Register account'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-white p-4">
        {loading && <p className="text-xs text-[var(--muted)]">Loading…</p>}

        {!loading && accounts.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            No bank accounts registered yet. Until there is one, only cash payments can be
            recorded.
          </p>
        )}

        {accounts.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 pr-3 font-medium">Bank</th>
                <th className="py-2 pr-3 font-medium">Number</th>
                <th className="py-2 pr-3 font-medium">Ledger head</th>
                <th className="py-2 font-medium">Opening</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a._id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2.5 pr-3">
                    {a.accountName}
                    <span className="ml-2 text-xs text-[var(--muted)]">{a.accountType}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-xs">
                    {a.bankName}
                    {a.branch ? <span className="text-[var(--muted)]"> · {a.branch}</span> : null}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">
                    {/* Only the last four. A full account number on a list view is
                        more exposure than the screen needs. */}
                    ····{String(a.accountNumber || '').slice(-4)}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">{a.ledgerAccountCode || '—'}</td>
                  <td className="py-2.5"><Money paise={a.openingBalance || 0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </FmsLayout>
  );
};

export default BankAccounts;
