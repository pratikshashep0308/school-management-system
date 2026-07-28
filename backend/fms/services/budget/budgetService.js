// backend/fms/services/budget/budgetService.js
//
// Budget Management. SRS M6 / FR-M6, screens SCR-22 (list), SCR-23 (entry),
// SCR-24 (revision), SCR-25 (budget vs actual).
//
// ─── ACTUALS ARE DERIVED, NEVER STORED ───────────────────────────────────────
// `actual` is computed from fms_ledgerentries every time it is asked for.
// Storing it would be a second copy of the ledger that drifts the first time
// anything is posted outside the update path — and a budget report that
// disagrees with the ledger is worse than no report.
//
// ─── AVOIDING THE DOUBLE COUNT ───────────────────────────────────────────────
// A paid expense is in the ledger AND is an expense request. Counting both
// would exhaust the budget at half its real spend. So:
//
//     actual     = posted to the ledger              (money gone)
//     committed  = approved but NOT yet paid          (money promised)
//     consumed   = actual + committed                 (no overlap)
//     available  = effectiveBudget − consumed
//
// Committed deliberately excludes `paymentCompleted` and `closed`, which are
// already in `actual`.

const mongoose = require('mongoose');
const {
  FmsAccount, FmsLedgerEntry, FmsFinancialYear, FmsAuditTrail,
} = require('../../models/core');
const { FmsBudget } = require('../../models/budget');
const { FmsExpenseRequest } = require('../../models/expense');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Approved-but-unpaid. Paid ones live in `actual`. */
const COMMITTED_STATUSES = [
  'submitted', 'accountsVerified', 'principalApproved',
  'chairmanApproved', 'paymentPending',
];

async function audit({ school, doc, action, before, after, req }) {
  await FmsAuditTrail.create({
    school,
    entity: 'fms_budgets',
    entityId: doc?._id,
    action,
    before,
    after,
    actor: req?.user?._id,
    actorEmail: req?.user?.email,
    actorRole: req?.fmsRole,
    ipAddress: req?.ip,
    userAgent: req?.get?.('user-agent'),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived figures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Actual spend on an account within a financial year, from the ledger.
 *
 * Σ(debit − credit) — so a reversal reduces it, which is the point: a payment
 * that bounced did not consume budget.
 */
async function actualSpend(school, account, financialYear, department) {
  const match = {
    school: oid(school),
    account: oid(account),
    financialYear: oid(financialYear),
  };
  if (department) match.department = department;

  const [agg] = await FmsLedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, n: { $sum: 1 } } },
  ]);

  return {
    amount: (agg?.debit || 0) - (agg?.credit || 0),
    entries: agg?.n || 0,
  };
}

/** Approved but not yet paid — money promised, not yet gone. */
async function committedSpend(school, account, financialYear, departmentName) {
  const match = {
    school: oid(school),
    budgetHead: oid(account),
    financialYear: oid(financialYear),
    expenseStatus: { $in: COMMITTED_STATUSES },
  };
  if (departmentName) match['department.name'] = departmentName;

  const [agg] = await FmsExpenseRequest.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$totalAmount' }, n: { $sum: 1 } } },
  ]);

  return { amount: agg?.total || 0, requests: agg?.n || 0 };
}

/** Full position for one budget. */
async function position(budget) {
  const effective = budget.revisedBudget ?? budget.budgetAmount;
  const dept = budget.department?.name || null;

  const [actual, committed] = await Promise.all([
    actualSpend(budget.school, budget.account, budget.financialYear, budget.department?.ref),
    committedSpend(budget.school, budget.account, budget.financialYear, dept),
  ]);

  const consumed = actual.amount + committed.amount;
  const available = effective - consumed;
  const utilisation = effective > 0 ? consumed / effective : 0;

  return {
    budgetAmount: budget.budgetAmount,
    revisedBudget: budget.revisedBudget,
    effectiveBudget: effective,
    actual: actual.amount,
    actualEntries: actual.entries,
    committed: committed.amount,
    committedRequests: committed.requests,
    consumed,
    available,
    utilisation: Math.round(utilisation * 10000) / 10000,
    isOverBudget: available < 0,
    isNearLimit: utilisation >= (budget.warnThreshold ?? 0.9) && available >= 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The availability check used by expense submission
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Can `amount` be spent on this head?
 *
 * Returns `checked: false` when no live budget exists — NOT `ok`. Reporting a
 * pass when nothing was consulted would let every unbudgeted request through a
 * control that was never applied, and the stored record would read as though it
 * had been.
 */
async function checkAvailability(school, account, financialYear, amount, departmentName) {
  const query = {
    school: oid(school),
    account: oid(account),
    financialYear: oid(financialYear),
    budgetStatus: { $in: ['active', 'revised'] },
  };

  // A department-specific budget takes precedence over a school-wide one.
  let budget = null;
  if (departmentName) {
    budget = await FmsBudget.findOne({ ...query, 'department.name': departmentName });
  }
  if (!budget) {
    budget = await FmsBudget.findOne({ ...query, 'department.name': null });
  }

  if (!budget) {
    return {
      checked: false,
      outcome: 'notChecked',
      reason: 'No active budget is set for this head',
      checkedAt: new Date(),
    };
  }

  const pos = await position(budget);
  const wouldConsume = pos.consumed + amount;
  const effective = pos.effectiveBudget;

  let outcome = 'ok';
  let reason;

  if (wouldConsume > effective) {
    outcome = 'exceeded';
    reason = `Request of ${amount} exceeds the available balance of ${pos.available}`;
  } else if (effective > 0 && wouldConsume > effective * (budget.warnThreshold ?? 0.9)) {
    outcome = 'warning';
    reason = `This request takes the head past ${Math.round((budget.warnThreshold ?? 0.9) * 100)}% of its budget`;
  }

  return {
    checked: true,
    outcome,
    reason,
    budgetId: budget._id,
    budgetAmount: effective,
    consumed: pos.consumed,
    available: pos.available,
    // 'warn' lets an over-budget request through without an acknowledgement.
    policy: budget.overBudgetPolicy,
    blocking: outcome === 'exceeded' && budget.overBudgetPolicy === 'block',
    checkedAt: new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD and workflow
// ─────────────────────────────────────────────────────────────────────────────

async function validateHead(school, account) {
  const acct = await FmsAccount.findOne({ _id: account, school }).lean();
  if (!acct) throw errors.validation('Validation failed', { account: 'account not found' });
  if (acct.accountType !== 'expense') {
    throw errors.validation('Validation failed', {
      account: `${acct.accountCode} is an ${acct.accountType} account — only expenditure is budgeted`,
    });
  }
  if (!acct.isPostable) {
    throw errors.validation('Validation failed', {
      account: `${acct.accountCode} is a grouping head, not postable`,
    });
  }
  return acct;
}

async function create(school, payload, req) {
  const fy = await FmsFinancialYear.findOne({ _id: payload.financialYear, school }).lean();
  if (!fy) throw errors.validation('Validation failed', { financialYear: 'not found' });
  if (['closed', 'locked'].includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year ${fy.yearCode} is ${fy.fyStatus}`);
  }

  const acct = await validateHead(school, payload.account);

  if (!Number.isInteger(payload.budgetAmount) || payload.budgetAmount < 0) {
    throw errors.validation('Validation failed', {
      budgetAmount: 'must be a non-negative integer in paise',
    });
  }

  const deptName = payload.department?.name || null;
  const clash = await FmsBudget.findOne({
    school, financialYear: fy._id, account: acct._id, 'department.name': deptName,
  }).lean();
  if (clash) {
    throw errors.conflict(
      `A budget already exists for ${acct.accountCode}${deptName ? ` (${deptName})` : ''} in ${fy.yearCode}`,
      { budgetId: clash._id, budgetStatus: clash.budgetStatus }
    );
  }

  const doc = await FmsBudget.create({
    school,
    financialYear: fy._id,
    account: acct._id,
    accountCode: acct.accountCode,
    accountName: acct.accountName,
    department: { name: deptName, ref: payload.department?.ref || null },
    budgetAmount: payload.budgetAmount,
    warnThreshold: payload.warnThreshold ?? 0.9,
    overBudgetPolicy: payload.overBudgetPolicy || 'block',
    budgetStatus: 'draft',
    notes: payload.notes,
    createdBy: req?.user?._id,
  });

  await audit({ school, doc, action: 'create', after: doc.toObject(), req });
  return doc;
}

/** Activate a draft. Only a live budget is consulted by the expense check. */
async function activate(school, id, req) {
  const doc = await FmsBudget.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Budget');

  if (doc.budgetStatus !== 'draft') {
    throw errors.conflict(`Only a draft budget can be activated (this one is ${doc.budgetStatus})`);
  }

  const before = doc.toObject();
  doc.budgetStatus = 'active';
  doc.activatedBy = req?.user?._id;
  doc.activatedAt = new Date();
  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({ school, doc, action: 'approve', before, after: doc.toObject(), req });
  return doc;
}

/** Edit a draft. A live budget must be revised, not edited. */
async function update(school, id, payload, req) {
  const doc = await FmsBudget.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Budget');

  if (doc.budgetStatus !== 'draft') {
    throw errors.conflict(
      `A ${doc.budgetStatus} budget cannot be edited`,
      { hint: 'Use the revision endpoint — a change to a live budget must be recorded with a reason.' }
    );
  }

  const before = doc.toObject();
  if (payload.budgetAmount !== undefined) {
    if (!Number.isInteger(payload.budgetAmount) || payload.budgetAmount < 0) {
      throw errors.validation('Validation failed', {
        budgetAmount: 'must be a non-negative integer in paise',
      });
    }
    doc.budgetAmount = payload.budgetAmount;
  }
  if (payload.warnThreshold !== undefined) doc.warnThreshold = payload.warnThreshold;
  if (payload.overBudgetPolicy !== undefined) doc.overBudgetPolicy = payload.overBudgetPolicy;
  if (payload.notes !== undefined) doc.notes = payload.notes;

  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({ school, doc, action: 'update', before, after: doc.toObject(), req });
  return doc;
}

/**
 * Revise a live budget (SCR-24).
 *
 * The original `budgetAmount` is never overwritten — the revision sits beside
 * it, so "what was originally allocated" stays answerable. Every revision
 * carries a reason.
 */
async function revise(school, id, { newAmount, reason }, req) {
  const doc = await FmsBudget.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Budget');

  if (!doc.isLive()) {
    throw errors.conflict(`Only a live budget can be revised (this one is ${doc.budgetStatus})`);
  }
  if (!Number.isInteger(newAmount) || newAmount < 0) {
    throw errors.validation('Validation failed', {
      newAmount: 'must be a non-negative integer in paise',
    });
  }
  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', {
      reason: 'is required — a budget change without a reason cannot be explained later',
    });
  }

  const previous = doc.revisedBudget ?? doc.budgetAmount;
  if (newAmount === previous) {
    throw errors.validation('Validation failed', {
      newAmount: 'is the same as the current budget',
    });
  }

  // Revising below what has already been consumed is allowed but flagged: it
  // records a real decision (the money is spent) rather than being refused.
  const pos = await position(doc);
  const warning = newAmount < pos.consumed
    ? `The new budget is below the ${pos.consumed} already consumed — this head is now over budget`
    : null;

  const before = doc.toObject();
  doc.revisions.push({
    previousAmount: previous,
    newAmount,
    delta: newAmount - previous,
    reason,
    revisedBy: req?.user?._id,
    revisedByEmail: req?.user?.email,
    revisedAt: new Date(),
  });
  doc.revisedBudget = newAmount;
  doc.budgetStatus = 'revised';
  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({ school, doc, action: 'update', before, after: doc.toObject(), req });
  return { budget: doc, warning };
}

async function close(school, id, req) {
  const doc = await FmsBudget.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Budget');

  if (doc.budgetStatus === 'closed') throw errors.conflict('This budget is already closed');

  const before = doc.toObject();
  doc.budgetStatus = 'closed';
  doc.closedBy = req?.user?._id;
  doc.closedAt = new Date();
  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({ school, doc, action: 'cancel', before, after: doc.toObject(), req });
  return doc;
}

/** Budget vs Actual across every budget in a year (SCR-25). */
async function budgetVsActual(school, financialYear, { departmentName } = {}) {
  const filter = { school: oid(school), financialYear: oid(financialYear) };
  if (departmentName) filter['department.name'] = departmentName;

  const budgets = await FmsBudget.find(filter).sort({ accountCode: 1 });

  const lines = [];
  const totals = {
    budgetAmount: 0, effectiveBudget: 0, actual: 0,
    committed: 0, consumed: 0, available: 0,
  };

  for (const b of budgets) {
    const pos = await position(b);
    lines.push({
      _id: b._id,
      account: b.account,
      accountCode: b.accountCode,
      accountName: b.accountName,
      department: b.department?.name || null,
      budgetStatus: b.budgetStatus,
      revisionCount: b.revisions?.length || 0,
      ...pos,
    });

    totals.budgetAmount += pos.budgetAmount;
    totals.effectiveBudget += pos.effectiveBudget;
    totals.actual += pos.actual;
    totals.committed += pos.committed;
    totals.consumed += pos.consumed;
    totals.available += pos.available;
  }

  totals.utilisation = totals.effectiveBudget > 0
    ? Math.round((totals.consumed / totals.effectiveBudget) * 10000) / 10000
    : 0;
  totals.overBudgetHeads = lines.filter((l) => l.isOverBudget).length;
  totals.nearLimitHeads = lines.filter((l) => l.isNearLimit).length;

  return { lines, totals };
}

module.exports = {
  create, activate, update, revise, close,
  position, budgetVsActual, checkAvailability,
  actualSpend, committedSpend, validateHead,
  COMMITTED_STATUSES,
};