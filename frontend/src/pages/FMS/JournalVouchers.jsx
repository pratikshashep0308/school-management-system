// frontend/src/pages/FMS/JournalVouchers.jsx
//
// Journal vouchers — SCR-47/48/49. Route /fms/journal.
//
// ─── THE RUNNING DIFFERENCE IS A COURTESY, NOT THE RULE ──────────────────────
// The submit button is disabled while debits do not equal credits, because
// letting somebody press it only to be refused is needless. But the BACKEND is
// what actually enforces balance, inside a transaction — and if it refuses for
// a reason the UI did not anticipate (a locked year, an inactive account, a
// reconciled period), that refusal is shown as-is.
//
// The UI hint prevents an obvious mistake. It is not the rule.
//
// ─── REVERSALS ───────────────────────────────────────────────────────────────
// A voucher is never edited or deleted once posted. Correcting it posts a
// REVERSING voucher, which draws from its own REV- number series so that
// receipt numbering stays gapless.

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import Money, { formatPaise } from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';

/** Rupees typed by a person → integer paise for the API. */
function toPaise(input) {
  const n = Number(String(input).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return null;
  const paise = Math.round(n * 100);
  // Guard the rounding: 12.345 is not a real rupee amount and should be
  // rejected rather than silently becoming 12.35.
  if (Math.abs(n * 100 - paise) > 0.001) return null;
  return paise;
}

const emptyLine = () => ({ account: '', debit: '', credit: '', narration: '' });

const Composer = ({ accounts, onDone, onCancel }) => {
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [header, setHeader] = useState({ voucherDate: '', narration: '', referenceNumber: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const totals = useMemo(() => {
    let debit = 0; let credit = 0; let invalid = false;
    for (const l of lines) {
      if (l.debit) { const p = toPaise(l.debit); if (p === null) invalid = true; else debit += p; }
      if (l.credit) { const p = toPaise(l.credit); if (p === null) invalid = true; else credit += p; }
    }
    return { debit, credit, difference: debit - credit, invalid };
  }, [lines]);

  const balanced = totals.difference === 0 && totals.debit > 0 && !totals.invalid;

  const setLine = (i, patch) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await fmsAPI.createJournal({
        voucherDate: header.voucherDate || undefined,
        narration: header.narration,
        referenceNumber: header.referenceNumber || undefined,
        lines: lines
          .filter((l) => l.account && (l.debit || l.credit))
          .map((l) => ({
            account: l.account,
            debit: l.debit ? toPaise(l.debit) : 0,
            credit: l.credit ? toPaise(l.credit) : 0,
            narration: l.narration || undefined,
          })),
      });
      onDone();
    } catch (err) {
      // The backend may refuse for reasons the UI cannot know about — a locked
      // financial year, a reconciled bank period, an inactive account.
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold">New journal voucher</h2>

      {error && <ErrorBanner error={error} className="mb-4" />}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs text-[var(--muted)]">
          Date
          <input type="date" value={header.voucherDate}
            onChange={(e) => setHeader((h) => ({ ...h, voucherDate: e.target.value }))}
            className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)] sm:col-span-2">
          Narration
          <input value={header.narration}
            onChange={(e) => setHeader((h) => ({ ...h, narration: e.target.value }))}
            placeholder="Why this entry is being made"
            className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
        </label>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="py-2 text-left text-xs uppercase text-[var(--muted)]">Account</th>
            <th className="py-2 text-right text-xs uppercase text-[var(--muted)]">Debit ₹</th>
            <th className="py-2 text-right text-xs uppercase text-[var(--muted)]">Credit ₹</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-[var(--border)]">
              <td className="py-2 pr-2">
                <select value={l.account} onChange={(e) => setLine(i, { account: e.target.value })}
                  className="w-full rounded-md border border-[var(--border)] px-2 py-1 text-sm">
                  <option value="">Choose…</option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>{a.accountCode} — {a.accountName}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-2">
                <input value={l.debit} inputMode="decimal"
                  onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })}
                  className="w-28 rounded-md border border-[var(--border)] px-2 py-1 text-right text-sm" />
              </td>
              <td className="py-2 pr-2">
                <input value={l.credit} inputMode="decimal"
                  onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })}
                  className="w-28 rounded-md border border-[var(--border)] px-2 py-1 text-right text-sm" />
              </td>
              <td className="py-2 text-right">
                {lines.length > 2 && (
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    className="text-xs text-[var(--muted)] hover:text-[var(--danger)]">×</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td className="py-3 text-right text-xs uppercase text-[var(--muted)]">Total</td>
            <td className="py-3 text-right">{formatPaise(totals.debit)}</td>
            <td className="py-3 text-right">{formatPaise(totals.credit)}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])}
        className="mt-2 text-xs text-[var(--mod)] underline">+ add a line</button>

      {/* The running difference — a courtesy so nobody submits into a refusal. */}
      <div className={`mt-4 rounded-md px-4 py-2.5 text-sm ${
        totals.invalid
          ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
          : balanced
            ? 'bg-[var(--canvas)] text-[var(--ink)]'
            : 'bg-[var(--gold-soft)] text-[var(--gold)]'
      }`}>
        {totals.invalid
          ? 'One of the amounts is not a valid rupee figure.'
          : balanced
            ? 'Balanced — debits equal credits.'
            : `Out of balance by ${formatPaise(Math.abs(totals.difference))}. A journal entry must balance.`}
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button" disabled={!balanced || saving} onClick={save}
          className="rounded-md bg-[var(--mod)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          {saving ? 'Saving…' : 'Save voucher'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
};

const JournalVouchers = () => {
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [j, a] = await Promise.all([
        fmsAPI.getJournals({ limit: 100 }),
        fmsAPI.getAccounts({ limit: 500, status: 'active' }),
      ]);
      setRows(j?.data?.data ?? j?.data ?? []);
      setAccounts(a?.data?.data ?? a?.data ?? []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reverse = async (jv) => {
    const reason = window.prompt(
      `Reverse ${jv.voucherNumber}?\n\n`
      + 'This posts a REVERSING voucher — the original stays exactly as it is. '
      + 'Reason:',
    );
    if (!reason) return;
    try { await fmsAPI.reverseJournal(jv._id, { reason }); load(); }
    catch (err) { setError(err); }
  };

  return (
    <FmsLayout
      title="Journal Vouchers"
      actions={!composing && (
        <button type="button" onClick={() => setComposing(true)}
          className="rounded-md bg-[var(--mod)] px-4 py-1.5 text-sm font-medium text-white">
          New voucher
        </button>
      )}
    >
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      {composing && (
        <div className="mb-4">
          <Composer accounts={accounts}
            onDone={() => { setComposing(false); load(); }}
            onCancel={() => setComposing(false)} />
        </div>
      )}

      {loading && <div className="h-32 animate-pulse rounded-lg bg-white" />}

      {!loading && rows.length === 0 && !composing && (
        <EmptyState
          title="No journal vouchers yet"
          reason="Journal vouchers record adjustments that are not a receipt, payment or expense — corrections, provisions, opening balances."
        />
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--canvas)]">
                <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Number</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Date</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Narration</th>
                <th className="px-4 py-2.5 text-right text-xs uppercase text-[var(--muted)]">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase text-[var(--muted)]">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((jv) => (
                <tr key={jv._id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{jv.voucherNumber || jv.jvNumber}</td>
                  <td className="px-4 py-2 text-xs">
                    {jv.voucherDate ? new Date(jv.voucherDate).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className="max-w-md truncate px-4 py-2">{jv.narration}</td>
                  <td className="px-4 py-2 text-right"><Money paise={jv.totalDebit || jv.amount} /></td>
                  <td className="px-4 py-2 text-xs capitalize">{jv.jvStatus || jv.status}</td>
                  <td className="px-4 py-2 text-right">
                    {(jv.jvStatus === 'posted' || jv.status === 'posted') && !jv.reversalVoucher && (
                      <button type="button" onClick={() => reverse(jv)}
                        className="text-xs text-[var(--muted)] underline hover:text-[var(--danger)]">
                        Reverse
                      </button>
                    )}
                    {jv.reversalVoucher && (
                      <span className="text-xs text-[var(--muted)]">reversed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
        A posted voucher is never edited or deleted. Corrections post a reversing voucher,
        which takes its number from a separate REV series so receipt numbering stays
        unbroken.
      </p>
    </FmsLayout>
  );
};

export default JournalVouchers;