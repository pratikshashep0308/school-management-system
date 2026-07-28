// backend/fms/routes/books.js
//
// Cash Book (M13, SCR-50) and Bank Book (M14, SCR-51).
//
// Every balance is derived from fms_ledgerentries at query time — nothing is
// stored twice, so the books cannot disagree with the ledger.
//
// RBAC: reads use `ledger`, since these are ledger views. Closing and
// verification use `pettyCash`, which is where the matrix puts physical cash
// custody: cashier 'edit' (close), accountsManager 'admin' (verify).

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const { FmsDailyClosing, CLOSING_STATUS } = require('../models/cashBankBook');
const svc = require('../services/cashBankBook/bookService');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

const BOOK_TYPES = ['cash', 'bank'];

function bookType(req) {
  const t = req.params.bookType;
  if (!BOOK_TYPES.includes(t)) {
    throw errors.badRequest(`Unknown book type '${t}'`, { allowed: BOOK_TYPES });
  }
  return t;
}

/**
 * GET /api/fms/books/:bookType            cash | bank
 * Day-by-day, with continuity: each day's opening is the previous day's closing.
 */
router.get('/:bookType', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  const type = bookType(req);
  if (req.query.account && check.objectId(req.query.account)) {
    throw errors.badRequest('Invalid account id');
  }

  const result = await svc.book(req.fmsScope.school, {
    bookType: type,
    account: req.query.account,
    from: req.query.from,
    to: req.query.to,
  });

  return ok(res, result);
}));

/** GET /api/fms/books/:bookType/day/:date — one day in full. */
router.get('/:bookType/day/:date', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  const type = bookType(req);
  if (req.query.account && check.objectId(req.query.account)) {
    throw errors.badRequest('Invalid account id');
  }

  const result = await svc.day(req.fmsScope.school, {
    bookType: type,
    account: req.query.account,
    date: req.params.date,
  });

  return ok(res, result);
}));

/**
 * POST /api/fms/books/close
 * Close a day. A cash closing requires a physical count; a variance requires a
 * reason and lands the closing in `disputed` until someone verifies it.
 */
router.post('/close', fmsAuthorize('pettyCash', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    account: { required: true, rules: [check.objectId] },
    date: { required: true, rules: [check.date] },
    physicalCount: { rules: [check.integer] },       // integer paise
    varianceReason: { rules: [check.string] },
    notes: { rules: [check.string] },
    denominations: { rules: [check.array] },
  });

  const doc = await svc.closeDay(req.fmsScope.school, req.body, req);
  return created(res, doc, doc.variance === 0
    ? 'Day closed'
    : `Day closed with a variance of ${doc.variance} paise — marked disputed pending verification`);
}));

/** GET /api/fms/books/closings — list closings. */
router.get('/closings/list', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['closingDate', 'variance', 'createdAt'], defaultSort: '-closingDate',
  });

  const filter = { school: req.fmsScope.school };
  if (req.query.bookType) {
    if (!BOOK_TYPES.includes(req.query.bookType)) {
      throw errors.badRequest(`Unknown book type '${req.query.bookType}'`, { allowed: BOOK_TYPES });
    }
    filter.bookType = req.query.bookType;
  }
  if (req.query.closingStatus) {
    if (!CLOSING_STATUS.includes(req.query.closingStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.closingStatus}'`, { allowed: CLOSING_STATUS });
    }
    filter.closingStatus = req.query.closingStatus;
  }
  if (req.query.account) {
    if (check.objectId(req.query.account)) throw errors.badRequest('Invalid account id');
    filter.account = req.query.account;
  }
  // The default view an accounts manager wants: what still needs attention.
  if (req.query.unverified === 'true') filter.closingStatus = { $ne: 'verified' };

  const [items, total] = await Promise.all([
    FmsDailyClosing.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsDailyClosing.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
}));

/**
 * POST /api/fms/books/closings/:id/verify
 * The verifier must not be whoever closed it — self-verification is not
 * verification.
 */
router.post('/closings/:id/verify', fmsAuthorize('pettyCash', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await svc.verifyClosing(req.fmsScope.school, req.params.id, req, req.body?.note);
  return ok(res, doc, { message: 'Closing verified' });
}));

module.exports = router;