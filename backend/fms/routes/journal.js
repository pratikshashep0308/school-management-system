// backend/fms/routes/journal.js
//
// Journal Voucher — SRS M12 / FR-M12, screens SCR-47 (list), SCR-48 (entry),
// SCR-49 (detail).
//
// RBAC per the permission matrix (SRS §9.10):
//   accountant       'edit'  → create, update, submit, cancel
//   accountsManager  'admin' → all of the above, plus approve / reject / reverse
//   everyone else    'read'  or none
//
// This maps exactly onto the prompt's "ACCOUNTANT creates, ACCOUNTS_MGR
// approves/posts", so no override is needed here.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const { FmsJournalVoucher, JV_STATUS } = require('../models/journal');
const svc = require('../services/journal/journalService');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

const SORTABLE = ['jvDate', 'createdAt', 'totalDebit', 'jvStatus'];
const LIST_FIELDS =
  '_id jvDate narration reference totalDebit totalCredit jvStatus voucherNumber ' +
  'voucher createdBy submittedBy postedBy createdAt updatedAt';

/** GET /api/fms/journal — list, filtered. */
router.get('/', fmsAuthorize('journal', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: SORTABLE, defaultSort: '-jvDate',
  });

  const filter = { school: req.fmsScope.school };

  if (req.query.jvStatus) {
    if (!JV_STATUS.includes(req.query.jvStatus)) {
      throw errors.badRequest(`Unknown jvStatus '${req.query.jvStatus}'`, { allowed: JV_STATUS });
    }
    filter.jvStatus = req.query.jvStatus;
  }
  if (req.query.financialYear) {
    if (check.objectId(req.query.financialYear)) throw errors.badRequest('Invalid financialYear id');
    filter.financialYear = req.query.financialYear;
  }
  if (req.query.mine === 'true') filter.createdBy = req.user._id;

  if (req.query.from || req.query.to) {
    filter.jvDate = {};
    if (req.query.from) {
      const d = new Date(req.query.from);
      if (Number.isNaN(d.getTime())) throw errors.badRequest("Invalid 'from' date");
      filter.jvDate.$gte = d;
    }
    if (req.query.to) {
      const d = new Date(req.query.to);
      if (Number.isNaN(d.getTime())) throw errors.badRequest("Invalid 'to' date");
      d.setUTCHours(23, 59, 59, 999);
      filter.jvDate.$lte = d;
    }
  }

  const [items, total] = await Promise.all([
    FmsJournalVoucher.find(filter).select(LIST_FIELDS).sort(sort).skip(skip).limit(limit).lean(),
    FmsJournalVoucher.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
}));

/** GET /api/fms/journal/:id — full detail including lines and workflow trail. */
router.get('/:id', fmsAuthorize('journal', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsJournalVoucher
    .findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!doc) throw errors.notFound('Journal voucher');
  return ok(res, doc);
}));

const lineRules = {
  financialYear: { required: true, rules: [check.objectId] },
  jvDate: { required: true, rules: [check.date] },
  narration: { required: true, rules: [check.nonEmpty] },
  lines: { required: true, rules: [check.array] },
  reference: { rules: [check.string] },
};

/**
 * POST /api/fms/journal
 * Creating a DRAFT still requires balanced lines — the prompt's "block save
 * unless lines balance" applies from the first save, not only at posting.
 */
router.post('/', fmsAuthorize('journal', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, lineRules);
  const jv = await svc.create(req.fmsScope.school, req.body, req);
  return created(res, jv, 'Journal voucher created as draft');
}));

/** PATCH /api/fms/journal/:id — draft or rejected only. */
router.patch('/:id', fmsAuthorize('journal', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    jvDate: { rules: [check.date] },
    narration: { rules: [check.nonEmpty] },
    lines: { rules: [check.array] },
    reference: { rules: [check.string] },
  });
  const jv = await svc.update(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, jv, { message: 'Journal voucher updated' });
}));

/** POST /api/fms/journal/:id/submit — send for approval. */
router.post('/:id/submit', fmsAuthorize('journal', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const jv = await svc.submit(req.fmsScope.school, req.params.id, req, req.body?.comment);
  return ok(res, jv, { message: 'Submitted for approval' });
}));

/**
 * POST /api/fms/journal/:id/approve — approve AND post to the ledger.
 * Requires 'admin'. Separation of duties is enforced in the service: the
 * approver must not be the creator or submitter.
 */
router.post('/:id/approve', fmsAuthorize('journal', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const result = await svc.approve(req.fmsScope.school, req.params.id, req, req.body?.comment);
  return ok(res, {
    journalVoucher: result.jv,
    voucher: result.voucher,
    lineCount: result.entries.length,
  }, { message: `Posted as ${result.voucher.voucherNumber}` });
}));

/** POST /api/fms/journal/:id/reject — a reason is mandatory. */
router.post('/:id/reject', fmsAuthorize('journal', 'REJECT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });
  const jv = await svc.reject(req.fmsScope.school, req.params.id, req, req.body.reason);
  return ok(res, jv, { message: 'Journal voucher rejected' });
}));

/** POST /api/fms/journal/:id/cancel — pre-posting only. Never a delete. */
router.post('/:id/cancel', fmsAuthorize('journal', 'CANCEL'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const jv = await svc.cancel(req.fmsScope.school, req.params.id, req, req.body?.reason);
  return ok(res, jv, { message: 'Journal voucher cancelled' });
}));

/** POST /api/fms/journal/:id/reverse — posted only; original retained. */
router.post('/:id/reverse', fmsAuthorize('journal', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });
  const result = await svc.reverse(req.fmsScope.school, req.params.id, req, req.body.reason);
  return ok(res, {
    journalVoucher: result.jv,
    reversalVoucher: result.reversal,
    lineCount: result.entries.length,
  }, { message: `Reversed by ${result.reversal.voucherNumber}` });
}));

// There is deliberately NO DELETE route. A journal voucher is cancelled or
// reversed; the record of the attempt always survives.

module.exports = router;