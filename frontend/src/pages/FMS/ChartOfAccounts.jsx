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
  // The API needs the group's ObjectId, not its code. An earlier version sent
  // groupCode: '1110' and every single account failed validation with
  // "accountGroup is required" — 41 refusals with no visible reason, because
  // the error detail was not being shown either.
  const [groups, setGroups] = useState(null);   // null = still loading
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
      // limit: 200 — this endpoint PAGINATES at 25 by default and there are 26
      // account groups, so the highest code (5500) silently fell off page one.
      // 39 of 41 accounts were created and the two needing 5500 were refused,
      // which is a very confusing way for a default page size to present itself.
    fmsAPI.getAccountGroups({ limit: 200 })
      .then((r) => setGroups(r?.data?.data ?? r?.data ?? []))
      .catch(() => setGroups([]));
  }, []);

  /** groupCode → _id, so each account can be filed under the right group. */
  const groupIdByCode = useMemo(() => {
    const m = new Map();
    for (const g of (groups || [])) m.set(String(g.groupCode), g._id);
    return m;
  }, [groups]);

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
        const accountGroup = groupIdByCode.get(String(a.group));
        if (!accountGroup) {
          // Better to say which group is missing than to send a request that
          // will be refused for a reason nobody can see.
          throw new Error(`account group ${a.group} does not exist — migration 004 may not have run`);
        }

        await fmsAPI.createAccount({
          accountCode: a.code,
          accountName: a.name,
          accountGroup,
          accountType: a.type,
          normalBalance: a.normalBalance,
          isCashAccount: !!a.isCashAccount,
          isBankAccount: !!a.isBankAccount,
        });
        created.push(a.code);
      } catch (err) {
        // `details` carries the per-field reason — e.g. { accountGroup: 'is
        // required' }. Without it a validation failure reads only "Validation
        // failed", which is exactly the message that made 41 refusals
        // impossible to diagnose.
        const detail = err?.response?.data?.error?.details;
        failed.push({
          code: a.code,
          name: a.name,
          message: err?.response?.data?.error?.message || err.message,
          detail: detail && typeof detail === 'object'
            ? Object.entries(detail).map(([k, v]) => `${k}: ${v}`).join('; ')
            : null,
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
                  {f.detail && (
                    <span className="block pl-4 text-[var(--muted)]">{f.detail}</span>
                  )}
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

// ─────────────────────────────────────────────────────────────────────────────
// Which accounts can actually receive a posting.
//
// An account with no route into it reads zero, and a zero looks like a fact —
// "no late fees were collected" rather than "no late fee can be recorded". That
// has already caught two statutory payroll heads and two income heads here.
//
// Only the blocked ones are shown by default. Most balance sheet accounts are
// journal-voucher territory and having no automatic feed is normal for them;
// listing those too would bury the ones that matter.
// ─────────────────────────────────────────────────────────────────────────────
const CoverageNotice = () => {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fmsAPI.getChartCoverage()
      .then((res) => { if (alive) setData(res?.data?.data ?? res?.data ?? null); })
      .catch(() => { /* a diagnostic must never break the screen it sits on */ });
    return () => { alive = false; };
  }, []);

  if (!data || !data.blocked?.length) return null;

  return (
    <div className="mb-4 rounded-lg border border-[var(--gold)] bg-[var(--gold-soft)] p-4">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-medium text-[var(--gold)]">
          {data.blocked.length} account(s) can never receive a posting
        </span>
        <span className="text-xs text-[var(--muted)]">{open ? 'Hide' : 'Show'}</span>
      </button>

      <p className="mt-1 text-xs text-[var(--muted)]">
        These will read zero on every report, which looks like a measurement rather than
        an absence.
      </p>

      {open && (
        <ul className="mt-3 space-y-3">
          {data.blocked.map((a) => (
            <li key={a.accountCode} className="text-xs">
              <span className="font-mono font-medium">{a.accountCode}</span> {a.accountName}
              <div className="mt-0.5 text-[var(--muted)]">{a.reason}</div>
              {a.remedy && <div className="mt-0.5">{a.remedy}</div>}
            </li>
          ))}
        </ul>
      )}

      {open && data.feeTypesReadable === false && (
        <p className="mt-3 text-xs text-[var(--muted)]">
          The school system could not be reached for its fee types, so fee income accounts
          could not be assessed this time.
        </p>
      )}
    </div>
  );
};

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

  // An account stores `accountGroup` as an ObjectId and has NO groupCode field —
  // so keying on groupCode put all 41 accounts under 'ungrouped', and since the
  // tree only draws real groups, a fully populated chart rendered as a blank
  // page. Key on the id the account actually carries.
  const byGroup = useMemo(() => {
    const m = {};
    for (const a of accounts) {
      const gid = a.accountGroup?._id || a.accountGroup;
      const key = gid ? String(gid) : 'ungrouped';
      (m[key] = m[key] || []).push(a);
    }
    return m;
  }, [accounts]);

  /** Accounts whose group is not in the list — should be empty, but if it ever
   *  is not, they must still be VISIBLE rather than silently dropped. */
  const orphaned = useMemo(() => {
    const known = new Set((groups || []).map((g) => String(g._id)));
    return accounts.filter((a) => {
      const gid = a.accountGroup?._id || a.accountGroup;
      return !gid || !known.has(String(gid));
    });
  }, [accounts, groups]);

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

      <CoverageNotice />

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
            .filter((g) => (byGroup[String(g._id)] || []).length > 0)
            .map((g) => {
              const rows = byGroup[String(g._id)] || [];
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

          {/* Should always be empty. It exists because the previous failure mode was

              41 accounts existing and NONE being shown — an account that does not

              match a group must still be visible, not silently dropped. */}

          {orphaned.length > 0 && (

            <div className="mt-3 rounded-lg border border-[var(--gold)] bg-[var(--gold-soft)] p-4">

              <p className="text-sm font-medium">

                {orphaned.length} account(s) are not under any known group

              </p>

              <p className="mt-1 text-xs text-[var(--muted)]">

                Their group may have been removed. They are listed here so they are not

                invisible.

              </p>

              <ul className="mt-2 space-y-1 text-xs">

                {orphaned.map((a) => (

                  <li key={a._id}>

                    <span className="font-mono">{a.accountCode}</span> {a.accountName}

                  </li>

                ))}

              </ul>

            </div>

          )}


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