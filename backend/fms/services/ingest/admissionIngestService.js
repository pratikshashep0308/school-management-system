// backend/fms/services/ingest/admissionIngestService.js
//
// A2 — registration fees taken at admission, brought into the books.
//
// ─── THE SOURCE ──────────────────────────────────────────────────────────────
// backend/models/Admission.js carries:
//
//   registrationFee: { amount, paid: Boolean, paidOn, receiptNo }
//
// That is real cash across the counter, with a receipt, and until now nothing
// in the books knew about it. Low volume — one per applicant, seasonal — but it
// is the first payment a new parent ever makes to the school.
//
// ─── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
// No new SMS endpoint, no SMS schema change, no write of any kind to the SMS.
// GET /api/admissions already returns whole documents, registrationFee included.
// The FMS reads it, posts a balanced income voucher, and records the claim.
//
// ─── THREE THINGS WORTH KNOWING BEFORE READING THE CODE ──────────────────────
//
// 1. THE KEY IS THE ADMISSION _id, NOT THE RECEIPT NUMBER.
//    registrationFee.receiptNo is optional, has no unique index, and can be
//    typed in by hand. There is exactly one registration fee per admission, so
//    the admission's own _id is the natural key: always present, unique by
//    construction, and unaffected if somebody corrects a receipt number later.
//
// 2. THE SOURCE LIST PAGINATES AT 50 AND THE CLIENT DISCARDS THE METADATA.
//    admissionController.getAdmissions defaults to limit=50, and smsClient.get
//    unwraps the envelope down to the `data` array — `total` and `pages` never
//    reach us. So paging is done blind: keep asking until a short page comes
//    back. Assuming one page would have silently ingested the 50 most recent
//    admissions and quietly ignored every other one, which is the same shape of
//    bug as the chart of accounts stopping at 25 groups.
//
// 3. THERE IS NO PAYMENT METHOD ON THE SOURCE RECORD.
//    registrationFee has no method field, so the money is assumed to have been
//    received in cash. That is nearly always true of a registration fee taken at
//    a school counter — but it is an assumption, so every posting says so in its
//    result and the console repeats it. If the school starts taking these by
//    bank transfer, this assumption has to be revisited, not quietly tolerated.

const mongoose = require('mongoose');

const smsClient = require('../../client/smsClient');
const mapper = require('./accountMapper');
const posting = require('../ledger/LedgerPostingService');
const {
  FmsAccount, FmsFinancialYear, FmsIngestState,
} = require('../../models/core');
const { FmsIncomeVoucher } = require('../../models/income');
const { FmsAccountMapping } = require('../../models/integration');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

const SOURCE = 'admission';

/** Preferred dedicated account, if the accountant has created one. */
const ADMISSION_INCOME_CODE = '4110';
/** Fallback that exists in the standard 41-account chart. */
const OTHER_FEE_INCOME_CODE = '4107';

/** Registration fees are taken in cash. See note 3 above. */
const ASSUMED_METHOD = 'cash';

const PAGE_SIZE = 200;
/** Hard stop. 50 × 200 = 10,000 admissions; well past plausible, and it means a
 *  server that ignores `page` cannot spin this forever. */
const MAX_PAGES = 50;

/**
 * Every admission, paged.
 *
 * Blind paging: the client hands back a bare array, so the only signal that the
 * end has been reached is a page shorter than the one asked for.
 */
async function fetchAdmissions() {
  const all = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let batch;
    try {
      batch = await smsClient.get('/admissions', { page, limit: PAGE_SIZE });
    } catch (err) {
      throw errors.conflict(
        `The school system could not be reached: ${err.message}`,
        { hint: 'The cycle was abandoned before posting anything. It will retry on the next run.' }
      );
    }

    const rows = Array.isArray(batch) ? batch : (batch?.data || []);
    all.push(...rows);

    if (rows.length < PAGE_SIZE) return { admissions: all, pages: page, truncated: false };
  }

  // Ran out of pages before running out of admissions. Report rather than
  // silently ingest a prefix.
  return { admissions: all, pages: MAX_PAGES, truncated: true };
}

/**
 * Keep only admissions with a registration fee actually collected, and flatten
 * them into the shape the posting step wants.
 */
function extractPaidFees(admissions) {
  const payments = [];
  const anomalies = [];

  for (const a of admissions) {
    const rf = a.registrationFee;
    if (!rf || rf.paid !== true) continue;          // not collected — nothing to post

    const amount = Number(rf.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      // Marked paid with no usable amount. Somebody ticked a box without
      // entering a figure; that needs a human, not a guess.
      anomalies.push({
        type: 'paidWithoutAmount',
        admissionId: a._id,
        applicationNumber: a.applicationNumber,
        studentName: a.studentName,
        amount: rf.amount,
      });
      continue;
    }

    if (!rf.paidOn) {
      // Without a date there is no financial year, so there is nowhere to post
      // it. Surfaced rather than defaulted to today, which would land the money
      // in the wrong year.
      anomalies.push({
        type: 'paidWithoutDate',
        admissionId: a._id,
        applicationNumber: a.applicationNumber,
        studentName: a.studentName,
        amount,
      });
      continue;
    }

    payments.push({
      admissionId: String(a._id),
      applicationNumber: a.applicationNumber || null,
      studentName: a.studentName || [a.firstName, a.lastName].filter(Boolean).join(' ') || 'Applicant',
      applyingForClass: a.applyingForClass || null,
      amount,
      paidOn: rf.paidOn,
      receiptNo: (rf.receiptNo || '').trim() || null,
      admissionStatus: a.status || null,
    });
  }

  return { payments, anomalies };
}

/** Chart lookup, once per cycle. */
async function loadContext(school) {
  const [accounts, mappings] = await Promise.all([
    FmsAccount.find({ school: oid(school), status: 'active' })
      .select('_id accountCode accountName accountType isPostable isCashAccount isBankAccount').lean(),
    // The flag on mappings is `isActive`, not `status` — querying `status` here
    // matched nothing and silently ignored every explicit mapping.
    FmsAccountMapping.find({ school: oid(school), isActive: true })
      .select('mappingType sourceKey account accountCode').lean(),
  ]);

  const byCode = new Map(accounts.filter((a) => a.isPostable).map((a) => [a.accountCode, a]));
  const index = mapper.indexMappings(mappings);

  return { byCode, index, accountCount: accounts.length };
}

/**
 * Where does a registration fee land?
 *
 * A dedicated 4110 if the accountant has created one, otherwise 4107 Other Fee
 * Income, which is in the standard chart. Deliberately NOT auto-creating 4110:
 * the chart is the accountant's document and is still awaiting sign-off (O3).
 * If they add 4110 later, this picks it up on the next cycle with no code change.
 */
function resolveIncomeAccount(byCode) {
  const dedicated = byCode.get(ADMISSION_INCOME_CODE);
  if (dedicated) {
    return { account: dedicated._id, accountCode: dedicated.accountCode, dedicated: true };
  }

  const fallback = byCode.get(OTHER_FEE_INCOME_CODE);
  if (fallback) {
    return {
      account: fallback._id,
      accountCode: fallback.accountCode,
      dedicated: false,
      note: `Posted to ${OTHER_FEE_INCOME_CODE} Other Fee Income. Create `
        + `${ADMISSION_INCOME_CODE} Admission & Registration Fee Income if these should `
        + 'be reported separately — this will use it automatically.',
    };
  }

  return {
    error: `Neither '${ADMISSION_INCOME_CODE}' nor '${OTHER_FEE_INCOME_CODE}' exists in the `
      + 'chart of accounts, so there is nowhere to record registration fee income',
    hint: 'Set up the chart of accounts first.',
  };
}

/** Post one registration fee. Failures are per-record; the cycle continues. */
async function postOne(school, p, ctx, req) {
  const key = p.admissionId;

  const money = mapper.toPaiseStrict(p.amount);
  if (!money.ok) {
    return { sourceId: key, status: 'failed', reason: money.error, stage: 'amount' };
  }

  const paidOn = new Date(p.paidOn);
  if (Number.isNaN(paidOn.getTime())) {
    return { sourceId: key, status: 'failed', reason: `invalid payment date '${p.paidOn}'`, stage: 'date' };
  }

  const fy = await FmsFinancialYear.findOne({
    school: oid(school), startDate: { $lte: paidOn }, endDate: { $gte: paidOn },
  }).lean();
  if (!fy) {
    return {
      sourceId: key, status: 'failed', stage: 'financialYear',
      reason: `no financial year covers ${paidOn.toISOString().slice(0, 10)}`,
    };
  }
  if (['closed', 'locked'].includes(fy.fyStatus)) {
    return {
      sourceId: key, status: 'skipped', stage: 'financialYear',
      reason: `financial year ${fy.yearCode} is ${fy.fyStatus}`,
    };
  }

  const debit = mapper.resolveDebitAccount(ASSUMED_METHOD, ctx.index, ctx.byCode);
  if (debit.error) {
    return { sourceId: key, status: 'failed', reason: debit.error, stage: 'debitAccount', hint: debit.hint };
  }

  const credit = resolveIncomeAccount(ctx.byCode);
  if (credit.error) {
    return { sourceId: key, status: 'failed', reason: credit.error, stage: 'incomeAccount', hint: credit.hint };
  }

  const label = p.applicationNumber
    ? `Registration fee — application ${p.applicationNumber}`
    : `Registration fee — ${p.studentName}`;

  try {
    const result = await posting.post({
      school,
      financialYear: fy._id,
      voucherType: 'income',
      voucherDate: paidOn,
      narration: label,
      referenceNumber: p.receiptNo || p.applicationNumber || key,
      // These two make double-posting impossible at the database.
      source: SOURCE,
      sourceId: key,
      sourceModel: 'Admission',
      sourceRef: oid(key),
      postedBy: req?.user?._id,
      lines: [
        {
          account: debit.account, debit: money.paise, credit: 0,
          narration: ASSUMED_METHOD,
          partyType: 'other', party: null, partyName: p.studentName,
        },
        {
          account: credit.account, debit: 0, credit: money.paise,
          narration: 'Registration fee income',
          partyType: 'other', party: null, partyName: p.studentName,
        },
      ],
    });

    const income = await FmsIncomeVoucher.create({
      school: oid(school),
      financialYear: fy._id,
      receiptNumber: result.voucher.voucherNumber,
      receiptDate: paidOn,
      category: 'admissionFee',
      amount: money.paise,
      paymentMode: ASSUMED_METHOD,
      debitAccount: debit.account,
      debitAccountCode: debit.accountCode,
      creditAccount: credit.account,
      creditAccountCode: credit.accountCode,
      payerType: 'individual',
      payerName: p.studentName,
      className: p.applyingForClass,
      narration: label,
      reference: p.receiptNo || null,
      incomeStatus: 'posted',
      voucher: result.voucher._id,
      postedBy: req?.user?._id,
      postedAt: new Date(),
      sourceSystem: 'sms',
      sourceReceiptNumber: p.receiptNo || null,
      sourceCollection: 'admissions',
      sourceDocId: oid(key),
      createdBy: req?.user?._id,
    });

    return {
      sourceId: key,
      status: 'posted',
      amount: money.paise,
      applicationNumber: p.applicationNumber,
      studentName: p.studentName,
      voucherNumber: result.voucher.voucherNumber,
      incomeVoucher: income._id,
      debitAccount: debit.accountCode,
      creditAccount: credit.accountCode,
      assumedCash: true,
      note: credit.note,
    };
  } catch (err) {
    // The idempotency guard firing is a SUCCESS, not a failure — this admission
    // has already been posted, which is exactly right on a replay.
    if (err.code === 'DUPLICATE_SOURCE' || err.code === 11000 ||
        /already (been )?(posted|ingested)/i.test(err.message || '')) {
      return { sourceId: key, status: 'alreadyPosted', reason: 'already ingested in an earlier cycle' };
    }
    return { sourceId: key, status: 'failed', reason: err.message, stage: 'posting' };
  }
}

/**
 * Run a cycle.
 *
 * @param {object} opts
 * @param {boolean} [opts.dryRun] resolve and report, write nothing
 */
async function sync(school, opts = {}, req) {
  const startedAt = new Date();
  const { dryRun = false } = opts;

  const { admissions, pages, truncated } = await fetchAdmissions();
  const { payments, anomalies } = extractPaidFees(admissions);
  const ctx = await loadContext(school);

  if (ctx.byCode.size === 0) {
    throw errors.conflict(
      'No postable accounts exist — the chart of accounts has not been set up',
      { hint: 'Registration fee import cannot run until the chart exists (O3).' }
    );
  }

  const results = [];
  const counts = { posted: 0, alreadyPosted: 0, failed: 0, skipped: 0 };

  for (const p of payments) {
    if (dryRun) {
      const money = mapper.toPaiseStrict(p.amount);
      const debit = mapper.resolveDebitAccount(ASSUMED_METHOD, ctx.index, ctx.byCode);
      const credit = resolveIncomeAccount(ctx.byCode);
      const already = await FmsIngestState.findOne({
        school: oid(school), source: SOURCE, sourceId: p.admissionId,
      }).lean();

      const problem = !money.ok ? money.error : (debit.error || credit.error);
      const status = already ? 'alreadyPosted' : (problem ? 'failed' : 'posted');
      counts[status] += 1;
      results.push({
        sourceId: p.admissionId, status,
        applicationNumber: p.applicationNumber, studentName: p.studentName,
        amount: money.ok ? money.paise : null,
        creditAccount: credit.accountCode, reason: problem || undefined,
      });
      continue;
    }

    const r = await postOne(school, p, ctx, req);
    counts[r.status] = (counts[r.status] || 0) + 1;
    results.push(r);
  }

  const credit = resolveIncomeAccount(ctx.byCode);

  return {
    source: SOURCE,
    dryRun,
    startedAt,
    durationMs: Date.now() - startedAt.getTime(),
    admissionsRead: admissions.length,
    pagesFetched: pages,
    // If this is ever true the figures below are a prefix, not a total.
    sourceTruncated: truncated,
    feesFound: payments.length,
    counts,
    failures: results.filter((r) => r.status === 'failed'),
    anomalies,
    postedTo: credit.accountCode || null,
    usingDedicatedAccount: !!credit.dedicated,
    note: [
      credit.note,
      'Registration fees are posted as cash received — the school system records no '
        + 'payment method for them.',
      truncated
        ? `Stopped after ${MAX_PAGES} pages. There are more admissions than this cycle read.`
        : null,
    ].filter(Boolean).join(' '),
    results,
  };
}

/** Console header figures. */
async function status(school) {
  const [total, failed, recent] = await Promise.all([
    FmsIngestState.countDocuments({ school: oid(school), source: SOURCE, ingestStatus: 'posted' }),
    FmsIngestState.countDocuments({ school: oid(school), source: SOURCE, ingestStatus: 'failed' }),
    FmsIngestState.find({ school: oid(school), source: SOURCE })
      .sort({ updatedAt: -1 }).limit(10)
      .select('sourceId ingestStatus lastError updatedAt').lean(),
  ]);

  const ctx = await loadContext(school);
  const credit = resolveIncomeAccount(ctx.byCode);

  return {
    source: SOURCE,
    postedFees: total,
    failedRecords: failed,
    chartReady: ctx.byCode.size > 0 && !credit.error,
    incomeAccount: credit.accountCode || null,
    usingDedicatedAccount: !!credit.dedicated,
    recent,
    note: credit.error
      ? credit.error
      : (credit.dedicated
        ? null
        : `Registration fees post to ${credit.accountCode} Other Fee Income. `
          + `Create ${ADMISSION_INCOME_CODE} if they should be reported separately.`),
  };
}

module.exports = {
  sync, status, postOne, fetchAdmissions, extractPaidFees, resolveIncomeAccount,
  SOURCE, ADMISSION_INCOME_CODE, OTHER_FEE_INCOME_CODE,
};
