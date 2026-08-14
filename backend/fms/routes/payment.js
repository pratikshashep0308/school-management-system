// backend/fms/routes/payment.js
//
// Payment processing — BPMN WF3, screens SCR-52 (voucher) / SCR-53 (queue),
// SCR-40 (cheque print).
//
// RBAC: `payments` gives 'edit' to accountsManager, accountant and cashier —
// any of whom may execute a payment. Failing one requires 'admin', because
// reversing a posted payment is a correction to the books.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const { FmsPaymentVoucher, PAYMENT_STATUS, PAYMENT_MODE } = require('../models/payment');
const svc = require('../services/payment/paymentService');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

const SORTABLE = ['paymentDate', 'amount', 'paymentNumber', 'createdAt'];

/** GET /api/fms/payments/queue — approved and awaiting payment (SCR-53). */
router.get('/queue', fmsAuthorize('payments', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, {
    allowedSort: ['dueDate'], defaultSort: 'dueDate',
  });

  if (req.query.paymentMode && !PAYMENT_MODE.includes(req.query.paymentMode)) {
    throw errors.badRequest(`Unknown paymentMode '${req.query.paymentMode}'`, { allowed: PAYMENT_MODE });
  }

  const result = await svc.queue(req.fmsScope.school, {
    skip, limit, paymentMode: req.query.paymentMode,
  });

  return res.status(200).json({
    success: true,
    count: result.items.length,
    pagination: {
      page, limit, total: result.total,
      pages: Math.ceil(result.total / limit),
      hasNext: page * limit < result.total,
      hasPrev: page > 1,
    },
    summary: { pendingCount: result.total, pendingAmount: result.totalAmount },
    data: result.items,
  });
}));

/** GET /api/fms/payments — payments made. */
router.get('/', fmsAuthorize('payments', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: SORTABLE, defaultSort: '-paymentDate',
  });

  const filter = { school: req.fmsScope.school };

  if (req.query.paymentStatus) {
    if (!PAYMENT_STATUS.includes(req.query.paymentStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.paymentStatus}'`, { allowed: PAYMENT_STATUS });
    }
    filter.paymentStatus = req.query.paymentStatus;
  }
  if (req.query.paymentMode) {
    if (!PAYMENT_MODE.includes(req.query.paymentMode)) {
      throw errors.badRequest(`Unknown paymentMode '${req.query.paymentMode}'`, { allowed: PAYMENT_MODE });
    }
    filter.paymentMode = req.query.paymentMode;
  }
  if (req.query.from || req.query.to) {
    filter.paymentDate = {};
    if (req.query.from) {
      const d = new Date(req.query.from);
      if (Number.isNaN(d.getTime())) throw errors.badRequest("Invalid 'from' date");
      filter.paymentDate.$gte = d;
    }
    if (req.query.to) {
      const d = new Date(req.query.to);
      if (Number.isNaN(d.getTime())) throw errors.badRequest("Invalid 'to' date");
      d.setUTCHours(23, 59, 59, 999);
      filter.paymentDate.$lte = d;
    }
  }

  const [items, total, agg] = await Promise.all([
    FmsPaymentVoucher.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsPaymentVoucher.countDocuments(filter),
    // Failed payments are excluded — money that bounced did not leave.
    FmsPaymentVoucher.aggregate([
      { $match: { ...filter, paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' }, n: { $sum: 1 } } },
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
      paidCount: agg[0]?.n || 0,
      paidAmount: agg[0]?.total || 0,
      note: 'Totals exclude failed payments',
    },
    data: items,
  });
}));

/** GET /api/fms/payments/:id */
router.get('/:id', fmsAuthorize('payments', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsPaymentVoucher
    .findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!doc) throw errors.notFound('Payment voucher');
  return ok(res, doc);
}));

/**
 * GET /api/fms/payments/:id/cheque — printable cheque overlay (SCR-40).
 * `?guide=false` hides the alignment border for production printing.
 */
router.get('/:id/cheque', fmsAuthorize('payments', 'PRINT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');

  const doc = await FmsPaymentVoucher
    .findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!doc) throw errors.notFound('Payment voucher');

  if (!['cheque', 'dd'].includes(doc.paymentMode)) {
    throw errors.conflict(
      `A ${doc.paymentMode} payment has no cheque to print`,
      { paymentMode: doc.paymentMode }
    );
  }

  FmsPaymentVoucher.updateOne(
    { _id: doc._id },
    { $inc: { printCount: 1 }, $set: { lastPrintedAt: new Date() } }
  ).catch(() => {});

  res.type('html').send(svc.renderCheque(doc, { showGuide: req.query.guide !== 'false' }));
}));

/**
 * POST /api/fms/payments/:expenseId/pay
 * Creates the voucher, posts the ledger and advances the expense in one call —
 * the money leaves in a single act.
 */
router.post('/:expenseId/pay', fmsAuthorize('payments', 'CREATE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.expenseId)) throw errors.badRequest('Invalid expense id');
  validate(req.body, {
    paymentMode: { required: true, rules: [check.enumOf(PAYMENT_MODE)] },
    creditAccount: { rules: [check.objectId] },
    instrumentNumber: { rules: [check.string] },
    instrumentDate: { rules: [check.date] },
    bankReference: { rules: [check.string] },
    bankName: { rules: [check.string] },
    paymentDate: { rules: [check.date] },
    payeeName: { rules: [check.nonEmpty] },
    payeeType: { rules: [check.enumOf(['vendor', 'staff', 'other'])] },
    narration: { rules: [check.string] },
  });

  const result = await svc.pay(req.fmsScope.school, req.params.expenseId, req.body, req);

  return created(res, {
    payment: result.payment,
    expense: { _id: result.expense._id, expenseNumber: result.expense.expenseNumber,
      expenseStatus: result.expense.expenseStatus },
    voucher: { _id: result.voucher._id, voucherNumber: result.voucher.voucherNumber },
    chequeUrl: ['cheque', 'dd'].includes(result.payment.paymentMode)
      ? `/api/fms/payments/${result.payment._id}/cheque` : null,
  }, `Paid — ${result.payment.paymentNumber}`);
}));

/** POST /api/fms/payments/:id/fail — bounced cheque or rejected transfer. */
router.post('/:id/fail', fmsAuthorize('payments', 'CANCEL'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });

  const result = await svc.fail(req.fmsScope.school, req.params.id, req, req.body.reason);
  return ok(res, {
    payment: result.payment,
    reversalVoucher: result.reversal
      ? { _id: result.reversal._id, voucherNumber: result.reversal.voucherNumber } : null,
    expenseStatus: result.expense?.expenseStatus,
  }, { message: 'Payment marked failed and reversed; the expense may be paid again' });
}));

/** POST /api/fms/payments/expense/:expenseId/close — terminal. */
router.post('/expense/:expenseId/close', fmsAuthorize('payments', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.expenseId)) throw errors.badRequest('Invalid expense id');
  const expense = await svc.close(req.fmsScope.school, req.params.expenseId, req);
  return ok(res, expense, { message: 'Expense closed' });
}));

module.exports = router;