// backend/fms/routes/pettyCash.js
//
// Petty Cash — SRS M10 / FR-M10, BPMN WF9, screens SCR-43/44/45.
//
// Daily closing is NOT here. It lives at /api/fms/books (P2.4), which handles
// any cash account including petty cash — physical count, variance, and
// verification by a second person.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const {
  FmsPettyCashFloat, FmsPettyCashTransaction,
  PC_TRANSACTION_TYPE, PC_STATUS, FLOAT_STATUS,
} = require('../models/pettyCash');
const svc = require('../services/pettyCash/pettyCashService');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

// ─── Floats ──────────────────────────────────────────────────────────────────

/** GET /api/fms/petty-cash/floats — each with its live position (SCR-43). */
router.get('/floats', fmsAuthorize('pettyCash', 'VIEW'), asyncHandler(async (req, res) => {
  const filter = { school: req.fmsScope.school };
  if (req.query.floatStatus) {
    if (!FLOAT_STATUS.includes(req.query.floatStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.floatStatus}'`, { allowed: FLOAT_STATUS });
    }
    filter.floatStatus = req.query.floatStatus;
  }
  if (req.query.mine === 'true') filter.custodian = req.user._id;

    // A hard cap rather than full pagination: this set is naturally small (a
    // school has a handful), so paging would be ceremony. The cap exists
    // because "naturally small" is an assumption, and an endpoint that CANNOT
    // return unbounded data is safer than one that merely does not today.
    const MAX = 200;
  const floats = await FmsPettyCashFloat.find(filter).sort({ name: 1 }).limit(MAX).lean();

  const items = [];
  for (const f of floats) {
    const pos = await svc.position(req.fmsScope.school, f._id);
    items.push({ ...f, position: { balance: pos.balance, replenishmentDue: pos.replenishmentDue,
      needsReplenishment: pos.needsReplenishment, isOverFloat: pos.isOverFloat } });
  }

  return ok(res, items);
}));

router.get('/floats/:id', fmsAuthorize('pettyCash', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  return ok(res, await svc.position(req.fmsScope.school, req.params.id));
}));

router.post('/floats', fmsAuthorize('pettyCash', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    name: { required: true, rules: [check.nonEmpty] },
    account: { required: true, rules: [check.objectId] },
    custodian: { required: true, rules: [check.objectId] },
    floatAmount: { required: true, rules: [check.paise] },
    replenishThreshold: { rules: [check.paise] },
    maxSingleExpense: { rules: [check.paise] },
    custodianName: { rules: [check.string] },
    notes: { rules: [check.string] },
  });
  const doc = await svc.createFloat(req.fmsScope.school, req.body, req);
  return created(res, doc, `Float '${doc.name}' created`);
}));

/** Suspending or closing needs a reason; closing needs the tin to be empty. */
router.post('/floats/:id/status', fmsAuthorize('pettyCash', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    floatStatus: { required: true, rules: [check.enumOf(FLOAT_STATUS)] },
    reason: { rules: [check.string] },
  });
  const doc = await svc.setFloatStatus(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, doc, { message: `Float set to ${doc.floatStatus}` });
}));

// ─── Transactions ────────────────────────────────────────────────────────────

/** GET /api/fms/petty-cash/floats/:id/book — the petty cash book (SCR-44). */
router.get('/floats/:id/book', fmsAuthorize('pettyCash', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  return ok(res, await svc.book(req.fmsScope.school, req.params.id, {
    from: req.query.from, to: req.query.to,
  }));
}));

router.get('/transactions', fmsAuthorize('pettyCash', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['transactionDate', 'amount', 'voucherNumber'], defaultSort: '-transactionDate',
  });

  const filter = { school: req.fmsScope.school };
  if (req.query.pettyCashFloat) {
    if (check.objectId(req.query.pettyCashFloat)) throw errors.badRequest('Invalid float id');
    filter.pettyCashFloat = req.query.pettyCashFloat;
  }
  if (req.query.transactionType) {
    if (!PC_TRANSACTION_TYPE.includes(req.query.transactionType)) {
      throw errors.badRequest(`Unknown type '${req.query.transactionType}'`, { allowed: PC_TRANSACTION_TYPE });
    }
    filter.transactionType = req.query.transactionType;
  }
  if (req.query.pcStatus) {
    if (!PC_STATUS.includes(req.query.pcStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.pcStatus}'`, { allowed: PC_STATUS });
    }
    filter.pcStatus = req.query.pcStatus;
  }

  const [items, total] = await Promise.all([
    FmsPettyCashTransaction.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsPettyCashTransaction.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
}));

/**
 * POST a movement (SCR-45).
 * Inflows come from cash or bank; expenses must go to an expense head, and
 * cannot exceed what is actually in the tin.
 */
router.post('/floats/:id/transactions', fmsAuthorize('pettyCash', 'CREATE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    transactionType: { required: true, rules: [check.enumOf(PC_TRANSACTION_TYPE)] },
    amount: { required: true, rules: [check.paise] },
    counterAccount: { required: true, rules: [check.objectId] },
    particulars: { required: true, rules: [check.nonEmpty] },
    transactionDate: { rules: [check.date] },
    paidTo: { rules: [check.string] },
    billNumber: { rules: [check.string] },
    attachmentUrl: { rules: [check.string] },
  });

  if (req.body.transactionType === 'adjustment') {
    throw errors.badRequest(
      'An adjustment cannot be recorded directly',
      { hint: 'It is posted from a verified daily closing variance, via /variance.' }
    );
  }

  const r = await svc.record(req.fmsScope.school, req.params.id, req.body, req);
  return created(res, {
    transaction: r.transaction,
    voucher: { _id: r.voucher._id, voucherNumber: r.voucher.voucherNumber },
    position: r.position,
  }, `${r.transaction.transactionType} recorded — ${r.transaction.voucherNumber}`);
}));

router.post('/transactions/:id/cancel', fmsAuthorize('pettyCash', 'CANCEL'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });
  const r = await svc.cancel(req.fmsScope.school, req.params.id, req, req.body.reason);
  return ok(res, {
    transaction: r.transaction,
    reversalVoucher: { _id: r.reversal._id, voucherNumber: r.reversal.voucherNumber },
  }, { message: 'Entry cancelled and reversed' });
}));

/**
 * POST a verified closing variance to the books.
 *
 * A counted shortfall is real money gone. Until it is posted, the ledger says
 * the tin holds more than it does.
 */
router.post('/closings/:closingId/variance', fmsAuthorize('pettyCash', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.closingId)) throw errors.badRequest('Invalid closing id');
  validate(req.body, { counterAccount: { required: true, rules: [check.objectId] } });

  const r = await svc.postVariance(req.fmsScope.school, req.params.closingId, req.body, req);
  return created(res, {
    transaction: r.transaction,
    voucher: { _id: r.voucher._id, voucherNumber: r.voucher.voucherNumber },
    position: r.position,
  }, `Variance posted as ${r.transaction.voucherNumber}`);
}));

module.exports = router;