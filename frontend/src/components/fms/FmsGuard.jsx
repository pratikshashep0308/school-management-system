// frontend/src/components/fms/FmsGuard.jsx
//
// Gates every FMS route.
//
// The FMS is a TOGGLEABLE PLUGIN. When FMS_ENABLED is unset the backend does not
// mount it at all and the SMS is entirely unaffected. The UI must honour that:
// no navigation, no routes, no half-rendered screens calling endpoints that
// aren't there.
//
// This is architectural rather than cosmetic — a UI that ignores the toggle
// breaks the guarantee the whole plugin design rests on.

import React, { useCallback, useEffect, useState } from 'react';
import { useFms } from '../../context/FmsContext';
import fmsAPI, { getFinanceSession } from '../../utils/fmsAPI';
import FinanceUnlock from './FinanceUnlock';

const Panel = ({ title, children }) => (
  <div className="flex min-h-[60vh] items-center justify-center p-6">
    <div className="max-w-lg rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-800">{title}</h2>
      <div className="text-sm leading-relaxed text-gray-600">{children}</div>
    </div>
  </div>
);

const FmsGuard = ({ children }) => {
  const { loading, enabled, hasRole, reason, error, refresh } = useFms();

  // ── The step-up gate ──────────────────────────────────────────────────────
  // Asked for as "a separate login for the FMS". Implemented as the same
  // identity re-proved: no second password to remember, forget, or forget to
  // disable when somebody leaves — but an unattended browser with a live
  // school-system session still cannot open the books.
  //
  // `sessionRequired` stays null until the server has been asked. Rendering the
  // prompt before that would flash a password box at people on deployments
  // where the gate is switched off.
  const [sessionRequired, setSessionRequired] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const checkSession = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fmsAPI.checkFinanceSession();
      const data = res?.data?.data ?? res?.data;
      setSessionRequired(!data?.valid);
      setSessionExpired(data?.reason === 'expired');
    } catch (err) {
      // A 401 carrying this code IS the answer, not a failure.
      if (err?.response?.data?.error?.code === 'FMS_SESSION_REQUIRED') {
        setSessionRequired(true);
        setSessionExpired(err.response.data.error.reason === 'expired');
      } else {
        // The gate is switched off, or this is an older backend. Either way, do
        // not block the module on a question nobody answered.
        setSessionRequired(false);
      }
    }
  }, [enabled]);

  useEffect(() => { checkSession(); }, [checkSession]);

  // A session expiring mid-use should not be discovered through a failed save.
  // Re-check on tab focus — that is when somebody returns to a machine.
  useEffect(() => {
    const onFocus = () => { if (!getFinanceSession()) checkSession(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkSession]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-gray-500">Checking finance module…</div>
      </div>
    );
  }

  // ── 1. The plugin itself is off ──────────────────────────────────────────
  if (!enabled && reason === 'pluginDisabled') {
    return (
      <Panel title="The finance module is switched off">
        <p>
          This is a server setting, not a permission. The finance module is not
          currently running, so nobody can reach it.
        </p>
        <p className="mt-3 text-gray-500">
          An administrator enables it by setting <code>FMS_ENABLED=true</code> and
          restarting the server. The rest of the school system is unaffected either
          way.
        </p>
      </Panel>
    );
  }

  // ── 2. The plugin is on; this person has no finance role ─────────────────
  if (enabled && !hasRole && reason === 'noFinanceRole') {
    return (
      <Panel title="You don't have a finance role">
        <p>
          The finance module is running, but your account hasn't been given a
          finance role yet. Finance roles are separate from your normal school
          system role.
        </p>
        <p className="mt-3 text-gray-500">
          An administrator can assign one from Access Control.
        </p>
      </Panel>
    );
  }

  // ── 3. Something else went wrong — say so rather than guessing ───────────
  if (!enabled || !hasRole) {
    return (
      <Panel title="Couldn't check the finance module">
        <p>
          The check to see whether finance is available didn't complete. This
          isn't the same as it being switched off, or you lacking access — it
          means the check itself failed.
        </p>
        {error?.message && (
          <p className="mt-3 font-mono text-xs text-gray-500">{error.message}</p>
        )}
        <button
          type="button"
          onClick={refresh}
          className="mt-5 rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Try again
        </button>
      </Panel>
    );
  }

  // ── The books are locked ──────────────────────────────────────────────────
  // Last, deliberately: somebody should be told the module is switched off, or
  // that they hold no finance role, BEFORE being asked for a password that
  // would not help them anyway.
  if (sessionRequired) {
    return (
      <FinanceUnlock
        expired={sessionExpired}
        onUnlocked={() => { setSessionRequired(false); setSessionExpired(false); refresh?.(); }}
      />
    );
  }

  return <>{children}</>;
};

export default FmsGuard;