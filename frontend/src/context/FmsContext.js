// frontend/src/context/FmsContext.js
//
// Resolves, once, whether the FMS plugin is switched on and what finance role
// the signed-in person holds.
//
// ─── TWO DIFFERENT "NO" ANSWERS ─────────────────────────────────────────────
// These must never be collapsed into a single "unavailable" state:
//
//   enabled: false      the FMS plugin is switched off (FMS_ENABLED unset).
//                       Nobody can use it. This is a server setting.
//
//   hasRole: false      the plugin is running, but THIS person has no finance
//                       role. Somebody else may well be using it fine.
//
// Collapsing them makes the first support call unanswerable: "the finance
// section is missing" has two completely different fixes.
//
// ─── FMS ROLES ARE NOT SMS ROLES ────────────────────────────────────────────
// The FMS keeps its own roles in fms_roleassignments, keyed by SMS user id.
// An SMS administrator may hold no finance role at all, and that is correct —
// running a school and keeping its books are different jobs.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import fmsAPI from '../utils/fmsAPI';
import { useAuth } from './AuthContext';

const FmsContext = createContext(null);

export const FmsProvider = ({ children }) => {
  const { user, token } = useAuth() || {};

  const [state, setState] = useState({
    loading: true,
    enabled: false,
    hasRole: false,
    fmsRole: null,
    financialYear: null,
    currency: 'INR',
    version: null,
    error: null,
    reason: null,
  });

  const load = useCallback(async () => {
    // Nothing to resolve until somebody is signed in.
    if (!token) {
      setState((s) => ({ ...s, loading: false, enabled: false, hasRole: false }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const res = await fmsAPI.getStatus();
      const data = res?.data?.data ?? res?.data ?? {};

      if (!data.enabled) {
        setState({
          loading: false,
          enabled: false,
          hasRole: false,
          fmsRole: null,
          financialYear: null,
          currency: data.currency || 'INR',
          version: data.version || null,
          error: null,
          reason: 'pluginDisabled',
        });
        return;
      }

      // The plugin is on. Whether THIS person may use it is a separate question,
      // answered by any endpoint that requires a finance role.
      let hasRole = false;
      let fmsRole = null;
      let reason = null;

      try {
        const me = await fmsAPI.getNotificationPrefs();
        hasRole = true;
        fmsRole = me?.data?.fmsRole ?? data.fmsRole ?? null;
      } catch (err) {
        const status = err?.response?.status;
        const message = err?.response?.data?.error?.message || '';
        if (status === 403 && /no fms role|no finance role/i.test(message)) {
          hasRole = false;
          reason = 'noFinanceRole';
        } else {
          // An unexpected failure is not the same as "no role" — surface it.
          hasRole = false;
          reason = 'statusCheckFailed';
        }
      }

      setState({
        loading: false,
        enabled: true,
        hasRole,
        fmsRole,
        financialYear: data.financialYear || null,
        currency: data.currency || 'INR',
        version: data.version || null,
        error: null,
        reason,
      });
    } catch (err) {
      // A 404 here means the plugin is not mounted at all — the same practical
      // situation as being switched off, and worth saying so plainly.
      const status = err?.response?.status;
      setState({
        loading: false,
        enabled: false,
        hasRole: false,
        fmsRole: null,
        financialYear: null,
        currency: 'INR',
        version: null,
        error: status === 404 ? null : err,
        reason: status === 404 ? 'pluginDisabled' : 'statusCheckFailed',
      });
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const value = {
    ...state,
    user,
    refresh: load,
    /** True only when the FMS is usable by this person. */
    ready: state.enabled && state.hasRole && !state.loading,
  };

  return <FmsContext.Provider value={value}>{children}</FmsContext.Provider>;
};

export const useFms = () => {
  const ctx = useContext(FmsContext);
  if (!ctx) throw new Error('useFms must be used inside <FmsProvider>');
  return ctx;
};

export default FmsContext;