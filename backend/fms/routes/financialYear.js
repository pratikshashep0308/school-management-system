// backend/fms/routes/financialYear.js
//
// The example endpoint required by P1.5 — proves the whole request pattern end
// to end: auth → deny-by-default guard → branch scope → validation →
// pagination → envelope → error handler.
//
// Every Phase 2+ route file follows this shape.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const { FmsFinancialYear } = require('../models/core');
const fyService = require('../services/financialYear/financialYearService');
const {
  ok, paginated, parsePagination, validate, errors, check,
} = require('../utils/apiResponse');

const FY_STATUS = ['open', 'closing', 'closed', 'locked', 'reopened'];
const SORTABLE = ['yearCode', 'startDate', 'endDate', 'fyStatus', 'createdAt'];
const FIELDS = '_id yearCode startDate endDate fyStatus isCurrent openingBalancesPosted';

/**
 * GET /api/fms/financial-years
 *
 * Note what is NOT a client parameter: `school`. Branch scope comes from
 * req.fmsScope, set by fmsAuthorize from the JWT. Accepting it from the query
 * string would let any authenticated user read another branch's books.
 */
router.get(
  '/',
  fmsAuthorize('financialYear', 'VIEW'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = parsePagination(req.query, {
      allowedSort: SORTABLE,
      defaultSort: '-startDate',
    });

    const filter = { school: req.fmsScope.school };

    if (req.query.fyStatus) {
      if (!FY_STATUS.includes(req.query.fyStatus)) {
        throw errors.badRequest(
          `Unknown fyStatus '${req.query.fyStatus}'`,
          { allowed: FY_STATUS }
        );
      }
      filter.fyStatus = req.query.fyStatus;
    }

    const [items, total] = await Promise.all([
      FmsFinancialYear.find(filter).select(FIELDS).sort(sort).skip(skip).limit(limit).lean(),
      FmsFinancialYear.countDocuments(filter),
    ]);

    return paginated(res, items, { page, limit, total });
  })
);

/**
 * GET /api/fms/financial-years/:id
 *
 * A record in another branch returns 404, not 403. Distinguishing "exists but
 * forbidden" from "does not exist" would leak the existence of another
 * branch's records, which is itself information.
 */
router.get(
  '/:id',
  fmsAuthorize('financialYear', 'VIEW'),
  asyncHandler(async (req, res) => {
    if (check.objectId(req.params.id)) {
      throw errors.badRequest('Invalid id: must be a 24-character ObjectId');
    }

    const filter = { _id: req.params.id };
    if (!req.fmsScope.multiBranch) filter.school = req.fmsScope.school;

    const doc = await FmsFinancialYear.findOne(filter).select(FIELDS).lean();
    if (!doc) throw errors.notFound('Financial year');

    return ok(res, doc);
  })
);

/**
 * GET /api/fms/financial-years/:id/readiness
 * What is in the year, and what argues against closing it (SCR-67).
 */
router.get(
  '/:id/readiness',
  fmsAuthorize('financialYear', 'VIEW'),
  asyncHandler(async (req, res) => {
    if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
    return ok(res, await fyService.readiness(req.fmsScope.school, req.params.id));
  })
);

/** POST /api/fms/financial-years/:id/close — postings are refused afterwards. */
router.post(
  '/:id/close',
  fmsAuthorize('financialYear', 'APPROVE'),
  asyncHandler(async (req, res) => {
    if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
    const r = await fyService.close(req.fmsScope.school, req.params.id, req, req.body || {});
    return ok(res, r.financialYear, {
      message: `${r.financialYear.yearCode} closed` +
        (r.acknowledgedWarnings.length ? ` with ${r.acknowledgedWarnings.length} acknowledged warning(s)` : ''),
    });
  })
);

/**
 * POST /api/fms/financial-years/:id/lock
 *
 * IRREVERSIBLE. Requires the year code typed back, because there is no undo —
 * a correction afterwards can only be made by posting into the current year.
 */
router.post(
  '/:id/lock',
  fmsAuthorize('financialYear', 'APPROVE'),
  asyncHandler(async (req, res) => {
    if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
    const fy = await fyService.lock(req.fmsScope.school, req.params.id, req, req.body || {});
    return ok(res, fy, { message: `${fy.yearCode} locked permanently` });
  })
);

/**
 * POST /api/fms/financial-years/:id/reopen
 *
 * Restricted by role, requires a meaningful reason, and is audited.
 * A LOCKED year cannot be reopened at all.
 */
router.post(
  '/:id/reopen',
  fmsAuthorize('financialYear', 'APPROVE'),
  asyncHandler(async (req, res) => {
    if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
    validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });
    const fy = await fyService.reopen(req.fmsScope.school, req.params.id, req, req.body);
    return ok(res, fy, { message: `${fy.yearCode} reopened — this is recorded` });
  })
);

module.exports = router;