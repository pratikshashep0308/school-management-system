// backend/fms/routes/branches.js
//
// Multi-branch — SRS M21 / FR-M21, screen SCR-66.
//
// Branch SCOPING is not here: it lives in fmsAuthorize, which puts the caller's
// branch on req.fmsScope, and in every service, which filters on it. These
// endpoints are for looking ACROSS branches, which is a different permission.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const svc = require('../services/branch/branchService');
const { ok, validate, check, errors } = require('../utils/apiResponse');

/** Branches the caller can see, and whether they may consolidate. */
router.get('/', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await svc.summary(req));
}));

function branchesFrom(req) {
  const raw = req.query.branches || req.body?.branches;
  if (!raw) {
    // Defaulting to the caller's own branch means a request without an explicit
    // list can never accidentally read another branch's data.
    return [req.fmsScope.school];
  }
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  for (const b of list) {
    if (check.objectId(String(b).trim())) throw errors.badRequest(`Invalid branch id '${b}'`);
  }
  return list.map((b) => String(b).trim());
}

/** Consolidated trial balance. */
router.get('/trial-balance', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await svc.consolidatedTrialBalance(branchesFrom(req), {
    from: req.query.from, to: req.query.to, req,
  }));
}));

/** Consolidated Income & Expenditure and Balance Sheet. */
router.get('/statements', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await svc.consolidatedStatements(branchesFrom(req), {
    from: req.query.from, to: req.query.to, asAt: req.query.asAt, req,
  }));
}));

/**
 * Inter-branch entries.
 *
 * Reported, never eliminated automatically — deciding which side carries the
 * real cost is an accounting judgement rather than an arithmetic one.
 */
router.get('/inter-branch', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const branches = branchesFrom(req);
  svc.assertMayConsolidate(req, branches);
  return ok(res, await svc.interBranchEntries(branches, {
    from: req.query.from, to: req.query.to,
  }));
}));

module.exports = router;