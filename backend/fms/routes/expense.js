// backend/fms/routes/expense.js
//
// Expense Management — SRS M4 / FR-M4, screens SCR-14/15/16/17.
//
// RBAC per the matrix: `expenses` gives 'edit' to accountsManager, accountant,
// purchaseOfficer, deptHead AND teacher — which matches the brief
// (DEPT_HEAD/ACCOUNTANT create). principal and vicePrincipal hold 'admin',
// which P3.3 uses for approvals.
//
// No route here posts to the ledger. An expense request is a request.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const {
  FmsExpenseRequest, EXPENSE_STATUS, PRIORITY, PAYMENT_MODE, GST_TYPE, ATTACHMENT_KIND,
} = require('../models/expense');
const svc = require('../services/expense/expenseService');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

const SORTABLE = ['requestDate', 'totalAmount', 'expenseNumber', 'dueDate', 'priority', 'createdAt'];
const LIST_FIELDS =
  '_id expenseNumber requestDate department vendor category purpose ' +
  'budgetHeadCode budgetHeadName baseAmount gstAmount totalAmount paymentMode ' +
  'priority dueDate expenseStatus budgetCheck requestedBy requestedByName ' +
  // `workflow` carries who acted at each stage. Included so the list can show
  // an "Approved by" column without a second request per row — the array is a
  // handful of small subdocuments, and the alternative is N+1 lookups to answer
  // a question every row asks.
  'workflow ' +
  'submittedAt createdAt';

/** GET /api/fms/expenses — list with a period total. */
router.get('/', fmsAuthorize('expenses', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: SORTABLE, defaultSort: '-requestDate',
  });

  const filter = { school: req.fmsScope.school };

  if (req.query.expenseStatus) {
    if (!EXPENSE_STATUS.includes(req.query.expenseStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.expenseStatus}'`, { allowed: EXPENSE_STATUS });
    }
    filter.expenseStatus = req.query.expenseStatus;
  }
  if (req.query.priority) {
    if (!PRIORITY.includes(req.query.priority)) {
      throw errors.badRequest(`Unknown priority '${req.query.priority}'`, { allowed: PRIORITY });
    }
    filter.priority = req.query.priority;
  }
  if (req.query.department) filter['department.name'] = req.query.department;
  if (req.query.budgetHead) {
    if (check.objectId(req.query.budgetHead)) throw errors.badRequest('Invalid budgetHead id');
    filter.budgetHead = req.query.budgetHead;
  }
  if (req.query.mine === 'true') filter.requestedBy = req.user._id;
  // The queue an approver wants: everything past draft and not yet finished.
  if (req.query.pending === 'true') {
    filter.expenseStatus = { $nin: ['draft', 'closed', 'rejected', 'cancelled', 'paymentCompleted'] };
  }
  if (req.query.overBudget === 'true') filter['budgetCheck.outcome'] = 'exceeded';

  if (req.query.from || req.query.to) {
    filter.requestDate = {};
    if (req.query.from) {
      const d = new Date(req.query.from);
      if (Number.isNaN(d.getTime())) throw errors.badRequest("Invalid 'from' date");
      filter.requestDate.$gte = d;
    }
    if (req.query.to) {
      const d = new Date(req.query.to);
      if (Number.isNaN(d.getTime())) throw errors.badRequest("Invalid 'to' date");
      d.setUTCHours(23, 59, 59, 999);
      filter.requestDate.$lte = d;
    }
  }
  if (req.query.q) {
    const safe = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { expenseNumber: new RegExp(safe, 'i') },
      { purpose: new RegExp(safe, 'i') },
      { 'vendor.name': new RegExp(safe, 'i') },
    ];
  }

  const [items, total, agg] = await Promise.all([
    FmsExpenseRequest.find(filter).select(LIST_FIELDS).sort(sort).skip(skip).limit(limit).lean(),
    FmsExpenseRequest.countDocuments(filter),
    FmsExpenseRequest.aggregate([
      { $match: { ...filter, expenseStatus: { $nin: ['rejected', 'cancelled'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, n: { $sum: 1 } } },
    ]),
  ]);

  return res.status(200).json({
    success: true,
    count: items.length,
    pagination: {
      page, limit, total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
    summary: {
      liveCount: agg[0]?.n || 0,
      liveAmount: agg[0]?.total || 0,
      note: 'Totals exclude rejected and cancelled requests',
    },
    data: items,
  });
}));

/** GET /api/fms/expenses/:id */
router.get('/:id', fmsAuthorize('expenses', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsExpenseRequest
    .findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!doc) throw errors.notFound('Expense request');
  return ok(res, doc);
}));

/**
 * GET /api/fms/expenses/:id/budget-check — preview without submitting.
 * Lets a requester see the position before committing to it.
 */
router.get('/:id/budget-check', fmsAuthorize('expenses', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsExpenseRequest
    .findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!doc) throw errors.notFound('Expense request');

  return ok(res, await svc.checkBudget(
    req.fmsScope.school, doc.budgetHead, doc.financialYear, doc.totalAmount
  ));
}));

const moneyRules = {
  baseAmount: { required: true, rules: [check.paise] },
  totalAmount: { required: true, rules: [check.paise] },
  cgst: { rules: [check.paise] },
  sgst: { rules: [check.paise] },
  igst: { rules: [check.paise] },
  otherTaxAmount: { rules: [check.paise] },
  gstType: { rules: [check.enumOf(GST_TYPE)] },
};

/** POST /api/fms/expenses — create a draft. */
router.post('/', fmsAuthorize('expenses', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    requestDate: { required: true, rules: [check.date] },
    category: { required: true, rules: [check.nonEmpty] },
    purpose: { required: true, rules: [check.nonEmpty] },
    budgetHead: { required: true, rules: [check.objectId] },
    paymentMode: { required: true, rules: [check.enumOf(PAYMENT_MODE)] },
    priority: { rules: [check.enumOf(PRIORITY)] },
    dueDate: { rules: [check.date] },
    subCategory: { rules: [check.string] },
    remarks: { rules: [check.string] },
    attachments: { rules: [check.array] },
    ...moneyRules,
  });

  if (!req.body.department?.name && !req.body.departmentName) {
    throw errors.validation('Validation failed', { 'department.name': 'is required' });
  }

  const doc = await svc.create(req.fmsScope.school, req.body, req);
  return created(res, doc, `Expense request ${doc.expenseNumber} created as draft`);
}));

/** PATCH /api/fms/expenses/:id — draft, returned or rejected only. */
router.patch('/:id', fmsAuthorize('expenses', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    category: { rules: [check.nonEmpty] },
    purpose: { rules: [check.nonEmpty] },
    budgetHead: { rules: [check.objectId] },
    paymentMode: { rules: [check.enumOf(PAYMENT_MODE)] },
    priority: { rules: [check.enumOf(PRIORITY)] },
    dueDate: { rules: [check.date] },
    attachments: { rules: [check.array] },
    baseAmount: { rules: [check.paise] },
    totalAmount: { rules: [check.paise] },
    cgst: { rules: [check.paise] },
    sgst: { rules: [check.paise] },
    igst: { rules: [check.paise] },
    otherTaxAmount: { rules: [check.paise] },
    gstType: { rules: [check.enumOf(GST_TYPE)] },
  });

  const doc = await svc.update(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, doc, { message: 'Expense request updated' });
}));

/**
 * POST /api/fms/expenses/:id/submit
 * Runs the budget check and records it. An over-budget request is refused
 * unless `acknowledgeOverBudget` is true.
 */
router.post('/:id/submit', fmsAuthorize('expenses', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body || {}, {
    comment: { rules: [check.string] },
    acknowledgeOverBudget: { rules: [check.boolean] },
  });

  const doc = await svc.submit(req.fmsScope.school, req.params.id, req, req.body || {});
  return ok(res, doc, {
    message: doc.budgetCheck?.outcome === 'exceeded'
      ? 'Submitted OVER BUDGET — flagged for every approver'
      : 'Submitted for approval',
  });
}));

/** POST /api/fms/expenses/:id/cancel — never a delete. */
router.post('/:id/cancel', fmsAuthorize('expenses', 'CANCEL'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });
  const doc = await svc.cancel(req.fmsScope.school, req.params.id, req, req.body.reason);
  return ok(res, doc, { message: 'Expense request cancelled' });
}));

module.exports = router;