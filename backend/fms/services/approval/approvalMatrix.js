// backend/fms/services/approval/approvalMatrix.js
//
// Approval routing. SRS M5 / FR-M5, BPMN WF1.
//
// ─── PURE ON PURPOSE ─────────────────────────────────────────────────────────
// Every function here is a pure function of its arguments. No database, no
// request, no clock. That is deliberate: threshold routing is the part of this
// system where an off-by-one has the largest consequence — ₹10,000 and ₹10,001
// go to different people — and pure logic can be exhaustively tested at every
// boundary without fixtures.
//
// ─── HOW STATES AND TIERS FIT TOGETHER ───────────────────────────────────────
// The brief lists one chain:
//     submitted → accountsVerified → principalApproved → chairmanApproved
//               → paymentPending → paymentCompleted → closed
// but tier 1 needs only a Dept Head and tier 4 adds a Trustee, so the states
// that actually apply depend on the amount.
//
// Resolution: **the state records the last completed approval, and becomes
// `paymentPending` once the chain is complete.** No states are invented. What
// would otherwise be ambiguous — "is chairmanApproved waiting for a trustee or
// finished?" — is answered by `nextAction()`, computed from tier and state, so
// no caller has to infer it.

/**
 * Default thresholds, per the brief. Amounts are integer PAISE.
 *
 *   ≤ ₹10,000            Dept Head
 *   ₹10,001 – ₹50,000    Principal
 *   ₹50,001 – ₹2,00,000  Principal + Chairman
 *   > ₹2,00,000          Principal + Chairman + Trustee
 *
 * Overridable per school via fms_approvalmatrix (SCR-20).
 */
const DEFAULT_TIERS = [
  { tier: 1, minAmount: 0, maxAmount: 1000000, approvers: ['deptHead'] },
  { tier: 2, minAmount: 1000001, maxAmount: 5000000, approvers: ['principal'] },
  { tier: 3, minAmount: 5000001, maxAmount: 20000000, approvers: ['principal', 'chairman'] },
  { tier: 4, minAmount: 20000001, maxAmount: null, approvers: ['principal', 'chairman', 'trustee'] },
];

/** Accounts verification precedes every approval chain, at every tier. */
const VERIFY_ROLE = 'accountant';

/** Which FMS finance roles may act as each approver step. */
const ROLE_FOR_STEP = {
  accounts: ['accountant', 'accountsManager'],
  deptHead: ['deptHead', 'principal', 'chairman'],       // seniors may act below their level
  principal: ['principal', 'vicePrincipal'],
  chairman: ['chairman'],
  trustee: ['trustee', 'chairman'],
};

/** The state recorded once a given step completes, when more steps remain. */
const STATE_AFTER = {
  accounts: 'accountsVerified',
  deptHead: 'accountsVerified',      // tier 1 has no further approval state
  principal: 'principalApproved',
  chairman: 'chairmanApproved',
  trustee: 'chairmanApproved',
};

const TERMINAL_STATES = ['paymentCompleted', 'closed', 'rejected', 'cancelled'];

/**
 * The tier an amount falls into.
 *
 * Boundaries are INCLUSIVE of maxAmount and the next tier starts one paisa
 * higher, so ₹10,000.00 is tier 1 and ₹10,000.01 is tier 2. There is no gap and
 * no overlap — a gap would leave an amount unroutable and an overlap would make
 * routing depend on iteration order.
 *
 * @param {number} amount integer paise
 * @param {Array}  [tiers]
 */
function tierFor(amount, tiers = DEFAULT_TIERS) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`tierFor: amount must be a non-negative integer in paise, got ${amount}`);
  }

  const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount);
  for (const t of sorted) {
    const withinMin = amount >= t.minAmount;
    const withinMax = t.maxAmount === null || t.maxAmount === undefined || amount <= t.maxAmount;
    if (withinMin && withinMax) return t;
  }

  // Unreachable with a well-formed matrix; treated as a configuration error
  // rather than silently routing to the highest tier.
  throw new Error(`tierFor: no tier covers ${amount} paise — the approval matrix has a gap`);
}

/**
 * The ordered chain of steps for an amount.
 *
 * Every chain begins with accounts verification. The final step always results
 * in `paymentPending`, whichever role performs it.
 *
 * @returns {Array<{step:string, fromStatus:string, toStatus:string, roles:string[]}>}
 */
function chainFor(amount, tiers = DEFAULT_TIERS) {
  const tier = tierFor(amount, tiers);
  const steps = ['accounts', ...tier.approvers];

  return steps.map((step, i) => {
    const isLast = i === steps.length - 1;
    const fromStatus = i === 0 ? 'submitted' : STATE_AFTER[steps[i - 1]];
    return {
      step,
      fromStatus,
      toStatus: isLast ? 'paymentPending' : STATE_AFTER[step],
      roles: ROLE_FOR_STEP[step] || [],
      isLast,
    };
  });
}

/**
 * The step that must happen next, or null if the chain is complete.
 *
 * This is what removes the ambiguity in the state names: a tier-4 expense at
 * `chairmanApproved` is waiting for a trustee, while a tier-3 one at the same
 * state is complete — and callers never have to work that out.
 */
function nextStep(currentStatus, amount, tiers = DEFAULT_TIERS) {
  if (TERMINAL_STATES.includes(currentStatus)) return null;
  if (currentStatus === 'paymentPending') return null;

  const chain = chainFor(amount, tiers);

  // `returned` and `draft` are pre-submission; the chain has not started.
  if (['draft', 'returned'].includes(currentStatus)) return null;

  const idx = chain.findIndex((s) => s.fromStatus === currentStatus);
  if (idx === -1) return null;

  // Several steps can share a fromStatus (tier 1: accounts and deptHead both
  // sit at accountsVerified). Take the first not yet completed — which the
  // caller distinguishes via completedSteps.
  return chain[idx];
}

/**
 * The next step, given which steps are already done. The authoritative form.
 *
 * @param {string[]} completedSteps e.g. ['accounts', 'principal']
 */
function nextAction(currentStatus, amount, completedSteps = [], tiers = DEFAULT_TIERS) {
  if (TERMINAL_STATES.includes(currentStatus)) {
    return { done: true, reason: `Expense is ${currentStatus}` };
  }
  if (['draft', 'returned'].includes(currentStatus)) {
    return { done: false, step: null, reason: 'Not yet submitted' };
  }
  if (currentStatus === 'paymentPending') {
    return { done: false, step: 'payment', roles: ['accountsManager', 'accountant'],
      reason: 'Approved — awaiting payment' };
  }

  const chain = chainFor(amount, tiers);
  const pending = chain.find((s) => !completedSteps.includes(s.step));

  if (!pending) return { done: true, reason: 'Approval chain complete' };

  return {
    done: false,
    step: pending.step,
    roles: pending.roles,
    toStatus: pending.toStatus,
    isFinal: pending.isLast,
    remaining: chain.filter((s) => !completedSteps.includes(s.step)).map((s) => s.step),
  };
}

/**
 * May this role perform this step now?
 *
 * Returns a reason on refusal, because "403" alone tells an approver nothing
 * about whose turn it actually is.
 */
function canAct(financeRole, step, currentStatus, amount, completedSteps = [], tiers = DEFAULT_TIERS) {
  const next = nextAction(currentStatus, amount, completedSteps, tiers);

  if (next.done) {
    return { allowed: false, reason: next.reason };
  }
  if (next.step !== step) {
    return {
      allowed: false,
      reason: next.step
        ? `Out of order: the next step is '${next.step}', not '${step}'`
        : `Nothing to do at status '${currentStatus}'`,
      expected: next.step,
    };
  }
  if (!next.roles.includes(financeRole)) {
    return {
      allowed: false,
      reason: `Role '${financeRole}' cannot perform step '${step}'`,
      allowedRoles: next.roles,
    };
  }
  return { allowed: true, toStatus: next.toStatus, isFinal: next.isFinal };
}

/** Validate a matrix before it is saved — gaps and overlaps are routing bugs. */
function validateTiers(tiers) {
  const problems = [];
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return ['at least one tier is required'];
  }

  const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount);

  if (sorted[0].minAmount !== 0) {
    problems.push('the lowest tier must start at 0');
  }
  const last = sorted[sorted.length - 1];
  if (last.maxAmount !== null && last.maxAmount !== undefined) {
    problems.push('the highest tier must be open-ended (maxAmount: null)');
  }

  for (const t of sorted) {
    if (!Array.isArray(t.approvers) || t.approvers.length === 0) {
      problems.push(`tier starting at ${t.minAmount} has no approvers`);
    }
    for (const a of t.approvers || []) {
      if (!ROLE_FOR_STEP[a]) problems.push(`unknown approver step '${a}'`);
    }
    if (t.maxAmount !== null && t.maxAmount !== undefined && t.maxAmount < t.minAmount) {
      problems.push(`tier starting at ${t.minAmount} has maxAmount below minAmount`);
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.maxAmount === null || prev.maxAmount === undefined) {
      problems.push('only the highest tier may be open-ended');
      continue;
    }
    if (cur.minAmount !== prev.maxAmount + 1) {
      problems.push(
        cur.minAmount > prev.maxAmount + 1
          ? `gap between ${prev.maxAmount} and ${cur.minAmount} — amounts in between are unroutable`
          : `overlap between ${cur.minAmount} and ${prev.maxAmount} — routing would depend on order`
      );
    }
  }

  return problems;
}

module.exports = {
  DEFAULT_TIERS,
  VERIFY_ROLE,
  ROLE_FOR_STEP,
  STATE_AFTER,
  TERMINAL_STATES,
  tierFor,
  chainFor,
  nextStep,
  nextAction,
  canAct,
  validateTiers,
};