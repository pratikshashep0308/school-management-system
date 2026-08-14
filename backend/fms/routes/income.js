// backend/fms/routes/income.js
//
// Income Management — SRS M3 / FR-M3, screens SCR-11 (list), SCR-12 (entry),
// SCR-13 (receipt).
//
// RBAC per the matrix: cashier and accountant both hold 'edit' on `income`, so
// either can record a receipt — which matches the brief (CASHIER/ACCOUNTANT).
// Cancelling requires 'admin', because reversing a posted receipt is a
// correction to the books, not data entry.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const { FmsIncomeVoucher, INCOME_CATEGORY, PAYMENT_MODE, INCOME_STATUS } = require('../models/income');
const { FmsSettings } = require('../models/core');
const svc = require('../services/income/incomeService');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

const SORTABLE = ['receiptDate', 'amount', 'receiptNumber', 'createdAt'];
const LIST_FIELDS =
  '_id receiptNumber receiptDate category amount paymentMode payerName payerType ' +
  'admissionNumber className creditAccountCode creditAccountName incomeStatus ' +
  'voucher smsStudentId createdAt';

/** GET /api/fms/income — list receipts with a period total. */
router.get('/', fmsAuthorize('income', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: SORTABLE, defaultSort: '-receiptDate',
  });

  const filter = { school: req.fmsScope.school };

  if (req.query.category) {
    if (!INCOME_CATEGORY.includes(req.query.category)) {
      throw errors.badRequest(`Unknown category '${req.query.category}'`, { allowed: INCOME_CATEGORY });
    }
    filter.category = req.query.category;
  }
  if (req.query.incomeStatus) {
    if (!INCOME_STATUS.includes(req.query.incomeStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.incomeStatus}'`, { allowed: INCOME_STATUS });
    }
    filter.incomeStatus = req.query.incomeStatus;
  }
  if (req.query.paymentMode) {
    if (!PAYMENT_MODE.includes(req.query.paymentMode)) {
      throw errors.badRequest(`Unknown paymentMode '${req.query.paymentMode}'`, { allowed: PAYMENT_MODE });
    }
    filter.paymentMode = req.query.paymentMode;
  }
  if (req.query.student) {
    if (check.objectId(req.query.student)) throw errors.badRequest('Invalid student id');
    filter.smsStudentId = req.query.student;
  }
  if (req.query.q) {
    const safe = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { receiptNumber: new RegExp(safe, 'i') },
      { payerName: new RegExp(safe, 'i') },
      { admissionNumber: new RegExp(safe, 'i') },
    ];
  }
  if (req.query.from || req.query.to) {
    filter.receiptDate = {};
    if (req.query.from) {
      const d = new Date(req.query.from);
      if (Number.isNaN(d.getTime())) throw errors.badRequest("Invalid 'from' date");
      filter.receiptDate.$gte = d;
    }
    if (req.query.to) {
      const d = new Date(req.query.to);
      if (Number.isNaN(d.getTime())) throw errors.badRequest("Invalid 'to' date");
      d.setUTCHours(23, 59, 59, 999);
      filter.receiptDate.$lte = d;
    }
  }

  const [items, total, agg] = await Promise.all([
    FmsIncomeVoucher.find(filter).select(LIST_FIELDS).sort(sort).skip(skip).limit(limit).lean(),
    FmsIncomeVoucher.countDocuments(filter),
    // Cancelled receipts are excluded from the total. Including them would
    // overstate collections, which is the number people actually read.
    FmsIncomeVoucher.aggregate([
      { $match: { ...filter, incomeStatus: 'posted' } },
      { $group: { _id: null, amount: { $sum: '$amount' }, n: { $sum: 1 } } },
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
      postedCount: agg[0]?.n || 0,
      postedAmount: agg[0]?.amount || 0,
      note: 'Totals exclude cancelled receipts',
    },
    data: items,
  });
}));

/** GET /api/fms/income/:id */
router.get('/:id', fmsAuthorize('income', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsIncomeVoucher
    .findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!doc) throw errors.notFound('Income voucher');
  return ok(res, doc);
}));

/**
 * GET /api/fms/income/:id/receipt — printable HTML (SCR-13).
 * `?format=json` returns the data instead, for a custom renderer.
 */
router.get('/:id/receipt', fmsAuthorize('income', 'PRINT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');

  const doc = await FmsIncomeVoucher
    .findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!doc) throw errors.notFound('Income voucher');

  if (req.query.format === 'json') return ok(res, doc);

  // School details come from fms_settings if present; the SMS `schools`
  // collection is not read here, since the FMS reads SMS data over REST only.
  const branding = await FmsSettings
    .findOne({ school: req.fmsScope.school, key: 'receipt.branding' }).lean();

  // Fire-and-forget: a print counter must never fail the print itself.
  FmsIncomeVoucher.updateOne(
    { _id: doc._id },
    { $inc: { printCount: 1 }, $set: { lastPrintedAt: new Date() } }
  ).catch(() => {});

  res.type('html').send(svc.renderReceipt(doc, branding?.value));
}));

/**
 * POST /api/fms/income — record money received.
 * Posts to the ledger immediately: the money is already in hand.
 */
router.post('/', fmsAuthorize('income', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    receiptDate: { required: true, rules: [check.date] },
    category: { required: true, rules: [check.enumOf(INCOME_CATEGORY)] },
    amount: { required: true, rules: [check.paise] },
    paymentMode: { required: true, rules: [check.enumOf(PAYMENT_MODE)] },
    creditAccount: { required: true, rules: [check.objectId] },
    payerName: { required: true, rules: [check.nonEmpty] },
    debitAccount: { rules: [check.objectId] },
    payerType: { rules: [check.enumOf(['student', 'organisation', 'individual', 'other'])] },
    smsStudentId: { rules: [check.objectId] },
    instrumentNumber: { rules: [check.string] },
    instrumentDate: { rules: [check.date] },
    bankName: { rules: [check.string] },
    narration: { rules: [check.string] },
    reference: { rules: [check.string] },
    admissionNumber: { rules: [check.string] },
    className: { rules: [check.string] },
  });

  const result = await svc.record(req.fmsScope.school, req.body, req);
  return created(res, {
    income: result.income,
    voucher: { _id: result.voucher._id, voucherNumber: result.voucher.voucherNumber },
    receiptUrl: `/api/fms/income/${result.income._id}/receipt`,
  }, `Receipt ${result.income.receiptNumber} issued`);
}));

/**
 * POST /api/fms/income/:id/cancel — reverses the posting.
 * There is no DELETE route: a receipt is a document that was handed to someone.
 */
router.post('/:id/cancel', fmsAuthorize('income', 'CANCEL'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });

  const result = await svc.cancel(req.fmsScope.school, req.params.id, req, req.body.reason);
  return ok(res, {
    income: result.income,
    reversalVoucher: { _id: result.reversal._id, voucherNumber: result.reversal.voucherNumber },
  }, { message: `Receipt cancelled; reversed by ${result.reversal.voucherNumber}` });
}));

module.exports = router;