// backend/fms/routes/ledger.js
//
// General Ledger — SRS M11 / FR-M11, screen SCR-46.
//
// EVERY route here is a GET. There is deliberately no POST, PATCH or DELETE:
// ledger entries are written only by LedgerPostingService, and the permission
// matrix gives no role `edit` on the `ledger` module (asserted by a test in
// rbac.test.js, so a future matrix edit that opened it would fail CI).
//
// Journal vouchers — the sanctioned way for a human to create a posting —
// arrive in P2.3 under /journal, and go through LedgerPostingService like
// everything else.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const svc = require('../services/ledger/ledgerQueryService');
const { ok, paginated, parsePagination, check, errors } = require('../utils/apiResponse');

const SORTABLE = ['entryDate', 'voucherNumber', 'accountCode', 'debit', 'credit', 'createdAt'];
const VOUCHER_TYPES = ['income', 'payment', 'receipt', 'journal'];
const PARTY_TYPES = ['vendor', 'student', 'teacher', 'other'];

/** Reject unknown enum values rather than silently returning nothing. */
function checkEnums(q) {
  if (q.voucherType && !VOUCHER_TYPES.includes(q.voucherType)) {
    throw errors.badRequest(`Unknown voucherType '${q.voucherType}'`, { allowed: VOUCHER_TYPES });
  }
  if (q.partyType && !PARTY_TYPES.includes(q.partyType)) {
    throw errors.badRequest(`Unknown partyType '${q.partyType}'`, { allowed: PARTY_TYPES });
  }
  for (const k of ['account', 'voucher', 'financialYear', 'party']) {
    if (q[k] && check.objectId(q[k])) throw errors.badRequest(`Invalid ${k} id`);
  }
}

/**
 * GET /api/fms/ledger
 * The general journal: every entry, filtered, with whole-set totals.
 */
router.get('/', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  checkEnums(req.query);
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: SORTABLE, defaultSort: '-entryDate',
  });

  const { items, total, summary } = await svc.entries(
    req.fmsScope.school, req.query, { skip, limit, sort }
  );

  return res.status(200).json({
    success: true,
    count: items.length,
    pagination: {
      page, limit, total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
    summary,
    data: items,
  });
}));

/**
 * GET /api/fms/ledger/trial-balance
 *
 * `totals.balanced` must always be true. If it is not, the ledger has been
 * written to by something other than LedgerPostingService.
 */
router.get('/trial-balance', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  checkEnums(req.query);
  return ok(res, await svc.trialBalance(req.fmsScope.school, req.query));
}));

/**
 * GET /api/fms/ledger/accounts/:id
 * One account's statement: opening balance, movements with running balance,
 * closing balance.
 */
router.get('/accounts/:id', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid account id');
  checkEnums(req.query);

  const { page, limit, skip } = parsePagination(req.query, {
    allowedSort: ['entryDate'], defaultSort: 'entryDate',
  });

  const result = await svc.accountLedger(
    req.fmsScope.school, req.params.id, req.query, { skip, limit }
  );

  return res.status(200).json({
    success: true,
    count: result.entries.length,
    pagination: {
      page, limit,
      total: result.total,
      pages: Math.ceil(result.total / limit),
      hasNext: page * limit < result.total,
      hasPrev: page > 1,
    },
    account: result.account,
    period: result.period,
    opening: result.opening,
    movement: result.movement,
    closing: result.closing,
    data: result.entries,
  });
}));

/**
 * GET /api/fms/ledger/vouchers/:id
 * Drill-down from any ledger row to the voucher that created it, with both
 * ends of a reversal chain.
 */
router.get('/vouchers/:id', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid voucher id');
  return ok(res, await svc.voucherDetail(req.fmsScope.school, req.params.id));
}));

module.exports = router;