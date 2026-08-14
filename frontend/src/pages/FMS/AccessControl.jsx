// frontend/src/pages/FMS/AccessControl.jsx
//
// Who may see the books. Route /fms/access.
//
// ─── WHY THIS IS NOT THE SMS ACCESS CONTROL SCREEN ───────────────────────────
// The school system has its own role matrix covering students, fees, library
// and the rest. The finance module is absent from it on purpose: if finance
// access lived there, switching the module off would leave orphaned finance
// permissions across school-system roles, and the school system would have to
// know what an FMS module is. The toggle only stays clean while it does not.
//
// So finance access is its own list. Somebody being an "accountant" in the
// school system grants them nothing here — that role says who collects fees at
// the counter, which is a different question from who may approve a payment.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import fmsAPI from '../../utils/fmsAPI';
import FmsLayout from '../../components/fms/FmsLayout';
import ErrorBanner from '../../components/fms/ErrorBanner';

const AccessControl = () => {
  const [users, setUsers] = useState([]);
  const [catalogue, setCatalogue] = useState([]);
  const [adminRoles, setAdminRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [u, r] = await Promise.all([fmsAPI.getAccessUsers(), fmsAPI.getAccessRoles()]);
      setUsers((u?.data?.data ?? u?.data) || []);
      const roles = r?.data?.data ?? r?.data;
      setCatalogue(roles?.roles || []);
      setAdminRoles(roles?.administratorRoles || []);
    } catch (err) {
      setError(err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const change = async (user, financeRole) => {
    setSaving(String(user.smsUserId));
    try {
      if (financeRole === '') {
        await fmsAPI.revokeAccess(user.smsUserId);
        toast.success(`Finance access withdrawn from ${user.name}`);
      } else {
        await fmsAPI.setAccess(user.smsUserId, { financeRole });
        toast.success(`${user.name} — ${financeRole}`);
      }
      await load();
    } catch (err) {
      // The lockout guard lands here. It is the most useful error this screen
      // can produce, so it gets shown in full rather than truncated.
      const msg = err?.response?.data?.error?.message || err.message;
      toast.error(msg, { duration: 8000 });
    } finally { setSaving(null); }
  };

  const withAccess = useMemo(() => users.filter((u) => u.financeRole), [users]);
  const without = useMemo(() => users.filter((u) => !u.financeRole), [users]);
  const administrators = useMemo(
    () => withAccess.filter((u) => adminRoles.includes(u.financeRole)),
    [withAccess, adminRoles],
  );

  const Row = ({ u }) => (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-2.5 pr-3">
        <div className="text-sm">{u.name}</div>
        <div className="text-xs text-[var(--muted)]">{u.email}</div>
      </td>
      <td className="py-2.5 pr-3 text-xs text-[var(--muted)]">
        {u.smsRole}
        {!u.smsActive && <span className="ml-1 text-[var(--danger)]">· deactivated</span>}
      </td>
      <td className="py-2.5 pr-3">
        <select
          value={u.financeRole || ''}
          disabled={saving === String(u.smsUserId) || !u.smsActive}
          onChange={(e) => change(u, e.target.value)}
          className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs disabled:opacity-40"
        >
          <option value="">No finance access</option>
          {catalogue.map((r) => (
            <option key={r.role} value={r.role}>{r.label}</option>
          ))}
        </select>
      </td>
      <td className="py-2.5 text-xs text-[var(--muted)]">
        {catalogue.find((r) => r.role === u.financeRole)?.summary || '—'}
      </td>
    </tr>
  );

  return (
    <FmsLayout
      title="Access Control"
      actions={
        <button type="button" onClick={load} disabled={loading}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      }
    >
      {error && <ErrorBanner error={error} onRetry={load} className="mb-4" />}

      <div className="mb-4 rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-relaxed">
        <p>
          Finance access is separate from the school system's own access control. A role
          here decides what somebody can do with the books; it grants nothing outside the
          finance module, and nothing outside it grants anything here.
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Every change on this screen is recorded in the audit trail with your name against it.
        </p>
      </div>

      {/* The lockout risk, stated before somebody discovers it. */}
      {administrators.length === 1 && (
        <div className="mb-4 rounded-lg border border-[var(--gold)] bg-[var(--gold-soft)] p-3 text-xs">
          <strong>{administrators[0].name}</strong> is the only person who can change access
          on this screen. That role cannot be removed until somebody else holds Chairman or
          Trustee — otherwise nobody could restore it.
        </div>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">
          With finance access
          <span className="ml-2 font-normal text-[var(--muted)]">{withAccess.length}</span>
        </h2>

        {withAccess.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Nobody has finance access yet. Grant it below.
          </p>
        ) : (
          <table className="mt-2 w-full text-left">
            <tbody>{withAccess.map((u) => <Row key={String(u.smsUserId)} u={u} />)}</tbody>
          </table>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-[var(--border)] bg-white p-4">
        <button type="button" onClick={() => setShowAll((v) => !v)}
          className="flex w-full items-center justify-between text-left">
          <h2 className="text-sm font-semibold">
            Everybody else
            <span className="ml-2 font-normal text-[var(--muted)]">{without.length}</span>
          </h2>
          <span className="text-xs text-[var(--muted)]">{showAll ? 'Hide' : 'Show'}</span>
        </button>

        {showAll && (
          <table className="mt-2 w-full text-left">
            <tbody>{without.map((u) => <Row key={String(u.smsUserId)} u={u} />)}</tbody>
          </table>
        )}
      </div>
    </FmsLayout>
  );
};

export default AccessControl;
