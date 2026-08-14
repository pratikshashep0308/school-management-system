// frontend/src/pages/FMS/ExpenseCategories.jsx
//
// The expense category master. Route /fms/expense-categories.
//
// ─── WHAT THIS SCREEN IS FOR ────────────────────────────────────────────────
// Deciding which account each kind of expense lands in.
//
// Until now that decision lived nowhere: the SMS held category names, the
// account mapping table held nothing, and every imported expense went to
// 5299 Other Expenses. The account column below is the whole point of the
// screen — a category master that hides which account it posts to would be a
// list of labels again.

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import ErrorBanner from '../../components/fms/ErrorBanner';

const BLANK = {
  code: '', name: '', description: '', account: '',
  parent: '', requiresVendor: false, requiresInvoice: false,
};

const ExpenseCategories = () => {
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [c, a] = await Promise.all([
        fmsAPI.getExpenseCategories(),
        // Expense heads only. Offering the whole chart invites somebody to
        // point a category at a bank account, which posts and balances and is
        // completely wrong.
        fmsAPI.getAccounts({ limit: 500, accountType: 'expense' }),
      ]);
      setRows((c?.data?.data ?? c?.data) || []);
      const acc = (a?.data?.data ?? a?.data) || [];
      setAccounts(acc.filter((x) => x.isPostable !== false));
    } catch (err) {
      setError(err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => { setEditing(null); setForm(BLANK); setShowForm(true); };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      code: row.code, name: row.name, description: row.description || '',
      account: String(row.account || ''), parent: String(row.parent || ''),
      requiresVendor: !!row.requiresVendor, requiresInvoice: !!row.requiresInvoice,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.code || !form.name || !form.account) {
      toast.error('Code, name and account are all required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await fmsAPI.updateExpenseCategory(editing._id, form);
        toast.success(`${form.code} updated`);
      } else {
        await fmsAPI.createExpenseCategory(form);
        toast.success(`${form.code} created`);
      }
      setShowForm(false); setForm(BLANK); setEditing(null);
      await load();
    } catch (err) {
      // The server's messages here are the useful ones — "already has postings",
      // "is a group header", and the blocker list on deactivation. Shown as
      // written rather than replaced with something generic.
      toast.error(err?.response?.data?.error?.message || err.message, { duration: 8000 });
    } finally { setSaving(false); }
  };

  const deactivate = async (row) => {
    try {
      await fmsAPI.deactivateExpenseCategory(row._id);
      toast.success(`${row.code} deactivated`);
      await load();
    } catch (err) {
      const e = err?.response?.data?.error;
      const blockers = e?.details?.blockers || [];
      // Naming what is blocking is the difference between a message somebody
      // can act on and one that sends them hunting through screens.
      toast.error(
        blockers.length
          ? `${e.message}: ${blockers.map((b) => b.ref).join(', ')}`
          : (e?.message || err.message),
        { duration: 9000 },
      );
    }
  };

  const visible = rows.filter((r) => showInactive || r.status === 'active');
  const roots = visible.filter((r) => !r.parent);
  const childrenOf = (id) => visible.filter((r) => String(r.parent) === String(id));

  const Row = ({ row, child }) => (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-2.5 pr-3">
        <span style={{ paddingLeft: child ? 20 : 0 }}>
          <span className="mr-1">{row.icon}</span>
          <span className="font-mono text-xs">{row.code}</span>
          <span className="ml-2 text-sm">{row.name}</span>
        </span>
      </td>
      <td className="py-2.5 pr-3 font-mono text-xs">
        {row.accountCode || <span className="text-[var(--danger)]">none</span>}
      </td>
      <td className="py-2.5 pr-3 text-xs text-[var(--muted)]">
        {[row.requiresVendor && 'vendor', row.requiresInvoice && 'invoice']
          .filter(Boolean).join(' · ') || '—'}
      </td>
      <td className="py-2.5 pr-3 text-xs">
        {row.status === 'active'
          ? <span className="text-[var(--sage)]">active</span>
          : <span className="text-[var(--muted)]">inactive</span>}
      </td>
      <td className="py-2.5 text-right text-xs">
        <button type="button" onClick={() => openEdit(row)}
          className="rounded border border-[var(--border)] px-2 py-0.5">Edit</button>
        {row.status === 'active' && (
          <button type="button" onClick={() => deactivate(row)}
            className="ml-2 rounded border border-[var(--border)] px-2 py-0.5 text-[var(--danger)]">
            Deactivate
          </button>
        )}
      </td>
    </tr>
  );

  return (
    <FmsLayout
      title="Expense Categories"
      actions={
        <button type="button" onClick={openNew}
          className="rounded-md bg-[var(--mod)] px-3 py-1.5 text-sm font-medium text-white">
          Add category
        </button>
      }
    >
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-relaxed">
        <p>
          Every expense is classified by category, and each category decides which
          account the expense posts to. A category with no account cannot be used.
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          An account cannot be changed once expenses have posted against the category —
          that would split its history across two heads. Create a new category instead.
        </p>
      </div>

      {showForm && (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-5">
          <h2 className="text-sm font-semibold">
            {editing ? `Edit ${editing.code}` : 'New category'}
          </h2>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--muted)]">Code</label>
              <input value={form.code} disabled={!!editing}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)]">Name</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm" />
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-[var(--muted)]">
                Posts to account
                {editing && <span className="ml-1 text-[var(--gold)]">— cannot change once used</span>}
              </label>
              <select value={form.account} onChange={(e) => set('account', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                <option value="">Choose an expense account…</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>{a.accountCode} — {a.accountName}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-[var(--muted)]">Parent (optional)</label>
              <select value={form.parent} onChange={(e) => set('parent', e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm">
                <option value="">None — this is a top-level category</option>
                {rows.filter((r) => !r.parent && r.status === 'active'
                  && String(r._id) !== String(editing?._id)).map((r) => (
                  <option key={r._id} value={r._id}>{r.code} — {r.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--muted)]">Categories nest two levels only.</p>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.requiresVendor}
                onChange={(e) => set('requiresVendor', e.target.checked)} />
              Requires a vendor
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.requiresInvoice}
                onChange={(e) => set('requiresInvoice', e.target.checked)} />
              Requires an invoice attached
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={save} disabled={saving}
              className="rounded-md bg-[var(--mod)] px-3 py-1.5 text-sm text-white disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Categories <span className="ml-1 font-normal text-[var(--muted)]">{visible.length}</span>
          </h2>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input type="checkbox" checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)} />
            Show deactivated
          </label>
        </div>

        {loading && <p className="mt-3 text-xs text-[var(--muted)]">Loading…</p>}

        {!loading && visible.length === 0 && (
          <p className="mt-3 text-sm text-[var(--muted)]">
            No categories yet. Add one to decide where expenses post.
          </p>
        )}

        {visible.length > 0 && (
          <table className="mt-2 w-full text-left">
            <thead className="text-xs text-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 pr-3 font-medium">Requires</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {roots.map((r) => [
                <Row key={String(r._id)} row={r} />,
                ...childrenOf(r._id).map((c) => (
                  <Row key={String(c._id)} row={c} child />
                )),
              ])}
            </tbody>
          </table>
        )}
      </div>
    </FmsLayout>
  );
};

export default ExpenseCategories;