// backend/fms/routes/dashboard.js
//
// Financial Dashboard — SRS M1 / FR-M1, screens SCR-04..07.
//
// Every figure is derived from the ledger at request time. `?live=true` bypasses
// the 60-second cache, and every response says whether it was cached and how
// old it is — a cache the reader cannot detect is the only kind that misleads.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const svc = require('../services/dashboard/dashboardService');
const { ok, check, errors } = require('../utils/apiResponse');

function optsFrom(req) {
  if (req.query.financialYear && check.objectId(req.query.financialYear)) {
    throw errors.badRequest('Invalid financialYear id');
  }
  return {
    financialYear: req.query.financialYear,
    from: req.query.from,
    to: req.query.to,
    bypass: req.query.live === 'true',
  };
}

/** GET /api/fms/dashboard — everything, in one call. */
router.get('/', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await svc.overview(req.fmsScope.school, optsFrom(req)));
}));

router.get('/kpis', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await svc.kpis(req.fmsScope.school, optsFrom(req)));
}));

router.get('/cash-position', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await svc.cashPosition(req.fmsScope.school, optsFrom(req)));
}));

/** GET /api/fms/dashboard/charts — the five charts (SCR-06/07). */
router.get('/charts', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const o = optsFrom(req);
  const school = req.fmsScope.school;

  const only = req.query.chart;
  const available = {
    incomeVsExpense: svc.incomeVsExpense,
    collectionTrend: svc.collectionTrend,
    expenseByCategory: svc.expenseByCategory,
    budgetUtilisation: svc.budgetUtilisation,
    departmentSpending: svc.departmentSpending,
  };

  if (only) {
    if (!available[only]) {
      throw errors.badRequest(`Unknown chart '${only}'`, { available: Object.keys(available) });
    }
    return ok(res, { [only]: await available[only](school, o) });
  }

  const keys = Object.keys(available);
  const results = await Promise.all(keys.map((k) => available[k](school, o)));
  return ok(res, Object.fromEntries(keys.map((k, i) => [k, results[i]])));
}));

/**
 * POST /api/fms/dashboard/refresh
 * Drop the cache. Useful straight after a batch posting, when waiting sixty
 * seconds to see the effect would be irritating.
 */
router.post('/refresh', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, svc.invalidate(req.fmsScope.school), { message: 'Dashboard cache cleared' });
}));

module.exports = router;