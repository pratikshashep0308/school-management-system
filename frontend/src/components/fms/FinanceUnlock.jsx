// frontend/src/components/fms/FinanceUnlock.jsx
//
// The step-up prompt. Shown when the finance module needs a password before it
// will open, and when a session has expired.
//
// ─── WHAT THIS IS, AND IS NOT ────────────────────────────────────────────────
// It is NOT a second login. It is the same account, re-proving itself, in
// exchange for a token that only the finance module accepts and that expires in
// minutes. There is no second password to remember, forget, write down, or
// forget to disable when somebody leaves.
//
// What it buys: an unattended browser with a live school-system session is not
// enough to open the books. That is the realistic risk in a school office —
// somebody walking up to a machine, not somebody stealing a JWT.
//
// The session token is held in sessionStorage rather than localStorage, so it
// dies with the browser tab. That is deliberate: leaving the books open across
// browser restarts would give back most of what this is for.

import React, { useState } from 'react';

import fmsAPI, { setFinanceSession } from '../../utils/fmsAPI';

const FinanceUnlock = ({ expired, onUnlocked }) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!password || busy) return;

    setBusy(true); setError(null);
    try {
      const res = await fmsAPI.unlockFinance(password);
      const data = res?.data?.data ?? res?.data;
      setFinanceSession(data.token, data.expiresAt);
      setPassword('');
      onUnlocked?.(data);
    } catch (err) {
      // The server's message carries the attempts-remaining count and the
      // lockout notice. Both are more useful than anything generic, so it is
      // shown as written rather than replaced.
      setError(err?.response?.data?.error?.message || err.message || 'Could not unlock');
      setPassword('');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold">
          {expired ? 'Your finance session has expired' : 'Finance module'}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          {expired
            ? 'Enter your password again to continue.'
            : 'Enter your password to open the books. This is the same password you '
              + 'signed in with — the finance module asks again so that an unattended '
              + 'browser cannot reach it.'}
        </p>

        <form onSubmit={submit} className="mt-5">
          <label htmlFor="fms-password" className="block text-xs font-medium text-[var(--muted)]">
            Password
          </label>
          <input
            id="fms-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
          />

          {error && (
            <p className="mt-3 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !password}
            className="mt-4 w-full rounded-md bg-[var(--mod)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? 'Checking…' : 'Open finance'}
          </button>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
          The session closes automatically after a period of inactivity, and when you close
          this tab. Every unlock is recorded in the audit trail.
        </p>
      </div>
    </div>
  );
};

export default FinanceUnlock;
