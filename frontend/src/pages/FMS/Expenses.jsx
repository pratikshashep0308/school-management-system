// frontend/src/pages/FMS/Expenses.jsx
//
// Raising and tracking expense requests. Route /fms/expenses.
//
// ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// The expense backend has been complete and tested for some time — 7 endpoints,
// 49 passing assertions, a four-stage approval chain, budget checking, and
// posting through the same ledger service the fee import uses.
//
// None of it had a screen. Which meant the whole module had never been used
// once, and every later plan for it was a guess about what a school would
// actually need. This is the screen that turns tests into evidence.
//
// ─── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
// No approval actions — ApprovalInbox and ApprovalAction already own that, and
// a second place to approve things is how two workflows start disagreeing.
// This raises, lists, edits drafts and submits. Nothing more.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import ErrorBanner from '../../components/fms/ErrorBanner';
import Money from '../../components/fms/Money';

const PAYMENT_MODES = ['cash', 'cheque', 'neft', 'rtgs', 'upi', 'dd'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

// Only the statuses somebody filtering a list actually wants. The model has
// eleven; offering all of them makes the useful four hard to find.
const FILTERS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'submitted', label: 'Awaiting approval' },
  { key: 'paymentPending', label: 'Approved, unpaid' },
  { key: 'paymentCompleted', label: 'Paid' },
];

const STATUS_TONE = {
  draft: 'var(--muted)',
  submitted: 'var(--info)',
  accountsVerified: 'var(--info)',
  principalApproved: 'var(--info)',
  chairmanApproved: 'var(--sage)',
  paymentPending: 'var(--gold)',
  paymentCompleted: 'var(--sage)',
  closed: 'var(--muted)',
  rejected: 'var(--danger)',
  returned: 'var(--danger)',
  cancelled: 'var(--muted)',
};


/**
 * The useful half of a server error.
 *
 * `validate()` returns WHICH field failed and why, in error.details — but the
 * top-level message is just "Validation failed". Showing only the message sent
 * somebody to a server log to find out a date was in the wrong format, which is
 * a poor trade for one line of code.
 */
const describeError = (err) => {
  const e = err?.response?.data?.error;
  if (!e) return err?.message || 'Something went wrong';

  // validate() throws errors.validation(message, fields), which wraps the map
  // as details.fields — one level deeper than a naive read expects. Getting
  // that wrong produced "[object Object]", which is worse than the generic
  // message it was meant to improve on.
  const map = e.details?.fields || e.details;
  if (!map || typeof map !== 'object') return e.message || err.message;

  const parts = Object.entries(map)
    .filter(([, why]) => typeof why === 'string')
    .map(([field, why]) => `${field} ${why}`);

  return parts.length ? `${e.message} — ${parts.join(' · ')}` : (e.message || err.message);
};

const today = () => new Date().toISOString().slice(0, 10);

const BLANK = {
  requestDate: today(),
  category: '',
  categoryRef: '',
  purpose: '',
  budgetHead: '',
  paymentMode: 'cash',
  priority: 'normal',
  amount: '',            // rupees in the form; converted to paise on submit
  remarks: '',
};

const Expenses = () => {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [mastersError, setMastersError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // This endpoint IS paginated — 25 a page. Passing page through rather
      // than taking the first response as the whole set: a list that silently
      // shows the first 25 of 300 expenses is the same class of bug that nearly
      // imported 50 of 169 fee ledgers.
      const res = await fmsAPI.getExpenses({ page, limit: 25, expenseStatus: status || undefined });
      const body = res?.data ?? {};
      setRows(body.data || []);
      setTotal(body.meta?.total ?? body.total ?? (body.data || []).length);
    } catch (err) {
      setError(err);
    } finally { setLoading(false); }
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  // Masters, once.
  useEffect(() => {
    (async () => {
      try {
        const [c, a] = await Promise.all([
          fmsAPI.getExpenseCategories({ status: 'active' }),
          fmsAPI.getAccounts({ limit: 500, accountType: 'expense' }),
        ]);
        setCategories((c?.data?.data ?? c?.data) || []);
        const acc = (a?.data?.data ?? a?.data) || [];
        setAccounts(acc.filter((x) => x.isPostable !== false));
      } catch (err) {
        // Previously swallowed. An empty dropdown then looked identical to a
        // failed request, and somebody reasonably concluded there were no
        // categories when the fetch had actually been refused.
        setMastersError(describeError(err));
      }
    })();
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  /**
   * Choosing a category pre-fills the account.
   *
   * It does NOT replace it. `budgetHead` is what the posting reads and stays
   * editable — the category is a sensible default, not an authority. Two fields
   * both claiming to decide the account is how classification drifts apart.
   */
  const chooseCategory = (id) => {
    const cat = categories.find((c) => String(c._id) === String(id));
    setForm((f) => ({
      ...f,
      categoryRef: id,
      category: cat ? cat.name : f.category,
      budgetHead: cat?.account ? String(cat.account) : f.budgetHead,
    }));
  };

  const openNew = () => { setEditing(null); setForm(BLANK); setShowForm(true); };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      requestDate: (row.requestDate || '').slice(0, 10) || today(),
      category: row.category || '',
      categoryRef: String(row.categoryRef || ''),
      purpose: row.purpose || '',
      budgetHead: String(row.budgetHead || ''),
      paymentMode: row.paymentMode || 'cash',
      priority: row.priority || 'normal',
      amount: row.totalAmount ? String(row.totalAmount / 100) : '',
      remarks: row.remarks || '',
    });
    setShowForm(true);
  };

  const save = async () => {
    const rupees = Number(form.amount);
    if (!form.category || !form.purpose || !form.budgetHead) {
      toast.error('Category, purpose and account are all required'); return;
    }
    if (!Number.isFinite(rupees) || rupees <= 0) {
      toast.error('Enter an amount'); return;
    }

    // Rupees in the form, integer paise on the wire. Rounding here rather than
    // letting a float reach the server, which rejects sub-paise amounts outright.
    const paise = Math.round(rupees * 100);
    if (Math.abs(rupees * 100 - paise) > 0.001) {
      toast.error('Amounts cannot be finer than one paisa'); return;
    }

    // Normalise to YYYY-MM-DD. A date input can hand back a locale-formatted
    // string, and check.date rejects anything Date.parse cannot read.
    const iso = (() => {
      const d = new Date(form.requestDate);
      return Number.isNaN(d.getTime()) ? form.requestDate : d.toISOString().slice(0, 10);
    })();

    const payload = {
      requestDate: iso,
      category: form.category,
      categoryRef: form.categoryRef || undefined,
      purpose: form.purpose,
      budgetHead: form.budgetHead,
      paymentMode: form.paymentMode,
      priority: form.priority,
      baseAmount: paise,
      totalAmount: paise,
      remarks: form.remarks,
    };

    setSaving(true);
    try {
      if (editing) {
        await fmsAPI.updateExpense(editing._id, payload);
        toast.success('Draft updated');
      } else {
        await fmsAPI.createExpense(payload);
        toast.success('Draft created — submit it when you are ready');
      }
      setShowForm(false); setEditing(null); setForm(BLANK);
      await load();
    } catch (err) {
      toast.error(describeError(err), { duration: 10000 });
    } finally { setSaving(false); }
  };

  const submit = async (row) => {
    try {
      const res = await fmsAPI.submitExpense(row._id);
      const warnings = (res?.data?.data?.warnings) || [];
      toast.success('Submitted for approval');
      // Budget warnings are advisory. Shown separately so a warning never looks
      // like a failure, and a failure never looks like a warning.
      warnings.forEach((w) => toast(w, { icon: '⚠️', duration: 7000 }));
      await load();
    } catch (err) {
      toast.error(describeError(err), { duration: 10000 });
    }
  };

  const pages = Math.max(1, Math.ceil(total / 25));
  const accountName = useMemo(() => {
    const m = new Map(accounts.map((a) => [String(a._id), `${a.accountCode} ${a.accountName}`]));
    return (id) => m.get(String(id)) || '—';
  }, [accounts]);

  return (
    <FmsLayout
      title="Expenses"
      actions={
        <button type="button" onClick={openNew}
          className="rounded-md bg-[var(--mod)] px-3 py-1.5 text-sm font-medium text-white">
          New expense
        </button>
      }
    >
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      {showForm && (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-5">
          <h2 className="text-sm font-semibold">
            {editing ? `Edit ${editing.expenseNumber || 'draft'}` : 'New expense'}
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Saved as a draft. Nothing is approved or posted until you submit it.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--muted)]">Date</label>
              <input type="date" value={form.requestDate}
                onChange={(e) => set('requestDate', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)]">Amount (₹)</label>
              <input type="number" step="0.01" value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-[var(--muted)]">Category</label>
              <select value={form.categoryRef} onChange={(e) => chooseCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                <option value="">Choose a category…</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.code} — {c.name}</option>
                ))}
              </select>
              {mastersError && (
                <p className="mt-1 text-xs text-[var(--danger)]">
                  Could not load categories — {mastersError}
                </p>
              )}
              {!mastersError && categories.length === 0 && (
                <p className="mt-1 text-xs text-[var(--gold)]">
                  No categories defined yet. Add them under Expense Categories, or type the
                  account below by hand.
                </p>
              )}
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-[var(--muted)]">
                Posts to account
                <span className="ml-1">— pre-filled from the category, editable</span>
              </label>
              <select value={form.budgetHead} onChange={(e) => set('budgetHead', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                <option value="">Choose an expense account…</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>{a.accountCode} — {a.accountName}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-[var(--muted)]">What is this for?</label>
              <input value={form.purpose} onChange={(e) => set('purpose', e.target.value)}
                placeholder="July electricity bill"
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
            </div>

            <div>
              <label className="block text-xs text-[var(--muted)]">Payment mode</label>
              <select value={form.paymentMode} onChange={(e) => set('paymentMode', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)]">Priority</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-[var(--muted)]">Remarks (optional)</label>
              <input value={form.remarks} onChange={(e) => set('remarks', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={save} disabled={saving}
              className="rounded-md bg-[var(--mod)] px-3 py-1.5 text-sm text-white disabled:opacity-40">
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} type="button"
            onClick={() => { setStatus(f.key); setPage(1); }}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              status === f.key
                ? 'border-[var(--mod)] text-[var(--mod)]'
                : 'border-[var(--border)] text-[var(--muted)]'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-white p-4">
        {loading && <p className="text-xs text-[var(--muted)]">Loading…</p>}

        {!loading && rows.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            No expenses here yet. Raise one with “New expense”.
          </p>
        )}

        {rows.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-medium">Number</th>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Purpose</th>
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 pr-3 font-medium">Amount</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2.5 pr-3 font-mono text-xs">{r.expenseNumber || '—'}</td>
                  <td className="py-2.5 pr-3 text-xs">
                    {(r.requestDate || '').slice(0, 10)}
                  </td>
                  <td className="py-2.5 pr-3">
                    {r.purpose}
                    {r.category && (
                      <span className="ml-2 text-xs text-[var(--muted)]">{r.category}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-xs">{accountName(r.budgetHead)}</td>
                  <td className="py-2.5 pr-3"><Money paise={r.totalAmount} /></td>
                  <td className="py-2.5 pr-3 text-xs"
                    style={{ color: STATUS_TONE[r.expenseStatus] || 'var(--muted)' }}>
                    {r.expenseStatus}
                  </td>
                  <td className="py-2.5 text-right text-xs">
                    {r.expenseStatus === 'draft' && (
                      <>
                        <button type="button" onClick={() => openEdit(r)}
                          className="rounded border border-[var(--border)] px-2 py-0.5">Edit</button>
                        <button type="button" onClick={() => submit(r)}
                          className="ml-2 rounded bg-[var(--mod)] px-2 py-0.5 text-white">Submit</button>
                      </>
                    )}
                    {r.expenseStatus === 'returned' && (
                      <button type="button" onClick={() => openEdit(r)}
                        className="rounded border border-[var(--border)] px-2 py-0.5">Revise</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pages > 1 && (
          <div className="mt-3 flex items-center gap-3 text-xs">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="rounded border border-[var(--border)] px-2 py-0.5 disabled:opacity-30">
              Previous
            </button>
            <span className="text-[var(--muted)]">Page {page} of {pages} · {total} in total</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
              className="rounded border border-[var(--border)] px-2 py-0.5 disabled:opacity-30">
              Next
            </button>
          </div>
        )}
      </div>
    </FmsLayout>
  );
};

export default Expenses;
