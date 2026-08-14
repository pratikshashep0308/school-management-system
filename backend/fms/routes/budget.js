// backend/fms/routes/budget.js
//
// Budget Management — SRS M6 / FR-M6, screens SCR-22 (list), SCR-23 (entry),
// SCR-24 (revision), SCR-25 (budget vs actual).
//
// RBAC per the matrix: `budgets` gives 'admin' to principal, 'edit' to
// accountsManager, and 'read' to everyone else who has any FMS role.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const { FmsBudget, BUDGET_STATUS, OVER_BUDGET_POLICY } = require('../models/budget');
const svc = require('../services/budget/budgetService');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

const SORTABLE = ['accountCode', 'budgetAmount', 'createdAt', 'budgetStatus'];

/** GET /api/fms/budgets — list, each with its derived position. */
router.get('/', fmsAuthorize('budgets', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: SORTABLE, defaultSort: 'accountCode',
  });

  const filter = { school: req.fmsScope.school };

  if (req.query.budgetStatus) {
    if (!BUDGET_STATUS.includes(req.query.budgetStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.budgetStatus}'`, { allowed: BUDGET_STATUS });
    }
    filter.budgetStatus = req.query.budgetStatus;
  }
  if (req.query.financialYear) {
    if (check.objectId(req.query.financialYear)) throw errors.badRequest('Invalid financialYear id');
    filter.financialYear = req.query.financialYear;
  }
  if (req.query.account) {
    if (check.objectId(req.query.account)) throw errors.badRequest('Invalid account id');
    filter.account = req.query.account;
  }
  if (req.query.department) filter['department.name'] = req.query.department;

  const [docs, total] = await Promise.all([
    FmsBudget.find(filter).sort(sort).skip(skip).limit(limit),
    FmsBudget.countDocuments(filter),
  ]);

  // Positions are derived, so the list carries live figures rather than a
  // snapshot that could already be stale.
  const items = [];
  for (const b of docs) {
    items.push({ ...b.toObject(), position: await svc.position(b) });
  }

  return paginated(res, items, { page, limit, total });
}));

/** GET /api/fms/budgets/vs-actual — the monitor (SCR-25). */
router.get('/vs-actual', fmsAuthorize('budgets', 'VIEW'), asyncHandler(async (req, res) => {
  if (!req.query.financialYear) {
    throw errors.badRequest("'financialYear' is required");
  }
  if (check.objectId(req.query.financialYear)) throw errors.badRequest('Invalid financialYear id');

  return ok(res, await svc.budgetVsActual(req.fmsScope.school, req.query.financialYear, {
    departmentName: req.query.department,
  }));
}));

/** GET /api/fms/budgets/:id */
router.get('/:id', fmsAuthorize('budgets', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsBudget.findOne({ _id: req.params.id, school: req.fmsScope.school });
  if (!doc) throw errors.notFound('Budget');
  return ok(res, { ...doc.toObject(), position: await svc.position(doc) });
}));

/**
 * GET /api/fms/budgets/check
 * Preview availability without creating anything — useful before raising a
 * request that might be refused.
 */
router.get('/check/availability', fmsAuthorize('budgets', 'VIEW'), asyncHandler(async (req, res) => {
  validate(req.query, {
    account: { required: true, rules: [check.objectId] },
    financialYear: { required: true, rules: [check.objectId] },
  });

  const amount = parseInt(req.query.amount, 10);
  if (!Number.isInteger(amount) || amount < 0) {
    throw errors.badRequest("'amount' must be a non-negative integer in paise");
  }

  return ok(res, await svc.checkAvailability(
    req.fmsScope.school, req.query.account, req.query.financialYear, amount, req.query.department
  ));
}));

/** POST /api/fms/budgets — create a draft. */
router.post('/', fmsAuthorize('budgets', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    financialYear: { required: true, rules: [check.objectId] },
    account: { required: true, rules: [check.objectId] },
    budgetAmount: { required: true, rules: [check.paise] },
    overBudgetPolicy: { rules: [check.enumOf(OVER_BUDGET_POLICY)] },
    notes: { rules: [check.string] },
  });

  if (req.body.warnThreshold !== undefined) {
    const t = Number(req.body.warnThreshold);
    if (!(t >= 0 && t <= 1)) {
      throw errors.validation('Validation failed', {
        warnThreshold: 'must be a fraction between 0 and 1 (0.9 = warn at 90%)',
      });
    }
  }

  const doc = await svc.create(req.fmsScope.school, req.body, req);
  return created(res, doc, `Budget for ${doc.accountCode} created as draft`);
}));

/** PATCH /api/fms/budgets/:id — drafts only. */
router.patch('/:id', fmsAuthorize('budgets', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    budgetAmount: { rules: [check.paise] },
    overBudgetPolicy: { rules: [check.enumOf(OVER_BUDGET_POLICY)] },
    notes: { rules: [check.string] },
  });

  const doc = await svc.update(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, doc, { message: 'Budget updated' });
}));

/** POST /api/fms/budgets/:id/activate — draft → active. */
router.post('/:id/activate', fmsAuthorize('budgets', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await svc.activate(req.fmsScope.school, req.params.id, req);
  return ok(res, doc, { message: 'Budget activated — it will now be consulted by expense submission' });
}));

/**
 * POST /api/fms/budgets/:id/revise — change a live budget (SCR-24).
 * The original allocation is preserved; the revision sits beside it.
 */
router.post('/:id/revise', fmsAuthorize('budgets', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    newAmount: { required: true, rules: [check.paise] },
    reason: { required: true, rules: [check.nonEmpty] },
  });

  const result = await svc.revise(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, {
    budget: result.budget,
    warning: result.warning,
  }, {
    message: result.warning
      ? `Budget revised — ${result.warning}`
      : 'Budget revised',
  });
}));

/** POST /api/fms/budgets/:id/close — terminal. Never a delete. */
router.post('/:id/close', fmsAuthorize('budgets', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await svc.close(req.fmsScope.school, req.params.id, req);
  return ok(res, doc, { message: 'Budget closed' });
}));

module.exports = router;