// backend/fms/routes/integrations.js
//
// Integration endpoints. Per docs/discovery/04_integration_plan.md.
//
// RBAC: `ledger` admin — running an ingest posts to the books, so it sits with
// the people answerable for them, not with whoever can read a report.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const { FmsAccountMapping, MAPPING_TYPE } = require('../models/integration');
const { FmsAccount } = require('../models/core');
const { FmsIncomeVoucher } = require('../models/income');
const feeIngest = require('../services/ingest/feeIngestService');
const payrollIngest = require('../services/ingest/payrollIngestService');
const expenseIngest = require('../services/ingest/expenseIngestService');
const settlement = require('../services/settlement/settlementService');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

// ─── Fee collection ──────────────────────────────────────────────────────────

/** GET /api/fms/integrations/fees/status */
router.get('/fees/status', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await feeIngest.status(req.fmsScope.school));
}));

/**
 * POST /api/fms/integrations/fees/sync
 *
 * Pulls from the SMS and posts what it has not seen. Safe to run twice: the
 * idempotency key makes a replay a no-op rather than a double-post.
 *
 * `?dryRun=true` resolves every payment and reports what WOULD happen without
 * writing anything — worth running first on a chart that has just been set up.
 */
router.post('/fees/sync', fmsAuthorize('ledger', 'APPROVE'), asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    from: { rules: [check.date] },
    to: { rules: [check.date] },
    dryRun: { rules: [check.boolean] },
  });

  const cycle = await feeIngest.sync(req.fmsScope.school, {
    dryRun: req.body?.dryRun === true || req.query.dryRun === 'true',
    from: req.body?.from || req.query.from,
    to: req.body?.to || req.query.to,
  }, req);

  // A cycle with failures is not a failed request — the batch is designed to
  // continue past a bad record. 200 with the failures listed is the honest
  // answer; a 500 would suggest nothing posted, which is untrue.
  return ok(res, cycle, {
    message: cycle.dryRun
      ? `Dry run — ${cycle.counts.posted} would post, ${cycle.counts.failed} would fail`
      : `${cycle.counts.posted} posted, ${cycle.counts.alreadyPosted} already present, ` +
        `${cycle.counts.failed} failed`,
  });
}));

/** GET /api/fms/integrations/fees/unclassified — receipts awaiting reclassification. */
router.get('/fees/unclassified', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['receiptDate', 'amount'], defaultSort: '-receiptDate',
  });

  const filter = {
    school: req.fmsScope.school,
    needsReclassification: true,
    incomeStatus: 'posted',
  };

  const [items, total] = await Promise.all([
    FmsIncomeVoucher.find(filter)
      .select('receiptNumber sourceReceiptNumber receiptDate amount payerName ' +
              'admissionNumber creditAccountCode sourceCollection')
      .sort(sort).skip(skip).limit(limit).lean(),
    FmsIncomeVoucher.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
}));

// ─── Payroll (§3) ────────────────────────────────────────────────────────────

/** GET /api/fms/integrations/payroll/status */
router.get('/payroll/status', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await payrollIngest.status(req.fmsScope.school));
}));

/**
 * POST /api/fms/integrations/payroll/sync
 *
 * `?dryRun=true` is the SCR-54 review: every slip assessed, with its balance
 * check, chosen posting date and the reason for that choice — and nothing
 * written. Worth running before every real cycle, since a slip that does not
 * reconcile is a data defect in the SMS rather than something to post around.
 */
router.post('/payroll/sync', fmsAuthorize('ledger', 'APPROVE'), asyncHandler(async (req, res) => {
  validate(req.body || {}, { dryRun: { rules: [check.boolean] } });

  const cycle = await payrollIngest.sync(req.fmsScope.school, {
    dryRun: req.body?.dryRun === true || req.query.dryRun === 'true',
  }, req);

  return ok(res, cycle, {
    message: cycle.dryRun
      ? `Review — ${cycle.counts.posted} would post, ${cycle.counts.failed} would not`
      : `${cycle.counts.posted} posted, ${cycle.counts.alreadyPosted} already present, ` +
        `${cycle.counts.failed} failed, ${cycle.reversals.length} reversed`,
  });
}));

/** GET /api/fms/integrations/payroll/postings — what was posted, and how. */
router.get('/payroll/postings', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  const { FmsPayrollPosting } = require('../models/payroll');
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['postingDate', 'grossAmount', 'createdAt'], defaultSort: '-postingDate',
  });

  const filter = { school: req.fmsScope.school };
  if (req.query.postingStatus) filter.postingStatus = req.query.postingStatus;
  if (req.query.year) filter.year = Number(req.query.year);

  const [items, total] = await Promise.all([
    FmsPayrollPosting.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsPayrollPosting.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
}));

// ─── SMS expenses (§4) ───────────────────────────────────────────────────────
//
// Note what is NOT here: purchase orders, goods receipts and vendor payables.
// §4 confirms the SMS has no procurement, vendor or inventory model — those are
// FMS-owned and posted by the Purchase module (P4.3). SMS `Expense` records are
// the only genuine boundary in this touchpoint.

router.get('/expenses/status', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await expenseIngest.status(req.fmsScope.school));
}));

/**
 * POST /api/fms/integrations/expenses/sync
 *
 * Imports SMS expenses as COMPLETED records with no FMS approval trail — the
 * money was already spent when the SMS recorded it, and running it through the
 * approval chain retroactively would manufacture approvals that never happened.
 */
router.post('/expenses/sync', fmsAuthorize('ledger', 'APPROVE'), asyncHandler(async (req, res) => {
  validate(req.body || {}, { dryRun: { rules: [check.boolean] } });

  const cycle = await expenseIngest.sync(req.fmsScope.school, {
    dryRun: req.body?.dryRun === true || req.query.dryRun === 'true',
  }, req);

  return ok(res, cycle, {
    message: cycle.dryRun
      ? `Dry run — ${cycle.counts.posted} would import, ${cycle.counts.failed} would fail`
      : `${cycle.counts.posted} imported, ${cycle.counts.alreadyPosted} already present, ` +
        `${cycle.counts.failed} failed`,
  });
}));

// ─── Gateway settlement (§5) ─────────────────────────────────────────────────
//
// NO PAYMENT GATEWAY IS INSTALLED. No SDK, no webhook route, no settlement
// model, no credentials — §5 confirms it. Online and UPI fee receipts therefore
// accumulate in the 1202 clearing head and are settled MANUALLY here.
//
// That manual step is a real, ongoing task for whoever keeps the books, not a
// stub standing in for automation. These endpoints make it tractable.

/** GET /api/fms/integrations/settlements/status */
router.get('/settlements/status', fmsAuthorize('banking', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await settlement.status(req.fmsScope.school));
}));

/** GET /api/fms/integrations/settlements/pending — what is waiting to clear. */
router.get('/settlements/pending', fmsAuthorize('banking', 'VIEW'), asyncHandler(async (req, res) => {
  const older = parseInt(req.query.olderThanDays, 10);
  return ok(res, await settlement.pending(req.fmsScope.school, {
    from: req.query.from,
    to: req.query.to,
    olderThanDays: Number.isInteger(older) ? older : undefined,
  }));
}));

/**
 * POST /api/fms/integrations/settlements/suggest
 * Given a bank credit, which clearing entries does it probably cover?
 * A SUGGESTION — it refuses to guess when nothing fits.
 */
router.post('/settlements/suggest', fmsAuthorize('banking', 'VIEW'), asyncHandler(async (req, res) => {
  validate(req.body, {
    amount: { required: true, rules: [check.paise] },
    upToDate: { rules: [check.date] },
    tolerance: { rules: [check.integer] },
  });
  return ok(res, await settlement.suggest(req.fmsScope.school, req.body));
}));

/**
 * POST /api/fms/integrations/settlements
 *
 * Posts Dr bank / Dr charges / Cr clearing. Idempotent on the settlement
 * reference — a replay is refused rather than crediting the clearing head for
 * money that arrived once.
 *
 * Where a gateway nets its charges off the credit, those charges are posted to
 * their own expense head. Netting them silently against income would understate
 * both.
 */
router.post('/settlements', fmsAuthorize('banking', 'APPROVE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    entryIds: { required: true, rules: [check.array] },
    bankAccount: { required: true, rules: [check.objectId] },
    settlementReference: { required: true, rules: [check.nonEmpty] },
    settlementDate: { rules: [check.date] },
    settledAmount: { rules: [check.paise] },
    feeAccount: { rules: [check.objectId] },
    narration: { rules: [check.string] },
  });

  const r = await settlement.settle(req.fmsScope.school, req.body, req);
  return created(res, {
    settlement: r.settlement,
    voucher: { _id: r.voucher._id, voucherNumber: r.voucher.voucherNumber },
  }, `${r.settlement.entryCount} receipt(s) settled — ${r.voucher.voucherNumber}`);
}));

/** POST /api/fms/integrations/settlements/:id/reverse — the credit bounced. */
router.post('/settlements/:id/reverse', fmsAuthorize('banking', 'CANCEL'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });

  const r = await settlement.reverse(req.fmsScope.school, req.params.id, req, req.body.reason);
  return ok(res, {
    settlement: r.settlement,
    reversalVoucher: { _id: r.reversal._id, voucherNumber: r.reversal.voucherNumber },
    releasedEntries: r.releasedEntries,
  }, { message: 'Settlement reversed; the receipts return to pending' });
}));

/**
 * POST /api/fms/integrations/gateway/webhook
 *
 * Deliberately NOT implemented. §5: no gateway is installed, so there is
 * nothing to receive from and no signature to verify. Accepting and discarding
 * a payload would be worse than refusing it — a caller would believe the money
 * had been recorded.
 *
 * The shape is documented so that adding a gateway later is a matter of
 * filling this in rather than designing it.
 */
router.post('/gateway/webhook', asyncHandler(async (req, res) => {
  throw errors.conflict(
    'No payment gateway is configured',
    {
      status: 'notConfigured',
      design: {
        pattern: 'webhook (gateway → FMS) — the only touchpoint where push is correct',
        idempotencyKey: 'gateway settlement reference',
        posting: 'Dr 1201 Bank — Current A/c  /  Cr 1202 Bank — Online Collections',
        note: 'Until a gateway exists, settle manually via POST /integrations/settlements',
      },
    }
  );
}));

// ─── Account mappings (§8) ───────────────────────────────────────────────────

router.get('/mappings', fmsAuthorize('ledger', 'VIEW'), asyncHandler(async (req, res) => {
  const filter = { school: req.fmsScope.school };
  if (req.query.mappingType) {
    if (!MAPPING_TYPE.includes(req.query.mappingType)) {
      throw errors.badRequest(`Unknown mappingType '${req.query.mappingType}'`, { allowed: MAPPING_TYPE });
    }
    filter.mappingType = req.query.mappingType;
  }
    // A hard cap rather than full pagination: this set is naturally small (a
    // school has a handful), so paging would be ceremony. The cap exists
    // because "naturally small" is an assumption, and an endpoint that CANNOT
    // return unbounded data is safer than one that merely does not today.
    const MAX = 200;
  return ok(res, await FmsAccountMapping.find(filter)
    .sort({ mappingType: 1, sourceLabel: 1 }).limit(MAX).lean());
}));

/**
 * PUT /api/fms/integrations/mappings — create or replace one mapping.
 *
 * Upsert rather than POST-only: a mapping is a statement about where a fee
 * type's money goes, and correcting it should not require deleting the old one
 * first and leaving a window where it maps nowhere.
 */
router.put('/mappings', fmsAuthorize('ledger', 'EDIT'), asyncHandler(async (req, res) => {
  validate(req.body, {
    mappingType: { required: true, rules: [check.enumOf(MAPPING_TYPE)] },
    sourceKey: { required: true, rules: [check.nonEmpty] },
    account: { required: true, rules: [check.objectId] },
    sourceLabel: { rules: [check.string] },
    notes: { rules: [check.string] },
  });

  const acct = await FmsAccount.findOne({ _id: req.body.account, school: req.fmsScope.school }).lean();
  if (!acct) throw errors.validation('Validation failed', { account: 'account not found' });
  if (!acct.isPostable || acct.status !== 'active') {
    throw errors.validation('Validation failed', {
      account: `${acct.accountCode} is ${!acct.isPostable ? 'not postable' : acct.status}`,
    });
  }

  // A fee type's money must go to an income head; an expense category's to an
  // expense head. Mapping either to the wrong type balances arithmetically and
  // is nonsense in every report.
  const expected = {
    feeType: 'income',
    paymentMethod: 'asset',
    expenseCategory: 'expense',
  }[req.body.mappingType];

  if (expected && acct.accountType !== expected) {
    throw errors.validation('Validation failed', {
      account:
        `a '${req.body.mappingType}' mapping needs an ${expected} account, ` +
        `but ${acct.accountCode} is ${acct.accountType}`,
    });
  }

  const doc = await FmsAccountMapping.findOneAndUpdate(
    {
      school: req.fmsScope.school,
      mappingType: req.body.mappingType,
      sourceKey: String(req.body.sourceKey),
    },
    {
      $set: {
        account: acct._id,
        accountCode: acct.accountCode,
        accountName: acct.accountName,
        sourceLabel: req.body.sourceLabel,
        notes: req.body.notes,
        isActive: true,
        updatedBy: req.user._id,
      },
      $setOnInsert: { createdBy: req.user._id },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return created(res, doc, `Mapped to ${acct.accountCode} ${acct.accountName}`);
}));

router.delete('/mappings/:id', fmsAuthorize('ledger', 'DELETE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsAccountMapping.findOne({ _id: req.params.id, school: req.fmsScope.school });
  if (!doc) throw errors.notFound('Mapping');

  // Deactivated, not deleted — so it is visible why a fee type stopped
  // resolving, rather than the mapping simply having vanished.
  doc.isActive = false;
  doc.updatedBy = req.user._id;
  await doc.save();

  return ok(res, doc, { message: 'Mapping deactivated' });
}));

module.exports = router;