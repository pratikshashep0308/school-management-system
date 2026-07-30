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

/**
 * roles: which finance roles may see the item. Omitted means everyone with any
 * finance role. This mirrors the backend's permission matrix but does NOT
 * enforce it — the backend refuses regardless, and this only decides what is
 * worth showing.
 */
const NAV = [
  { to: '/fms', label: 'Dashboard', end: true },
  { to: '/fms/accounts', label: 'Chart of Accounts' },
  { to: '/fms/ledger', label: 'General Ledger' },
  { to: '/fms/journal', label: 'Journal Vouchers' },
  { to: '/fms/books', label: 'Cash & Bank Book' },
  { to: '/fms/income', label: 'Receipts' },
  { to: '/fms/expenses', label: 'Expenses' },
  { to: '/fms/approvals', label: 'Approvals' },
  { to: '/fms/payments', label: 'Payments' },
  { to: '/fms/budgets', label: 'Budgets' },
  { to: '/fms/banking', label: 'Banking' },
  { to: '/fms/petty-cash', label: 'Petty Cash' },
  { to: '/fms/reports', label: 'Reports' },
  { to: '/fms/audit', label: 'Audit Trail', roles: ['chairman', 'trustee', 'principal', 'accountsManager', 'auditor'] },
  { to: '/fms/financial-years', label: 'Financial Years', roles: ['chairman', 'trustee', 'principal', 'accountsManager'] },
  { to: '/fms/integrations', label: 'Data Import', roles: ['accountsManager', 'accountant'] },
];

const FmsLayout = ({ children, title, actions }) => {
  const { financialYear, fmsRole } = useFms();

  const visible = NAV.filter((n) => !n.roles || n.roles.includes(fmsRole));

  return (
    <div className="mod-blue flex min-h-screen bg-[var(--canvas)]">
      <aside className="w-56 shrink-0 border-r border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-4 py-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--mod)]">
            Finance
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