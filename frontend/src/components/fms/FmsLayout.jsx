// frontend/src/components/fms/FmsLayout.jsx
//
// The frame every FMS page sits in: navigation, and the financial year the
// figures belong to.
//
// Navigation filters by the person's FINANCE role — which is not their SMS
// role. A teacher may administer the school system and hold no finance role at
// all, and that is correct.
//
// Uses the existing --mod / --mod-soft accent convention from index.css rather
// than introducing new colours.

import React from 'react';
import { NavLink } from 'react-router-dom';
import { useFms } from '../../context/FmsContext';
import fmsAPI, { clearFinanceSession } from '../../utils/fmsAPI';

/**
 * roles: which finance roles may see the item. Omitted means everyone with any
 * finance role. This mirrors the backend's permission matrix but does NOT
 * enforce it — the backend refuses regardless, and this only decides what is
 * worth showing.
 */
// EVERY ENTRY HERE MUST HAVE A MATCHING ROUTE IN App.js.
//
// An earlier version listed Receipts, Expenses, Payments and Petty Cash, whose
// pages were never built, plus a bare /fms/banking that was never registered.
// React Router found no match, fell through to the catch-all, and bounced the
// user to the login screen — which looks like being logged out rather than like
// a missing page, and is a far more alarming thing to see.
//
// If you add a nav entry, add its route in the same commit.
const NAV = [
  { to: '/fms', label: 'Dashboard', end: true },
  { to: '/fms/accounts', label: 'Chart of Accounts' },
  { to: '/fms/ledger', label: 'General Ledger' },
  { to: '/fms/journal', label: 'Journal Vouchers' },
  { to: '/fms/books', label: 'Cash & Bank Book' },
  { to: '/fms/approvals', label: 'Approvals' },
  { to: '/fms/budgets', label: 'Budgets' },
  { to: '/fms/payments', label: 'Payments' },
  { to: '/fms/petty-cash', label: 'Petty Cash' },
  // Banking has two screens and no index page; point at reconciliation, which
  // is the one people open. Settlements is reachable from within it.
  { to: '/fms/banking/reconcile', label: 'Bank Reconciliation' },
  { to: '/fms/banking/settlements', label: 'Settlements' },
  { to: '/fms/reports', label: 'Reports' },
  { to: '/fms/audit', label: 'Audit Trail', roles: ['chairman', 'trustee', 'principal', 'accountsManager', 'auditor'] },
  { to: '/fms/financial-years', label: 'Financial Years', roles: ['chairman', 'trustee', 'principal', 'accountsManager'] },
  { to: '/fms/settings/mappings', label: 'Account Mappings', roles: ['accountsManager', 'accountant'] },
  { to: '/fms/integrations', label: 'Data Import', roles: ['accountsManager', 'accountant'] },
  { to: '/fms/diagnostics', label: 'Diagnostics', roles: ['chairman', 'trustee', 'principal', 'accountsManager', 'accountant', 'auditor'] },
  { to: '/fms/expense-categories', label: 'Expense Categories', roles: ['accountsManager', 'accountant'] },
  { to: '/fms/access', label: 'Access Control', roles: ['chairman', 'trustee'] },
];

// NOT YET BUILT — no page exists, so they are deliberately absent above:
//   /fms/income     Receipts   (fees are collected in the SMS's Fees screens; the
//                               FMS ingests them, so a list here is a VIEW, not entry)
//   /fms/expenses   Expenses   (raised in the SMS's AddExpense; what the FMS adds is
//                               the approval chain, which Approvals already covers)
// The BACKEND for both is complete and tested — only the screens are missing.

const FmsLayout = ({ children, title, actions }) => {
  const { financialYear, fmsRole } = useFms();

  // Standing alone in its own window, this layout has to supply what the school
  // system's chrome used to: who you are, and a way out. The lock button
  // matters most — somebody stepping away should be able to close the books
  // without closing the window and losing what they were doing.
  const lockAndClose = async () => {
    try { await fmsAPI.lockFinance(); } catch { /* the audit note is best-effort */ }
    clearFinanceSession();
    window.location.reload();
  };

  const visible = NAV.filter((n) => !n.roles || n.roles.includes(fmsRole));

  return (
    <div className="mod-blue flex min-h-screen bg-[var(--canvas)]">
      <aside className="w-56 shrink-0 border-r border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--mod)]">
              Finance
            </div>
            <button
              type="button"
              onClick={lockAndClose}
              title="Close the books. You will need your password to reopen them."
              className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]"
            >
              Lock
            </button>
          </div>
          {financialYear && (
            <div className="mt-1 text-xs text-[var(--muted)]">{financialYear}</div>
          )}
        </div>

        <nav className="p-2">
          {visible.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-[var(--mod-soft)] font-medium text-[var(--mod)]'
                    : 'text-[var(--ink)] hover:bg-[var(--canvas)]'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        {fmsRole && (
          <div className="px-4 py-3 text-[10px] uppercase tracking-wide text-[var(--muted)]">
            {fmsRole}
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1">
        {(title || actions) && (
          <header className="flex items-center justify-between border-b border-[var(--border)] bg-white px-6 py-4">
            <h1 className="text-lg font-semibold text-[var(--ink)]">{title}</h1>
            {actions && <div className="flex gap-2">{actions}</div>}
          </header>
        )}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
};

export default FmsLayout;