// frontend/src/pages/FMS/ChartOfAccounts.jsx
//
// Chart of Accounts — SCR-08/09/10. Route /fms/accounts.
//
// ─── THIS SCREEN EXISTS TO UNBLOCK ONE THING ─────────────────────────────────
// Open item O3: the school's accountant must approve roughly forty account
// codes. Until they do, every ingest path in the system refuses and around 500
// real fee payments sit waiting in the school system.
//
// Before this screen, that ask was "please read a technical document and approve
// the codes". After it, it is "please look at this screen and approve these
// codes". That is the entire point of building it early.
//
// So the review view is written for AN ACCOUNTANT, not a developer: plain
// headings, the reason each unusual account exists, and nothing created until
// they say so.
//
// ─── RULES SHOWN, NOT DUPLICATED ─────────────────────────────────────────────
// The backend refuses to change the type of an account that has been posted to,
// refuses to remove a group that still has children, and deactivates rather
// than deletes. This screen surfaces those refusals; it does not re-implement
// them.

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import Money from '../../components/fms/Money';
import EmptyState from '../../components/fms/EmptyState';
import ErrorBanner from '../../components/fms/ErrorBanner';
import { STANDARD_ACCOUNTS, TYPE_LABEL, TYPE_ORDER } from './standardChart';

// ─────────────────────────────────────────────────────────────────────────────
// The review screen — the O3 deliverable
// ─────────────────────────────────────────────────────────────────────────────

const SetupReview = ({ existingCodes, onDone, onCancel }) => {
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const pending = STANDARD_ACCOUNTS.filter((a) => !existingCodes.has(a.code));
  const alreadyThere = STANDARD_ACCOUNTS.length - pending.length;

  const grouped = useMemo(() => {
    const g = {};
    for (const a of pending) (g[a.type] = g[a.type] || []).push(a);
    return g;
  }, [pending]);

  const create = async () => {
    setCreating(true);
    setError(null);
    setProgress({ done: 0, total: pending.length });

    const created = [];
    const failed = [];

    for (let i = 0; i < pending.length; i += 1) {
      const a = pending[i];
      try {
        // Created through the ordinary endpoint, so each one carries an audit
        // record and an author — which running a migration would not give.
        await fmsAPI.createAccount({
          accountCode: a.code,
          accountName: a.name,
          groupCode: a.group,
          accountType: a.type,
          normalBalance: a.normalBalance,
          isCashAccount: !!a.isCashAccount,
          isBankAccount: !!a.isBankAccount,
        });
        created.push(a.code);
      } catch (err) {
        failed.push({
          code: a.code,
          name: a.name,
          message: err?.response?.data?.error?.message || err.message,
        });
      }
      setProgress({ done: i + 1, total: pending.length });
    }

    setResults({ created, failed });
    setCreating(false);
    if (!failed.length) onDone?.();
  };

  if (results) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-white p-6">
        <h2 className="text-lg font-semibold">Setup finished</h2>
        <p className="mt-2 text-sm">
          {results.created.length} account{results.created.length === 1 ? '' : 's'} created.
          {results.failed.length > 0 && ` ${results.failed.length} could not be created.`}
        </p>

        {results.failed.length > 0 && (
          <div className="mt-4 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-4">
            <p className="text-sm font-medium text-[var(--danger)]">These were refused:</p>
            <ul className="mt-2 space-y-1 text-xs">
              {results.failed.map((f) => (
                <li key={f.code}>
                  <span className="font-mono">{f.code}</span> {f.name} — {f.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={onDone}
          className="mt-5 rounded-md bg-[var(--mod)] px-4 py-2 text-sm font-medium text-white"
        >
          View the chart
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[var(--border)] bg-white p-6">
        <h2 className="text-lg font-semibold">Set up the chart of accounts</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--ink)]">
          Below are the {STANDARD_ACCOUNTS.length} accounts the finance system needs before
          it can record anything. They are grouped the way an accountant would expect.
          Please read through them and confirm they suit the school.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          Nothing is created until you press the button at the bottom. Names can be changed
          afterwards; codes cannot, so it is worth a careful read now.
        </p>

        {alreadyThere > 0 && (
          <p className="mt-3 text-sm text-[var(--muted)]">
            {alreadyThere} of these already exist and will be left alone.
          </p>
        )}
      </div>

      {TYPE_ORDER.filter((t) => grouped[t]?.length).map((type) => (
        <div key={type} className="rounded-lg border border-[var(--border)] bg-white">
          <div className="border-b border-[var(--border)] bg-[var(--canvas)] px-4 py-2.5 text-sm font-semibold">
            {TYPE_LABEL[type]}
          </div>
          <table className="min-w-full text-sm">
            <tbody>
              {grouped[type].map((a) => (
                <tr key={a.code} className="border-b border-[var(--border)] last:border-0 align-top">
                  <td className="w-20 px-4 py-3 font-mono text-xs text-[var(--muted)]">{a.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.name}</div>

                    {/* Plain-language explanation where an account needs one. */}
                    {a.note && (
                      <p className={`mt-1 max-w-2xl text-xs leading-relaxed ${
                        a.decision ? 'text-[var(--danger)]' : 'text-[var(--muted)]'
                      }`}>
                        {a.decision && <strong>Needs your decision: </strong>}
                        {a.note}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {error && <ErrorBanner error={error} />}

      <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white p-6">
        <button
          type="button"
          disabled={creating || pending.length === 0}
          onClick={create}
          className="rounded-md bg-[var(--mod)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {creating
            ? `Creating ${progress.done} of ${progress.total}…`
            : `Approve and create ${pending.length} account${pending.length === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          disabled={creating}
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] px-4 py-2.5 text-sm"
        >
          Not yet
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// The chart itself
// ─────────────────────────────────────────────────────────────────────────────

const ChartOfAccounts = () => {
  const [groups, setGroups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [mode, setMode] = useState('view');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, a] = await Promise.all([
        fmsAPI.getAccountGroups({ limit: 200 }),
        fmsAPI.getAccounts({ limit: 500 }),
      ]);
      setGroups(g?.data?.data ?? g?.data ?? []);
      setAccounts(a?.data?.data ?? a?.data ?? []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const existingCodes = useMemo(
    () => new Set(accounts.map((a) => a.accountCode)),
    [accounts],
  );

  const byGroup = useMemo(() => {
    const m = {};
    for (const a of accounts) {
      const key = a.groupCode || a.accountGroup?.groupCode || 'ungrouped';
      (m[key] = m[key] || []).push(a);
    }
    return m;
  }, [accounts]);

  const deactivate = async (account) => {
    // Say what actually happens. "Delete" would be a lie — the record stays.
    const ok = window.confirm(
      `Deactivate ${account.accountCode} ${account.accountName}?\n\n`
      + 'It will stop accepting postings and disappear from pickers, but the account '
      + 'and its history are kept. This is not a deletion.',
    );
    if (!ok) return;

    try {
      await fmsAPI.deactivateAccount(account._id);
      load();
    } catch (err) {
      setError(err);
    }
  };

  if (mode === 'setup') {
    return (
      <FmsLayout title="Chart of Accounts — setup">
        <SetupReview
          existingCodes={existingCodes}
          onDone={() => { setMode('view'); load(); }}
          onCancel={() => setMode('view')}
        />
      </FmsLayout>
    );
  }

  return (
    <FmsLayout
      title="Chart of Accounts"
      actions={
        accounts.length === 0 ? (
          <button
            type="button"
            onClick={() => setMode('setup')}
            className="rounded-md bg-[var(--mod)] px-4 py-1.5 text-sm font-medium text-white"
          >
            Set up standard chart
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMode('setup')}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--canvas)]"
          >
            Add missing standard accounts
          </button>
        )
      }
    >
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-white" />)}
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <EmptyState
          title="The chart of accounts has not been set up"
          reason="Nothing can be recorded until account heads exist — every fee, expense and salary posting needs somewhere to go. This is the one thing currently blocking the finance system."
          hint="Around 500 fee payments are waiting in the school system to be brought in once this is done."
          action={
            <button
              type="button"
              onClick={() => setMode('setup')}
              className="rounded-md bg-[var(--mod)] px-5 py-2.5 text-sm font-medium text-white"
            >
              Review the standard chart
            </button>
          }
        />
      )}

      {!loading && accounts.length > 0 && (
        <div className="space-y-3">
          {groups
            .filter((g) => (byGroup[g.groupCode] || []).length > 0)
            .map((g) => {
              const rows = byGroup[g.groupCode] || [];
              const open = expanded[g.groupCode] !== false;

              return (
                <div key={g._id || g.groupCode} className="rounded-lg border border-[var(--border)] bg-white">
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [g.groupCode]: !open }))}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span>
                      <span className="font-mono text-xs text-[var(--muted)]">{g.groupCode}</span>
                      <span className="ml-3 font-medium">{g.groupName}</span>
                      <span className="ml-2 text-xs capitalize text-[var(--muted)]">{g.accountType}</span>
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {rows.length} account{rows.length === 1 ? '' : 's'} · {open ? '−' : '+'}
                    </span>
                  </button>

                  {open && (
                    <table className="min-w-full border-t border-[var(--border)] text-sm">
                      <tbody>
                        {rows.map((a) => (
                          <tr key={a._id} className="border-b border-[var(--border)] last:border-0">
                            <td className="w-20 px-4 py-2 font-mono text-xs text-[var(--muted)]">{a.accountCode}</td>
                            <td className="px-4 py-2">
                              {a.accountName}
                              {a.status === 'inactive' && (
                                <span className="ml-2 rounded bg-[var(--canvas)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--muted)]">
                                  inactive
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {a.currentBalance !== undefined
                                ? <Money paise={a.currentBalance} />
                                : <span className="text-[var(--muted)]">—</span>}
                            </td>
                            <td className="w-28 px-4 py-2 text-right">
                              {a.status !== 'inactive' && (
                                <button
                                  type="button"
                                  onClick={() => deactivate(a)}
                                  className="text-xs text-[var(--muted)] underline hover:text-[var(--danger)]"
                                >
                                  Deactivate
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}

          <p className="pt-2 text-xs leading-relaxed text-[var(--muted)]">
            Accounts are deactivated, never deleted — an account that has been used is part
            of what the records mean. An account that has been posted to also cannot change
            its type, because the history would stop meaning what it said.
          </p>
        </div>
      )}
    </FmsLayout>
  );
};

export default ChartOfAccounts;