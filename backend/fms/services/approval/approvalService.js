// backend/fms/services/approval/approvalService.js
//
// Expense approval workflow. SRS M5 / FR-M5, BPMN WF1,
// screens SCR-18 (inbox), SCR-19 (action), SCR-20 (matrix), SCR-21 (history).
//
// Routing logic lives in approvalMatrix.js and is pure. This module is the
// database-facing half: it loads the matrix, reads what has already happened,
// asks the pure logic whether an action is permitted, and writes the result.
//
// ─── FOUR GUARDS, EVERY ACTION ───────────────────────────────────────────────
//   1. status        the expense must be in a state where this step is next
//   2. order         no skipping — enforced by the pure chain
//   3. role          only roles mapped to this step may act
//   4. duties        nobody approves what they raised or submitted

const mongoose = require('mongoose');
const { FmsAuditTrail } = require('../../models/core');
const { FmsExpenseRequest } = require('../../models/expense');
const { FmsApprovalMatrix, FmsExpenseApproval } = require('../../models/approval');
const matrix = require('./approvalMatrix');
const { errors } = require('../../utils/apiResponse');

/**
 * The tiers in force for a school and year.
 *
 * A year-specific matrix wins over a global one, so thresholds can change at a
 * year boundary without rewriting how past approvals were routed.
 */
async function tiersFor(school, financialYear) {
  const found = await FmsApprovalMatrix.findOne({
    school,
    isActive: true,
    $or: [{ financialYear }, { financialYear: null }],
  }).sort({ financialYear: -1 }).lean();   // non-null sorts before null

  return found?.tiers?.length ? found.tiers : matrix.DEFAULT_TIERS;
}

/** Which steps have already been completed for this expense. */
async function completedSteps(school, expenseId) {
  const rows = await FmsExpenseApproval.find({
    school, expenseRequest: expenseId, action: { $in: ['verify', 'approve'] },
  }).select('step actedAt').sort({ actedAt: 1 }).lean();

  // A return or rejection resets progress: the next submission starts over,
  // otherwise a corrected request could slide past approvals given to the
  // version that was rejected.
  const reset = await FmsExpenseApproval.findOne({
    school, expenseRequest: expenseId, action: { $in: ['reject', 'return'] },
  }).sort({ actedAt: -1 }).lean();

  const relevant = reset ? rows.filter((r) => r.actedAt > reset.actedAt) : rows;
  return [...new Set(relevant.map((r) => r.step))];
}

/** Full position: tier, chain, what is done, what is next. */
async function position(school, expense) {
  const tiers = await tiersFor(school, expense.financialYear);
  const done = await completedSteps(school, expense._id);
  const tier = matrix.tierFor(expense.totalAmount, tiers);
  const chain = matrix.chainFor(expense.totalAmount, tiers);
  const next = matrix.nextAction(expense.expenseStatus, expense.totalAmount, done, tiers);

  return {
    tier: tier.tier,
    approvers: tier.approvers,
    chain: chain.map((s) => ({
      step: s.step,
      roles: s.roles,
      completed: done.includes(s.step),
      toStatus: s.toStatus,
    })),
    completedSteps: done,
    next,
  };
}

async function audit({ school, expense, action, before, after, req }) {
  await FmsAuditTrail.create({
    school,
    entity: 'fms_expenserequests',
    entityId: expense._id,
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

/**
 * Perform a workflow step.
 *
 * @param {'verify'|'approve'} action
 * @param {string} step  accounts | deptHead | principal | chairman | trustee
 */
async function act(school, expenseId, { action, step, comment }, req) {
  const expense = await FmsExpenseRequest.findOne({ _id: expenseId, school });
  if (!expense) throw errors.notFound('Expense request');

  const tiers = await tiersFor(school, expense.financialYear);
  const done = await completedSteps(school, expense._id);

  // ── Guards 1–3: status, order, role ──────────────────────────────────────
  const verdict = matrix.canAct(
    req?.fmsRole, step, expense.expenseStatus, expense.totalAmount, done, tiers
  );

  if (!verdict.allowed) {
    const pos = matrix.nextAction(expense.expenseStatus, expense.totalAmount, done, tiers);
    throw errors.forbidden(verdict.reason, {
      currentStatus: expense.expenseStatus,
      yourRole: req?.fmsRole,
      expectedStep: verdict.expected || pos.step,
      allowedRoles: verdict.allowedRoles || pos.roles,
      completedSteps: done,
    });
  }

  // ── Guard 4: separation of duties ────────────────────────────────────────
  const actor = String(req?.user?._id);
  if (String(expense.requestedBy) === actor || String(expense.submittedBy) === actor) {
    throw errors.forbidden(
      'Separation of duties: you cannot approve an expense you raised or submitted.',
      { hint: 'A different authorised user must act on this.' }
    );
  }
  // Nor may the same person occupy two steps of the same chain.
  const alreadyActed = await FmsExpenseApproval.findOne({
    school, expenseRequest: expense._id, actor: req?.user?._id,
    action: { $in: ['verify', 'approve'] },
  }).lean();
  if (alreadyActed) {
    throw errors.forbidden(
      `Separation of duties: you already acted on this expense at the '${alreadyActed.step}' step.`,
      { hint: 'Each step of an approval chain needs a different person.' }
    );
  }

  const tier = matrix.tierFor(expense.totalAmount, tiers);
  const before = expense.toObject();
  const fromStatus = expense.expenseStatus;
  const toStatus = verdict.toStatus;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await FmsExpenseApproval.create([{
        school,
        expenseRequest: expense._id,
        expenseNumber: expense.expenseNumber,
        step,
        action,
        actor: req?.user?._id,
        actorEmail: req?.user?.email,
        actorRole: req?.fmsRole,
        fromStatus,
        toStatus,
        amountAtAction: expense.totalAmount,
        tierAtAction: tier.tier,
        comment,
        ipAddress: req?.ip,
        actedAt: new Date(),
      }], { session });

      expense.expenseStatus = toStatus;
      expense.workflow.push({
        action: `${action}:${step}`,
        actor: req?.user?._id,
        actorEmail: req?.user?.email,
        actorRole: req?.fmsRole,
        comment,
        fromStatus,
        toStatus,
        at: new Date(),
      });
      expense.updatedBy = req?.user?._id;
      await expense.save({ session });
    });
  } finally {
    await session.endSession();
  }

  await audit({ school, expense, action: 'approve', before, after: expense.toObject(), req });

  return {
    expense,
    position: await position(school, expense),
    // P6.3 dispatches on this; recorded now so the transition is not lost if
    // notifications land later.
    notify: { event: `expense.${action}.${step}`, expenseNumber: expense.expenseNumber },
  };
}

/** Reject: terminal. The request must be re-raised, not re-submitted. */
async function reject(school, expenseId, req, reason) {
  const expense = await FmsExpenseRequest.findOne({ _id: expenseId, school });
  if (!expense) throw errors.notFound('Expense request');

  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', {
      reason: 'is required — a rejection without a reason cannot be acted on',
    });
  }

  const tiers = await tiersFor(school, expense.financialYear);
  const done = await completedSteps(school, expense._id);
  const next = matrix.nextAction(expense.expenseStatus, expense.totalAmount, done, tiers);

  if (next.done || !next.step || next.step === 'payment') {
    throw errors.conflict(
      `An expense at status '${expense.expenseStatus}' cannot be rejected`,
      { currentStatus: expense.expenseStatus }
    );
  }
  if (!next.roles.includes(req?.fmsRole)) {
    throw errors.forbidden(
      `Role '${req?.fmsRole}' cannot reject at the '${next.step}' step`,
      { allowedRoles: next.roles }
    );
  }

  const actor = String(req?.user?._id);
  if (String(expense.requestedBy) === actor || String(expense.submittedBy) === actor) {
    throw errors.forbidden('Separation of duties: you cannot reject an expense you raised or submitted.');
  }

  return transition(school, expense, {
    action: 'reject', step: next.step, toStatus: 'rejected', reason, req,
  });
}

/** Return for correction: goes back to the author, who may edit and resubmit. */
async function returnForCorrection(school, expenseId, req, reason) {
  const expense = await FmsExpenseRequest.findOne({ _id: expenseId, school });
  if (!expense) throw errors.notFound('Expense request');

  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', {
      reason: 'is required — the author needs to know what to correct',
    });
  }

  const tiers = await tiersFor(school, expense.financialYear);
  const done = await completedSteps(school, expense._id);
  const next = matrix.nextAction(expense.expenseStatus, expense.totalAmount, done, tiers);

  if (next.done || !next.step || next.step === 'payment') {
    throw errors.conflict(
      `An expense at status '${expense.expenseStatus}' cannot be returned`,
      { currentStatus: expense.expenseStatus }
    );
  }
  if (!next.roles.includes(req?.fmsRole)) {
    throw errors.forbidden(
      `Role '${req?.fmsRole}' cannot return at the '${next.step}' step`,
      { allowedRoles: next.roles }
    );
  }

  return transition(school, expense, {
    action: 'return', step: next.step, toStatus: 'returned', reason, req,
  });
}

/** Shared writer for reject and return. */
async function transition(school, expense, { action, step, toStatus, reason, req }) {
  const tiers = await tiersFor(school, expense.financialYear);
  const tier = matrix.tierFor(expense.totalAmount, tiers);
  const before = expense.toObject();
  const fromStatus = expense.expenseStatus;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await FmsExpenseApproval.create([{
        school,
        expenseRequest: expense._id,
        expenseNumber: expense.expenseNumber,
        step, action,
        actor: req?.user?._id,
        actorEmail: req?.user?.email,
        actorRole: req?.fmsRole,
        fromStatus, toStatus,
        amountAtAction: expense.totalAmount,
        tierAtAction: tier.tier,
        comment: reason,
        ipAddress: req?.ip,
        actedAt: new Date(),
      }], { session });

      expense.expenseStatus = toStatus;
      expense.workflow.push({
        action: `${action}:${step}`,
        actor: req?.user?._id,
        actorEmail: req?.user?.email,
        actorRole: req?.fmsRole,
        comment: reason,
        fromStatus, toStatus,
        at: new Date(),
      });
      expense.updatedBy = req?.user?._id;
      await expense.save({ session });
    });
  } finally {
    await session.endSession();
  }

  await audit({ school, expense, action, before, after: expense.toObject(), req });

  return {
    expense,
    position: await position(school, expense),
    notify: { event: `expense.${action}`, expenseNumber: expense.expenseNumber },
  };
}

/**
 * The inbox: expenses waiting on THIS person.
 *
 * Computed rather than stored. A stored queue would drift the moment the matrix
 * changed or someone's role was reassigned.
 */
async function inbox(school, financeRole, userId, { skip = 0, limit = 25 } = {}) {
  const tiers = await tiersFor(school, null);

  const candidates = await FmsExpenseRequest.find({
    school,
    expenseStatus: { $in: ['submitted', 'accountsVerified', 'principalApproved', 'chairmanApproved'] },
  }).sort({ priority: -1, requestDate: 1 }).lean();

  const mine = [];
  for (const e of candidates) {
    const done = await completedSteps(school, e._id);
    const next = matrix.nextAction(e.expenseStatus, e.totalAmount, done, tiers);

    if (next.done || !next.step || !next.roles?.includes(financeRole)) continue;

    // Anything they cannot act on is not in their inbox — showing it would
    // just produce a 403 on click.
    const isOwn = String(e.requestedBy) === String(userId) ||
                  String(e.submittedBy) === String(userId);
    if (isOwn) continue;

    const already = await FmsExpenseApproval.findOne({
      school, expenseRequest: e._id, actor: userId,
      action: { $in: ['verify', 'approve'] },
    }).lean();
    if (already) continue;

    mine.push({
      ...e,
      awaitingStep: next.step,
      isFinalApproval: next.isFinal,
      tier: matrix.tierFor(e.totalAmount, tiers).tier,
      remaining: next.remaining,
    });
  }

  return { total: mine.length, items: mine.slice(skip, skip + limit) };
}

/** Full history for one expense, oldest first. */
async function history(school, expenseId) {
  const expense = await FmsExpenseRequest.findOne({ _id: expenseId, school }).lean();
  if (!expense) throw errors.notFound('Expense request');

  const approvals = await FmsExpenseApproval
    .find({ school, expenseRequest: expenseId })
    .sort({ actedAt: 1 }).lean();

  return {
    expenseNumber: expense.expenseNumber,
    totalAmount: expense.totalAmount,
    currentStatus: expense.expenseStatus,
    position: await position(school, expense),
    approvals,
    workflow: expense.workflow,
  };
}

/** Save a matrix (SCR-20). Rejected outright if it has gaps or overlaps. */
async function saveMatrix(school, { financialYear, tiers, notes }, req) {
  const problems = matrix.validateTiers(tiers);
  if (problems.length) {
    throw errors.validation('The approval matrix is not valid', { tiers: problems });
  }

  const existing = await FmsApprovalMatrix.findOne({
    school, financialYear: financialYear || null, isActive: true,
  });

  if (existing) {
    // Supersede rather than edit, so the routing that applied to past
    // approvals stays reconstructable.
    existing.isActive = false;
    existing.updatedBy = req?.user?._id;
    await existing.save();
  }

  const doc = await FmsApprovalMatrix.create({
    school,
    financialYear: financialYear || null,
    tiers,
    notes,
    isActive: true,
    version: (existing?.version || 0) + 1,
    createdBy: req?.user?._id,
  });

  await FmsAuditTrail.create({
    school, entity: 'fms_approvalmatrix', entityId: doc._id,
    action: 'update', before: existing?.toObject(), after: doc.toObject(),
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip,
  });

  return doc;
}

module.exports = {
  act, reject, returnForCorrection, inbox, history, position,
  tiersFor, completedSteps, saveMatrix,
};