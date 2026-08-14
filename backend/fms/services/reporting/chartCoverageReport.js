// backend/fms/services/reporting/chartCoverageReport.js
//
// A3, and the general form of the problem behind it.
//
// ─── THE PATTERN ─────────────────────────────────────────────────────────────
// An account that exists in the chart and can never receive a posting reads as
// a zero. A zero looks like a measurement — "no library fees were collected" —
// when the truth is "nothing in this system is capable of recording one". The
// two are indistinguishable on a trial balance, and the second is much worse,
// because nobody investigates a number that looks fine.
//
// This has now bitten twice. 2105 ESIC and 2106 Professional Tax sat unfeedable
// until the salary schema was extended. 4108 Late Fee Income is unfeedable
// today and nobody had noticed. So rather than answer the library question in
// isolation, this walks the whole chart and asks of every account: is there a
// live path that could ever post to this?
//
// ─── THE LIBRARY FINDING (A3) ────────────────────────────────────────────────
// PUT /api/library/return/:issueId computes daysLate × ₹5 and writes it to
// BookIssue.lateFee. There is no paid flag, no receipt, no payment record and
// no outstanding list. The fine is calculated, shown once in a success message,
// and never tracked again.
//
// So there is nothing to ingest, and building an ingest would be inventing an
// SMS workflow rather than integrating one. Per the brief: report it, recommend
// deactivating the accounts that imply a revenue stream nobody records, and
// stop there.
//
// Worth flagging separately, because it is a live misstatement rather than a
// gap: GET /api/library/stats returns the sum of BookIssue.lateFee under the
// key `lateFeeCollected`. Nothing about that field means collected. The library
// screen is reporting charges as receipts.
//
// ─── READ-ONLY ───────────────────────────────────────────────────────────────
// This deactivates nothing. DELETE /api/fms/accounts/:id already deactivates
// rather than deletes any account carrying postings, so the mechanism exists
// and belongs to the accountant. This only says which ones to point it at.

const mongoose = require('mongoose');

const smsClient = require('../../client/smsClient');
const mapper = require('../ingest/accountMapper');
const payrollMapping = require('../ingest/payrollMapping');
const admissionIngest = require('../ingest/admissionIngestService');
const { FmsAccount, FmsLedgerEntry } = require('../../models/core');
const { FmsAccountMapping } = require('../../models/integration');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Accounts a mapper names but which no live code path can reach.
 *
 * Being listed in a constant is not the same as being reachable. 4108 is in
 * accountMapper as LATE_FEE_CODE, guarded by `payment.isLateFee` — and nothing
 * anywhere sets that flag. normalise() does not produce it, so the branch is
 * dead and the account is stranded.
 */
const KNOWN_BLOCKED = {
  4108: {
    reason: 'accountMapper reaches this only when a payment carries isLateFee, and no ingest '
      + 'ever sets that flag — normalise() does not produce it. The branch is unreachable.',
    remedy: 'Either set isLateFee in feeIngestService.normalise() when the source marks a '
      + 'payment as a late fee, or deactivate the account. Leaving it is the bad option: it '
      + 'reads zero, which looks like "no late fees" rather than "not measurable".',
  },
  4105: {
    reason: 'Library fines are computed on return (BookIssue.lateFee) but never collected — '
      + 'no paid flag, no receipt, no payment record. Nothing exists to import.',
    remedy: 'Deactivate, unless the school starts recording library fine collection. A fee '
      + "type with category 'library' in the fee module would feed this account instead, "
      + 'with no code change.',
  },
};

/** Fee categories the mapper can route, and the account each lands in. */
const FEE_CATEGORY_CODES = {
  tuition: '4101', exam: '4102', transport: '4103',
  uniform: '4104', library: '4105', sports: '4106', other: '4107',
};

/**
 * Which SMS fee categories actually exist? A category with no fee type behind
 * it can never appear on a payment, so its account cannot be fed either.
 */
async function fetchFeeCategories() {
  try {
    const raw = await smsClient.get('/fees/types');
    const types = Array.isArray(raw) ? raw : (raw?.data || []);
    return {
      reachable: true,
      categories: new Set(types.filter((t) => t.isActive !== false).map((t) => t.category)),
      typeCount: types.length,
    };
  } catch (err) {
    // Not fatal. Without this the fee-income verdicts are unknown rather than
    // wrong, which is the honest degradation.
    return { reachable: false, categories: new Set(), typeCount: 0, error: err.message };
  }
}

/** Build code → how it gets fed. */
function buildFeeders({ feeCategories, expenseMappedCodes, explicitCodes }) {
  const feeders = new Map();
  const add = (code, source, detail) => {
    if (!code) return;
    const list = feeders.get(code) || [];
    list.push({ source, detail });
    feeders.set(code, list);
  };

  // Money received into
  add('1101', 'fee / admission ingest', 'cash receipts');
  add('1201', 'fee ingest', 'bank and cheque receipts');
  add('1202', 'fee ingest', 'online and UPI receipts, held in clearing until settled');

  // Fee income, but only where a fee type of that category actually exists
  for (const [category, code] of Object.entries(FEE_CATEGORY_CODES)) {
    if (feeCategories.has(category)) {
      add(code, 'fee ingest', `fee types with category '${category}'`);
    }
  }
  add('4109', 'fee ingest', 'payments carrying no fee type, flagged for reclassification');

  // Admission
  add(admissionIngest.ADMISSION_INCOME_CODE, 'admission ingest', 'registration fees');
  add(admissionIngest.OTHER_FEE_INCOME_CODE, 'admission ingest',
    'registration fees, when no dedicated account exists');

  // Payroll
  for (const [component, code] of Object.entries(payrollMapping.COMPONENT_CODES)) {
    add(code, 'payroll ingest', `salary slip ${component}`);
  }

  // Expenses reach whatever their category is mapped to — entirely data-driven.
  for (const code of expenseMappedCodes) add(code, 'expense ingest', 'mapped expense category');

  // Anything an explicit mapping row points at.
  for (const code of explicitCodes) add(code, 'account mapping', 'explicit mapping configured');

  return feeders;
}

/**
 * Walk the chart.
 *
 * @returns {Promise<object>} a verdict per account, plus the A3 finding
 */
async function build(school) {
  const startedAt = new Date();

  const [accounts, mappings, feeInfo] = await Promise.all([
    FmsAccount.find({ school: oid(school), status: 'active' })
      .select('_id accountCode accountName accountType isPostable status').lean(),
    FmsAccountMapping.find({ school: oid(school), isActive: true })
      .select('mappingType accountCode').lean(),
    fetchFeeCategories(),
  ]);

  const expenseMappedCodes = mappings
    .filter((m) => m.mappingType === 'expenseCategory').map((m) => m.accountCode);
  const explicitCodes = mappings.map((m) => m.accountCode);

  const feeders = buildFeeders({
    feeCategories: feeInfo.categories, expenseMappedCodes, explicitCodes,
  });

  // Has anything ever actually posted here?
  const used = await FmsLedgerEntry.aggregate([
    { $match: { school: oid(school) } },
    { $group: { _id: '$account', entries: { $sum: 1 } } },
  ]);
  const entriesByAccount = new Map(used.map((u) => [String(u._id), u.entries]));

  const rows = accounts
    .filter((a) => a.isPostable)
    .map((a) => {
      const code = a.accountCode;
      const fed = feeders.get(code) || [];
      const entries = entriesByAccount.get(String(a._id)) || 0;
      const blocked = KNOWN_BLOCKED[code];

      let verdict;
      if (blocked && fed.length === 0) verdict = 'blocked';
      else if (fed.length > 0 && entries > 0) verdict = 'active';
      else if (fed.length > 0) verdict = 'awaiting';
      else if (entries > 0) verdict = 'manualOnly';
      else verdict = 'unreachable';

      return {
        accountCode: code,
        accountName: a.accountName,
        accountType: a.accountType,
        entries,
        automaticFeeds: fed,
        verdict,
        reason: blocked?.reason,
        remedy: blocked?.remedy,
      };
    })
    .sort((x, y) => x.accountCode.localeCompare(y.accountCode));

  const byVerdict = (v) => rows.filter((r) => r.verdict === v);

  return {
    ranAt: startedAt,
    readOnly: true,

    accountsExamined: rows.length,
    feeTypesReadable: feeInfo.reachable,
    feeTypeCount: feeInfo.typeCount,
    feeCategoriesInUse: [...feeInfo.categories].sort(),
    feeTypeReadError: feeInfo.error,

    counts: {
      active: byVerdict('active').length,
      awaiting: byVerdict('awaiting').length,
      manualOnly: byVerdict('manualOnly').length,
      unreachable: byVerdict('unreachable').length,
      blocked: byVerdict('blocked').length,
    },

    // The ones that matter. An account here reads zero forever and looks like a
    // fact while doing it.
    blocked: byVerdict('blocked'),

    // Never posted to and nothing automatic points at them. Usually legitimate —
    // most balance sheet accounts are journal-voucher territory — so this is a
    // list to skim, not a defect list.
    unreachable: byVerdict('unreachable'),

    accounts: rows,

    libraryFines: {
      finding: 'Library fines are computed on return and stored on BookIssue.lateFee. There is '
        + 'no payment step, no receipt and no record of whether the fine was ever paid.',
      soNothingCanBeImported: true,
      recommendation: 'Deactivate 4105 Library Fee Income and 4108 Late Fee Income unless the '
        + 'school decides to start recording fine collection. An account that exists and can '
        + 'never be fed misreports as a zero.',
      separateIssue: 'GET /api/library/stats returns the sum of BookIssue.lateFee under the key '
        + '`lateFeeCollected`. That field is a charge, not a receipt — the library screen is '
        + 'reporting money as collected that may never have been received. This is an SMS '
        + 'reporting defect, independent of the accounts.',
      howToDeactivate: 'DELETE /api/fms/accounts/:id already deactivates rather than deletes any '
        + 'account carrying postings. Nothing new is needed, and nothing is done here.',
    },
  };
}

module.exports = { build, KNOWN_BLOCKED, FEE_CATEGORY_CODES };
