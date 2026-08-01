// backend/fms/routes/expenseCategories.js
//
// The expense category master.
//
// Mounted from routes/index.js at `/expense-categories`, behind `protect` and
// the finance session gate like every other FMS router.

const express = require('express');

const categoryService = require('../services/expense/categoryService');
const fmsAuthorize = require('../middleware/fmsAuthorize');
const { ok, created, validate, check } = require('../utils/apiResponse');

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─────────────────────────────────────────────────────────────────────────────
// fmsAuthorize is written INLINE on every route below, and deliberately not
// collapsed into a shared `const guards = [...]` array.
//
// It reads worse. It is also the only form the route-guard audit can see: that
// check is a static scan over source text, and a guard behind a spread is
// invisible to it. Four genuinely guarded routes in this codebase once reported
// as unguarded for exactly this reason — the code was safe and the check that
// proved it was blind.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/fms/expense-categories
 *
 * Returns EVERYTHING, unpaginated, by design. A category master is tens of
 * rows and every caller wants all of them for a picker.
 *
 * Stated explicitly because the opposite mistake is expensive here: the SMS
 * `/fees/students` endpoint defaults to 50 rows, its caller did not page, and
 * the first fee import would have posted 50 of 169 ledgers and reported
 * success. If this collection ever grows past a few hundred rows, add paging
 * to the endpoint AND to every caller in the same change.
 */
router.get('/', fmsAuthorize('expenses', 'VIEW'), asyncHandler(async (req, res) => {
  const rows = await categoryService.list(req.fmsScope.school, {
    status: req.query.status,
    parent: req.query.parent,
  });
  return ok(res, rows);
}));

/** GET /api/fms/expense-categories/tree — two levels, for pickers. */
router.get('/tree', fmsAuthorize('expenses', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await categoryService.tree(req.fmsScope.school));
}));

/** GET /api/fms/expense-categories/:id — with its children. */
router.get('/:id', fmsAuthorize('expenses', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await categoryService.get(req.fmsScope.school, req.params.id));
}));

/**
 * POST /api/fms/expense-categories
 *
 * `account` is required, and the service refuses a group header, a deactivated
 * account, or one from another school. A category without a valid account is
 * the thing this collection exists to prevent.
 */
router.post('/', fmsAuthorize('expenses', 'EDIT'), asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    code: { required: true, rules: [check.nonEmpty] },
    name: { required: true, rules: [check.nonEmpty] },
    account: { required: true, rules: [check.nonEmpty] },
    requiresVendor: { rules: [check.boolean] },
    requiresInvoice: { rules: [check.boolean] },
  });

  const doc = await categoryService.create(req.fmsScope.school, req.body, req);
  return created(res, doc, { message: `Category ${doc.code} created` });
}));

/**
 * PUT /api/fms/expense-categories/:id
 *
 * Changing `account` is refused once anything has posted against the category —
 * it would split its history across two heads. The service returns a message
 * saying so, and pointing at the journal voucher route instead.
 */
router.put('/:id', fmsAuthorize('expenses', 'EDIT'), asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    requiresVendor: { rules: [check.boolean] },
    requiresInvoice: { rules: [check.boolean] },
  });

  const doc = await categoryService.update(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, doc, { message: `Category ${doc.code} updated` });
}));

/**
 * DELETE /api/fms/expense-categories/:id
 *
 * DEACTIVATES. Nothing in the FMS hard-deletes a document the ledger might
 * reference — the model itself throws on deleteOne/deleteMany.
 *
 * Refuses while open requests, active recurring templates or active child
 * categories point at it, and returns the blocking items by name so somebody
 * can act on the message rather than hunt for the reference.
 */
router.delete('/:id', fmsAuthorize('expenses', 'DELETE'), asyncHandler(async (req, res) => {
  const doc = await categoryService.deactivate(req.fmsScope.school, req.params.id, req);
  return ok(res, doc, { message: `Category ${doc.code} deactivated` });
}));

module.exports = router;
