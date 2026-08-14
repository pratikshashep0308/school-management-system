// backend/fms/routes/approval.js
//
// Expense approval workflow — SRS M5 / FR-M5, BPMN WF1,
// screens SCR-18 (inbox), SCR-19 (action), SCR-20 (matrix), SCR-21 (history).

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const { FmsApprovalMatrix, FmsExpenseApproval, APPROVAL_STEP } = require('../models/approval');
const svc = require('../services/approval/approvalService');
const pure = require('../services/approval/approvalMatrix');
const {
  ok, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

/** GET /api/fms/approvals/inbox — what is waiting on ME (SCR-18). */
/**
 * GET /api/fms/approvals/pending-count
 *
 * How many requests are waiting for THIS person. Drives the badge in the
 * sidebar, which is polled — so it returns a number and nothing else rather
 * than making the caller fetch and count a page of expense documents.
 *
 * Uses the same inbox resolution, so the badge can never disagree with the
 * list it points at. A count computed a second way would eventually drift, and
 * a badge showing three when the screen shows none is worse than no badge.
 */
router.get('/pending-count', fmsAuthorize('approvals', 'VIEW'), asyncHandler(async (req, res) => {
  const result = await svc.inbox(req.fmsScope.school, req.fmsRole, req.user._id, {
    skip: 0, limit: 1,
  });
  return res.status(200).json({ success: true, data: { pending: result.total } });
}));

router.get('/inbox', fmsAuthorize('approvals', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, {
    allowedSort: ['requestDate'], defaultSort: 'requestDate',
  });

  const result = await svc.inbox(req.fmsScope.school, req.fmsRole, req.user._id, { skip, limit });

  return res.status(200).json({
    success: true,
    count: result.items.length,
    pagination: {
      page, limit, total: result.total,
      pages: Math.ceil(result.total / limit),
      hasNext: page * limit < result.total,
      hasPrev: page > 1,
    },
    role: req.fmsRole,
    data: result.items,
  });
}));

/** GET /api/fms/approvals/history/:expenseId — the full trail (SCR-21). */
router.get('/history/:expenseId', fmsAuthorize('approvals', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.expenseId)) throw errors.badRequest('Invalid expense id');
  return ok(res, await svc.history(req.fmsScope.school, req.params.expenseId));
}));

/** GET /api/fms/approvals/position/:expenseId — tier, chain, who is next. */
router.get('/position/:expenseId', fmsAuthorize('approvals', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.expenseId)) throw errors.badRequest('Invalid expense id');
  const { FmsExpenseRequest } = require('../models/expense');
  const expense = await FmsExpenseRequest
    .findOne({ _id: req.params.expenseId, school: req.fmsScope.school }).lean();
  if (!expense) throw errors.notFound('Expense request');
  return ok(res, await svc.position(req.fmsScope.school, expense));
}));

/**
 * POST /api/fms/approvals/:expenseId/verify — the accounts step.
 * Separate from /approve because verification is a different act: checking the
 * paperwork, not authorising the spend.
 */
router.post('/:expenseId/verify', fmsAuthorize('approvals', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.expenseId)) throw errors.badRequest('Invalid expense id');
  validate(req.body || {}, { comment: { rules: [check.string] } });

  const result = await svc.act(req.fmsScope.school, req.params.expenseId, {
    action: 'verify', step: 'accounts', comment: req.body?.comment,
  }, req);

  return ok(res, {
    expense: result.expense,
    position: result.position,
  }, { message: 'Verified by accounts' });
}));

/**
 * POST /api/fms/approvals/:expenseId/approve
 * `step` may be supplied; otherwise the next required step is used, which is
 * what a UI would want.
 */
router.post('/:expenseId/approve', fmsAuthorize('approvals', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.expenseId)) throw errors.badRequest('Invalid expense id');
  validate(req.body || {}, {
    step: { rules: [check.enumOf(APPROVAL_STEP)] },
    comment: { rules: [check.string] },
  });

  let step = req.body?.step;
  if (!step) {
    const { FmsExpenseRequest } = require('../models/expense');
    const expense = await FmsExpenseRequest
      .findOne({ _id: req.params.expenseId, school: req.fmsScope.school }).lean();
    if (!expense) throw errors.notFound('Expense request');
    const pos = await svc.position(req.fmsScope.school, expense);
    if (pos.next.done || !pos.next.step) {
      throw errors.conflict('There is no approval step outstanding', { position: pos });
    }
    step = pos.next.step;
  }

  const result = await svc.act(req.fmsScope.school, req.params.expenseId, {
    action: 'approve', step, comment: req.body?.comment,
  }, req);

  return ok(res, {
    expense: result.expense,
    position: result.position,
  }, {
    message: result.position.next.done || result.expense.expenseStatus === 'paymentPending'
      ? 'Fully approved — ready for payment'
      : `Approved at '${step}'; next is '${result.position.next.step}'`,
  });
}));

/** POST /api/fms/approvals/:expenseId/reject — terminal; a reason is mandatory. */
router.post('/:expenseId/reject', fmsAuthorize('approvals', 'REJECT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.expenseId)) throw errors.badRequest('Invalid expense id');
  validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });

  const result = await svc.reject(req.fmsScope.school, req.params.expenseId, req, req.body.reason);
  return ok(res, { expense: result.expense }, { message: 'Expense rejected' });
}));

/** POST /api/fms/approvals/:expenseId/return — back to the author for correction. */
router.post('/:expenseId/return', fmsAuthorize('approvals', 'REJECT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.expenseId)) throw errors.badRequest('Invalid expense id');
  validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });

  const result = await svc.returnForCorrection(
    req.fmsScope.school, req.params.expenseId, req, req.body.reason
  );
  return ok(res, { expense: result.expense }, { message: 'Returned for correction' });
}));

// ─── Approval matrix (SCR-20) ────────────────────────────────────────────────

/** GET /api/fms/approvals/matrix — the thresholds in force. */
router.get('/matrix', fmsAuthorize('approvals', 'VIEW'), asyncHandler(async (req, res) => {
  const tiers = await svc.tiersFor(req.fmsScope.school, req.query.financialYear || null);
  const stored = await FmsApprovalMatrix
    .findOne({ school: req.fmsScope.school, isActive: true }).lean();

  return ok(res, {
    tiers,
    source: stored ? 'configured' : 'default',
    version: stored?.version || null,
    financialYear: stored?.financialYear || null,
  });
}));

/**
 * PUT /api/fms/approvals/matrix — replace the thresholds.
 * Requires 'admin'. A matrix with a gap or an overlap is rejected outright.
 */
router.put('/matrix', fmsAuthorize('approvals', 'EDIT'), asyncHandler(async (req, res) => {
  validate(req.body, {
    tiers: { required: true, rules: [check.array] },
    financialYear: { rules: [check.objectId] },
    notes: { rules: [check.string] },
  });

  const doc = await svc.saveMatrix(req.fmsScope.school, req.body, req);
  return ok(res, doc, { message: `Approval matrix saved (version ${doc.version})` });
}));

/**
 * POST /api/fms/approvals/matrix/preview — where would this amount route?
 * Lets someone sanity-check a matrix before saving it.
 */
router.post('/matrix/preview', fmsAuthorize('approvals', 'VIEW'), asyncHandler(async (req, res) => {
  validate(req.body, {
    amount: { required: true, rules: [check.paise] },
    tiers: { rules: [check.array] },
  });

  const tiers = req.body.tiers || await svc.tiersFor(req.fmsScope.school, null);
  const problems = pure.validateTiers(tiers);
  if (problems.length) {
    throw errors.validation('The approval matrix is not valid', { tiers: problems });
  }

  return ok(res, {
    amount: req.body.amount,
    tier: pure.tierFor(req.body.amount, tiers),
    chain: pure.chainFor(req.body.amount, tiers),
  });
}));

/** GET /api/fms/approvals/log — every approval action, filterable. */
router.get('/log', fmsAuthorize('approvals', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['actedAt', 'amountAtAction'], defaultSort: '-actedAt',
  });

  const filter = { school: req.fmsScope.school };
  if (req.query.step) {
    if (!APPROVAL_STEP.includes(req.query.step)) {
      throw errors.badRequest(`Unknown step '${req.query.step}'`, { allowed: APPROVAL_STEP });
    }
    filter.step = req.query.step;
  }
  if (req.query.action) filter.action = req.query.action;
  if (req.query.actor) {
    if (check.objectId(req.query.actor)) throw errors.badRequest('Invalid actor id');
    filter.actor = req.query.actor;
  }

  const [items, total] = await Promise.all([
    FmsExpenseApproval.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsExpenseApproval.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
}));

module.exports = router;