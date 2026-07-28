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
const {
  ok, paginated, parsePagination, errors, check,
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

module.exports = router;