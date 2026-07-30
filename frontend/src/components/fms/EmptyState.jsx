// frontend/src/components/fms/EmptyState.jsx
//
// What a screen shows when there is nothing to show.
//
// ─── THE REASON COMES FROM THE BACKEND ───────────────────────────────────────
// Until the Chart of Accounts is set up (open item O3), most FMS screens are
// legitimately empty — and the backend already explains why, in words written
// to be understood:
//
//   "No postable accounts exist — the Chart of Accounts has not been set up"
//   "No active budgets for this year — nothing to report against"
//   "Only one branch has FMS activity. Consolidation is available but has
//    nothing to consolidate."
//
// Those are better than anything we would write here, because they know which
// specific thing is missing. Render them verbatim.
//
// A screen showing zeros AND this explanation is working correctly. A blank
// page is not.

import React from 'react';

const EmptyState = ({ title = 'Nothing to show yet', reason, hint, action, icon = null }) => (
  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--canvas)] px-6 py-12 text-center">
    {icon && <div className="mb-3 text-[var(--muted)]">{icon}</div>}

    <h3 className="text-base font-medium text-[var(--ink)]">{title}</h3>

    {/* The backend's own words, unaltered. */}
    {reason && (
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
        {reason}
      </p>
    )}

    {hint && (
      <p className="mt-3 max-w-md text-xs leading-relaxed text-[var(--muted)]">
        {hint}
      </p>
    )}

    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;