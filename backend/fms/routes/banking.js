// backend/fms/routes/banking.js
//
// Banking & Reconciliation — SRS M9 / FR-M9, BPMN WF7, SCR-36..42.
//
// RBAC per the matrix: `banking` gives 'edit' to accountsManager and
// accountant, 'read' to cashier and above.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const {
  FmsBankAccount, FmsBankTransaction, FmsBankReconciliation,
  ACCOUNT_TYPE, RECON_STATUS,
} = require('../models/banking');
const svc = require('../services/banking/bankingService');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

// ─── Accounts (SCR-36/37) ────────────────────────────────────────────────────

router.get('/accounts', fmsAuthorize('banking', 'VIEW'), asyncHandler(async (req, res) => {
  const docs = await FmsBankAccount.find({ school: req.fmsScope.school }).sort({ accountName: 1 });
  const items = [];
  for (const d of docs) {
    items.push({ ...d.toObject(), balance: await svc.accountBalance(req.fmsScope.school, d._id) });
  }
  return ok(res, items);
}));

router.get('/accounts/:id', fmsAuthorize('banking', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsBankAccount.findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!doc) throw errors.notFound('Bank account');
  return ok(res, { ...doc, balance: await svc.accountBalance(req.fmsScope.school, doc._id) });
}));

router.post('/accounts', fmsAuthorize('banking', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    accountName: { required: true, rules: [check.nonEmpty] },
    accountNumber: { required: true, rules: [check.nonEmpty] },
    ifsc: { required: true, rules: [check.nonEmpty] },
    bankName: { required: true, rules: [check.nonEmpty] },
    ledgerAccount: { required: true, rules: [check.objectId] },
    accountType: { rules: [check.enumOf(ACCOUNT_TYPE)] },
    openingBalance: { rules: [check.integer] },
    overdraftLimit: { rules: [check.paise] },
  });
  const doc = await svc.createAccount(req.fmsScope.school, req.body, req);
  return created(res, doc, `Bank account ${doc.accountName} created`);
}));

// ─── Movements (SCR-38/39) ───────────────────────────────────────────────────

router.post('/movements', fmsAuthorize('banking', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    bankAccount: { required: true, rules: [check.objectId] },
    movementType: { required: true, rules: [check.enumOf(['deposit', 'withdrawal'])] },
    amount: { required: true, rules: [check.paise] },
    counterAccount: { required: true, rules: [check.objectId] },
    valueDate: { rules: [check.date] },
    narration: { rules: [check.string] },
    reference: { rules: [check.string] },
  });
  const r = await svc.recordMovement(req.fmsScope.school, req.body, req);
  return created(res, {
    voucher: { _id: r.voucher._id, voucherNumber: r.voucher.voucherNumber },
  }, `Posted as ${r.voucher.voucherNumber}`);
}));

router.post('/transfers', fmsAuthorize('banking', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    fromBankAccount: { required: true, rules: [check.objectId] },
    toBankAccount: { required: true, rules: [check.objectId] },
    amount: { required: true, rules: [check.paise] },
    valueDate: { rules: [check.date] },
    reference: { rules: [check.string] },
  });
  const r = await svc.transfer(req.fmsScope.school, req.body, req);
  return created(res, {
    voucher: { _id: r.voucher._id, voucherNumber: r.voucher.voucherNumber },
  }, `Transfer posted as ${r.voucher.voucherNumber}`);
}));

// ─── Statement import (SCR-42) ───────────────────────────────────────────────

/**
 * Import a CSV statement. Rows that cannot be read are REPORTED in the
 * response — a silent drop produces a reconciliation that never balances and
 * nothing that says why.
 */
router.post('/accounts/:id/import', fmsAuthorize('banking', 'CREATE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    csv: { required: true, rules: [check.nonEmpty] },
  });
  const r = await svc.importStatement(req.fmsScope.school, req.params.id, req.body, req);
  return created(res, r, r.summary);
}));

router.get('/accounts/:id/transactions', fmsAuthorize('banking', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['valueDate', 'amount'], defaultSort: '-valueDate',
  });

  const filter = { school: req.fmsScope.school, bankAccount: req.params.id };
  if (req.query.reconciliationStatus) {
    if (!RECON_STATUS.includes(req.query.reconciliationStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.reconciliationStatus}'`, { allowed: RECON_STATUS });
    }
    filter.reconciliationStatus = req.query.reconciliationStatus;
  }
  if (req.query.from || req.query.to) {
    filter.valueDate = {};
    if (req.query.from) filter.valueDate.$gte = new Date(req.query.from);
    if (req.query.to) {
      const d = new Date(req.query.to); d.setUTCHours(23, 59, 59, 999);
      filter.valueDate.$lte = d;
    }
  }

  const [items, total] = await Promise.all([
    FmsBankTransaction.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsBankTransaction.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
}));

// ─── Matching and reconciliation (SCR-41) ────────────────────────────────────

router.post('/accounts/:id/auto-match', fmsAuthorize('banking', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    from: { required: true, rules: [check.date] },
    to: { required: true, rules: [check.date] },
    apply: { rules: [check.boolean] },
  });
  const r = await svc.autoMatch(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, r, { message: r.summary });
}));

router.post('/transactions/:id/match', fmsAuthorize('banking', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    ledgerEntry: { required: true, rules: [check.objectId] },
    note: { rules: [check.string] },
  });
  const r = await svc.manualMatch(req.fmsScope.school, req.params.id, req.body.ledgerEntry, req, req.body.note);
  return ok(res, r, {
    message: (r.warnings.directionMismatch || r.warnings.amountMismatch)
      ? 'Matched — but the direction or amount differs; check the note'
      : 'Matched',
  });
}));

router.post('/transactions/:id/unmatch', fmsAuthorize('banking', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await svc.unmatch(req.fmsScope.school, req.params.id, req);
  return ok(res, doc, { message: 'Unmatched' });
}));

router.get('/accounts/:id/reconciliation', fmsAuthorize('banking', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const closing = parseInt(req.query.bankClosingBalance, 10);
  if (!Number.isInteger(closing)) {
    throw errors.badRequest("'bankClosingBalance' is required, in integer paise");
  }
  if (!req.query.from || !req.query.to) throw errors.badRequest("'from' and 'to' are required");

  return ok(res, await svc.reconciliationPosition(req.fmsScope.school, req.params.id, {
    from: req.query.from, to: req.query.to, bankClosingBalance: closing,
  }));
}));

/**
 * Complete a reconciliation and CLOSE the period to further postings.
 * Every statement line must be accounted for first.
 */
router.post('/accounts/:id/reconcile', fmsAuthorize('banking', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    from: { required: true, rules: [check.date] },
    to: { required: true, rules: [check.date] },
    bankClosingBalance: { required: true, rules: [check.integer] },
    differenceExplanation: { rules: [check.string] },
    notes: { rules: [check.string] },
  });
  const r = await svc.reconcile(req.fmsScope.school, req.params.id, req.body, req);
  return created(res, r, r.reconciliation.difference === 0
    ? 'Reconciled — the period is now closed to new postings'
    : `Reconciled with an explained difference of ${r.reconciliation.difference} paise`);
}));

router.get('/reconciliations', fmsAuthorize('banking', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['periodTo', 'createdAt'], defaultSort: '-periodTo',
  });
  const filter = { school: req.fmsScope.school };
  if (req.query.bankAccount) {
    if (check.objectId(req.query.bankAccount)) throw errors.badRequest('Invalid bankAccount id');
    filter.bankAccount = req.query.bankAccount;
  }
  const [items, total] = await Promise.all([
    FmsBankReconciliation.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsBankReconciliation.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
}));

router.post('/reconciliations/:id/reopen', fmsAuthorize('banking', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });
  const doc = await svc.reopen(req.fmsScope.school, req.params.id, req, req.body.reason);
  return ok(res, doc, { message: 'Reconciliation reopened' });
}));

module.exports = router;