// backend/fms/routes/reports.js
//
// Financial reports — SRS M16 / FR-M16, screens SCR-55..60.
//
// Every report is computed from fms_ledgerentries. Several are served by the
// module that already owns them (trial balance, cash book, budget vs actual)
// rather than reimplemented here — two implementations would eventually give
// two answers.
//
// `?format=pdf|excel` on any of them.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const svc = require('../services/reports/reportService');
const exporters = require('../services/reports/exporters');
const gl = require('../services/ledger/ledgerQueryService');
const bookSvc = require('../services/cashBankBook/bookService');
const { FmsSettings } = require('../models/core');
const { ok, validate, check, errors } = require('../utils/apiResponse');

const FORMATS = ['json', 'pdf', 'excel'];

/** School name for report headings, if configured. */
async function branding(school) {
  const s = await FmsSettings.findOne({ school, key: 'receipt.branding' }).lean();
  return { schoolName: s?.value?.name };
}

/**
 * Deliver a report in the requested format.
 *
 * An export library that is missing degrades to a clear 503 rather than a
 * stack trace — and the JSON is always available, so a failed export never
 * means the figures are unobtainable.
 */
async function deliver(req, res, report, title) {
  const format = (req.query.format || 'json').toLowerCase();
  if (!FORMATS.includes(format)) {
    throw errors.badRequest(`Unknown format '${format}'`, { allowed: FORMATS });
  }
  if (format === 'json') return ok(res, report);

  const meta = { ...(await branding(req.fmsScope.school)), title };
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    if (format === 'excel') {
      const buf = await exporters.toExcel(report, meta);
      res.setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${slug}-${stamp}.xlsx"`);
      return res.send(Buffer.from(buf));
    }

    const buf = await exporters.toPdf(report, meta);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-${stamp}.pdf"`);
    return res.send(buf);
  } catch (err) {
    if (err.exportUnavailable) {
      const e = errors.internal(err.message);
      e.status = 503;
      e.code = 'EXPORT_UNAVAILABLE';
      e.details = { format: err.exportUnavailable, hint: 'The report is still available as JSON.' };
      throw e;
    }
    throw err;
  }
}

function periodFrom(req) {
  return {
    financialYear: req.query.financialYear,
    from: req.query.from,
    to: req.query.to,
  };
}

/** GET /api/fms/reports — what can be produced, and where each comes from. */
router.get('/', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, {
    reports: svc.catalogue(),
    formats: FORMATS,
    note: 'Every figure is computed from the general ledger. Nothing is cached.',
  });
}));

// ─── The statements ──────────────────────────────────────────────────────────

router.get('/trial-balance', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const period = await svc.resolvePeriod(req.fmsScope.school, periodFrom(req));
  const tb = await gl.trialBalance(req.fmsScope.school, {
    from: period.from, to: period.to,
    financialYear: period.financialYear || undefined,
  });
  return deliver(req, res, { report: 'trialBalance', period, ...tb }, 'Trial Balance');
}));

router.get('/balance-sheet', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const report = await svc.balanceSheet(req.fmsScope.school, periodFrom(req));
  return deliver(req, res, report, 'Balance Sheet');
}));

/**
 * Income & Expenditure — what a school's P&L is properly called.
 * Both paths are served so nobody has to guess.
 */
router.get('/profit-and-loss', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const report = await svc.profitAndLoss(req.fmsScope.school, periodFrom(req));
  return deliver(req, res, report, 'Income and Expenditure');
}));
router.get('/income-expenditure', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const report = await svc.profitAndLoss(req.fmsScope.school, periodFrom(req));
  return deliver(req, res, report, 'Income and Expenditure');
}));

router.get('/cash-flow', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const report = await svc.cashMovement(req.fmsScope.school, periodFrom(req));
  return deliver(req, res, report, 'Cash Movement');
}));

// ─── Operational reports ─────────────────────────────────────────────────────

router.get('/department-expense', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const report = await svc.departmentExpense(req.fmsScope.school, periodFrom(req));
  return deliver(req, res, report, 'Department Expense');
}));

router.get('/fee-collection', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const report = await svc.feeCollection(req.fmsScope.school, periodFrom(req));
  return deliver(req, res, report, 'Fee Collection');
}));

router.get('/budget-vs-actual', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  if (!req.query.financialYear) throw errors.badRequest("'financialYear' is required");
  if (check.objectId(req.query.financialYear)) throw errors.badRequest('Invalid financialYear id');
  const report = await svc.budgetVsActual(req.fmsScope.school, {
    financialYear: req.query.financialYear, department: req.query.department,
  });
  return deliver(req, res, report, 'Budget vs Actual');
}));

router.get('/cash-book', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const period = await svc.resolvePeriod(req.fmsScope.school, periodFrom(req));
  const report = await bookSvc.book(req.fmsScope.school, {
    bookType: 'cash', account: req.query.account,
    from: period.from.toISOString().slice(0, 10),
    to: period.to.toISOString().slice(0, 10),
  });
  return deliver(req, res, { report: 'cashBook', ...report }, 'Cash Book');
}));

router.get('/bank-book', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const period = await svc.resolvePeriod(req.fmsScope.school, periodFrom(req));
  const report = await bookSvc.book(req.fmsScope.school, {
    bookType: 'bank', account: req.query.account,
    from: period.from.toISOString().slice(0, 10),
    to: period.to.toISOString().slice(0, 10),
  });
  return deliver(req, res, { report: 'bankBook', ...report }, 'Bank Book');
}));

/**
 * GET /api/fms/reports/verify
 *
 * The three identities that must hold if the statements are to be believed.
 * Worth running before circulating anything.
 */
router.get('/verify', fmsAuthorize('financialReports', 'VIEW'), asyncHandler(async (req, res) => {
  const bs = await svc.balanceSheet(req.fmsScope.school, periodFrom(req));
  return ok(res, {
    ...bs.verification,
    period: bs.period,
    note: bs.verification.allPassed
      ? 'The statements agree with the ledger and with each other'
      : 'One or more identities failed — do not rely on these statements',
  });
}));

module.exports = router;