// backend/fms/services/ingest/feeIngestService.js
//
// Fee Collection → FMS. Per docs/discovery/04_integration_plan.md §2.
//
// ─── BATCH PULL, NOT PUSH ────────────────────────────────────────────────────
// The SMS controller cannot call the FMS, so this is a cron-driven pull. The
// FMS asks the SMS what has been collected, and posts what it has not seen.
//
// ─── THE SOURCE UNION (P0.3 finding F1) ──────────────────────────────────────
//     StudentFee.paymentHistory[]  ∪  FeeAssignment.payments[]
//     keyed on receiptNumber
//
// `payAssignment` mirrors into StudentFee ONLY when a ledger already exists.
// With 441 assignments against 169 ledgers, most payments taken that way live
// in FeeAssignment.payments[] alone. Reading StudentFee only — which the DB
// Design specified — would silently under-report income by most of it.
//
// Because recordPayment writes the same receiptNumber to both, the union
// self-deduplicates for dual-written payments and recovers the rest.
//
// ─── IDEMPOTENCY ─────────────────────────────────────────────────────────────
// Not a code-level "have I seen this?" — a unique index. LedgerPostingService
// claims { school, source:'fee', sourceId: receiptNumber } in fms_ingeststate
// INSIDE the posting transaction, so a replayed cycle cannot double-post even
// if two cycles overlap.

const mongoose = require('mongoose');
const {
  FmsAccount, FmsFinancialYear, FmsAuditTrail, FmsIngestState,
} = require('../../models/core');
const { FmsIncomeVoucher } = require('../../models/income');
const { FmsAccountMapping } = require('../../models/integration');
const smsClient = require('../../client/smsClient');
const posting = require('../ledger/LedgerPostingService');
const mapper = require('./accountMapper');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Flatten the two SMS sources into one list keyed by receipt number.
 *
 * Exported and pure so it can be tested against real SMS shapes without a
 * network call.
 */
function unionPayments({ studentFees = [], assignments = [] }) {
  const byReceipt = new Map();
  const anomalies = [];

  const add = (p, source, parent) => {
    const receipt = (p.receiptNumber || '').trim();

    if (!receipt) {
      // §2.3 precondition. A blank receipt number cannot be keyed on, and
      // guessing a key would risk collapsing two real payments into one.
      anomalies.push({
        type: 'blankReceiptNumber', source,
        studentId: parent.student, amount: p.amount, paidOn: p.paidOn,
      });
      return;
    }

    const existing = byReceipt.get(receipt);
    if (existing) {
      // Expected for dual-written payments — same receipt, same money. Only
      // worth reporting if the two copies DISAGREE.
      if (existing.amount !== p.amount) {
        anomalies.push({
          type: 'receiptAmountMismatch', receiptNumber: receipt,
          amounts: [existing.amount, p.amount],
          sources: [existing.source, source],
        });
      }
      // FeeAssignment carries the fee type; StudentFee does not. Prefer the
      // richer record so the posting can be classified.
      if (source === 'feeAssignment' && !existing.feeType) {
        byReceipt.set(receipt, { ...existing, ...normalise(p, source, parent), source });
      }
      return;
    }

    byReceipt.set(receipt, normalise(p, source, parent));
  };

  for (const sf of studentFees) {
    for (const p of sf.paymentHistory || []) add(p, 'studentFee', sf);
  }
  for (const fa of assignments) {
    for (const p of fa.payments || []) add(p, 'feeAssignment', fa);
  }

  return { payments: [...byReceipt.values()], anomalies };
}

function normalise(p, source, parent) {
  return {
    receiptNumber: (p.receiptNumber || '').trim(),
    source,
    amount: p.amount,
    paidOn: p.paidOn || p.paidAt || p.date,
    method: (p.method || p.paymentMode || 'cash').toLowerCase(),
    transactionId: p.transactionId || p.referenceNumber,
    collectedBy: p.collectedBy,
    // Opaque SMS ids — stored, never joined on.
    smsStudentId: parent.student?._id || parent.student,
    studentName: parent.student?.name || parent.studentName,
    admissionNumber: parent.student?.admissionNumber || parent.admissionNumber,
    className: parent.class?.name || parent.className,
    feeType: parent.feeType?._id || parent.feeType,
    feeTypeName: parent.feeType?.name || parent.feeTypeName,
    feeCategory: parent.feeType?.category || parent.feeCategory,
    month: p.month || parent.month,
    year: p.year || parent.year,
    sourceDocId: parent._id,
    sourceSubdocId: p._id,
  };
}

/** Load the chart and mappings once per cycle rather than per payment. */
async function loadContext(school) {
  const [accounts, mappings] = await Promise.all([
    FmsAccount.find({ school, status: 'active' })
      .select('_id accountCode accountName accountType isPostable isCashAccount isBankAccount').lean(),
    FmsAccountMapping.find({ school, isActive: true })
      .select('mappingType sourceKey account accountCode').lean(),
  ]);

  return {
    byCode: new Map(accounts.filter((a) => a.isPostable).map((a) => [a.accountCode, a])),
    index: mapper.indexMappings(mappings),
    accountCount: accounts.length,
    mappingCount: mappings.length,
  };
}

/**
 * Post one payment.
 *
 * Returns a result rather than throwing, so one bad record does not abandon
 * the batch (§2.6). The failure is recorded and retried next cycle.
 */
async function postOne(school, payment, ctx, req) {
  const key = payment.receiptNumber;

  const money = mapper.toPaiseStrict(payment.amount);
  if (!money.ok) {
    return { receiptNumber: key, status: 'failed', reason: money.error, stage: 'amount' };
  }

  const paidOn = new Date(payment.paidOn);
  if (Number.isNaN(paidOn.getTime())) {
    return { receiptNumber: key, status: 'failed', reason: `invalid payment date '${payment.paidOn}'`, stage: 'date' };
  }

  const fy = await FmsFinancialYear.findOne({
    school, startDate: { $lte: paidOn }, endDate: { $gte: paidOn },
  }).lean();
  if (!fy) {
    return {
      receiptNumber: key, status: 'failed', stage: 'financialYear',
      reason: `no financial year covers ${paidOn.toISOString().slice(0, 10)}`,
    };
  }
  if (['closed', 'locked'].includes(fy.fyStatus)) {
    return {
      receiptNumber: key, status: 'skipped', stage: 'financialYear',
      reason: `financial year ${fy.yearCode} is ${fy.fyStatus}`,
    };
  }

  const debit = mapper.resolveDebitAccount(payment.method, ctx.index, ctx.byCode);
  if (debit.error) {
    return { receiptNumber: key, status: 'failed', reason: debit.error, stage: 'debitAccount', hint: debit.hint };
  }

  const credit = mapper.resolveFeeIncomeAccount(payment, ctx.index, ctx.byCode);
  if (credit.error) {
    // The case the brief singles out: an unmapped fee type must SURFACE, not
    // be absorbed by a fallback.
    return { receiptNumber: key, status: 'failed', reason: credit.error, stage: 'incomeAccount', hint: credit.hint };
  }

  const party = payment.studentName || 'Student';

  try {
    const result = await posting.post({
      school,
      financialYear: fy._id,
      voucherType: 'income',
      voucherDate: paidOn,
      narration: `Fee received — receipt ${key}` + (payment.feeTypeName ? ` (${payment.feeTypeName})` : ''),
      referenceNumber: key,
      // These two make double-posting impossible at the database.
      source: 'fee',
      sourceId: key,
      sourceModel: payment.source,
      sourceRef: payment.sourceDocId,
      postedBy: req?.user?._id,
      lines: [
        {
          account: debit.account, debit: money.paise, credit: 0,
          narration: `${payment.method}${payment.transactionId ? ' ' + payment.transactionId : ''}`,
          partyType: 'student', party: payment.smsStudentId || null, partyName: party,
        },
        {
          account: credit.account, debit: 0, credit: money.paise,
          narration: payment.feeTypeName || 'Fee income',
          partyType: 'student', party: payment.smsStudentId || null, partyName: party,
        },
      ],
    });

    const voucher = await FmsIncomeVoucher.create({
      school,
      financialYear: fy._id,
      receiptNumber: result.voucher.voucherNumber,
      receiptDate: paidOn,
      category: 'studentFee',
      amount: money.paise,
      paymentMode: ['bank', 'cheque'].includes(payment.method) ? payment.method
        : (payment.method === 'upi' ? 'upi' : (payment.method === 'online' ? 'online' : 'cash')),
      instrumentNumber: payment.transactionId,
      debitAccount: debit.account,
      debitAccountCode: debit.accountCode,
      creditAccount: credit.account,
      creditAccountCode: credit.accountCode,
      payerType: 'student',
      payerName: party,
      smsStudentId: payment.smsStudentId || null,
      admissionNumber: payment.admissionNumber,
      className: payment.className,
      narration: payment.feeTypeName || 'Fee collection',
      reference: key,
      incomeStatus: 'posted',
      voucher: result.voucher._id,
      postedBy: req?.user?._id,
      postedAt: new Date(),
      // The SMS linkage, so a receipt can be traced back to its source.
      sourceSystem: 'sms',
      sourceReceiptNumber: key,
      sourceCollection: payment.source,
      sourceDocId: payment.sourceDocId,
      needsReclassification: !!credit.needsReclassification,
      createdBy: req?.user?._id,
    });

    return {
      receiptNumber: key,
      status: 'posted',
      amount: money.paise,
      voucherNumber: result.voucher.voucherNumber,
      incomeVoucher: voucher._id,
      debitAccount: debit.accountCode,
      creditAccount: credit.accountCode,
      resolution: credit.resolution,
      needsReclassification: !!credit.needsReclassification,
      note: credit.note,
    };
  } catch (err) {
    // The idempotency guard firing is a SUCCESS, not a failure: this receipt
    // has already been posted, which is exactly what should happen on replay.
    if (err.code === 'DUPLICATE_SOURCE' || err.code === 11000 ||
        /already (been )?(posted|ingested)/i.test(err.message || '')) {
      return { receiptNumber: key, status: 'alreadyPosted', reason: 'already ingested in an earlier cycle' };
    }
    return {
      receiptNumber: key, status: 'failed', stage: 'posting',
      reason: err.message,
      code: err.code,
    };
  }
}

/**
 * Run an ingest cycle.
 *
 * @param {object} opts
 * @param {boolean} [opts.dryRun]  resolve and report, post nothing
 * @param {string}  [opts.from]    limit to payments on or after this date
 */
async function sync(school, opts = {}, req) {
  const startedAt = new Date();
  const { dryRun = false, from, to } = opts;

  let studentFees = [];
  let assignments = [];

  try {
    // smsClient.get(path, params) — params FLAT, and the path is relative to
    // the client's base URL which already carries /api. It also unwraps the
    // SMS's { success, data } envelope, so what comes back is the array.
    const [sf, fa] = await Promise.all([
      smsClient.get('/fees/students', { from, to }),
      smsClient.get('/fees/assignments', { from, to }),
    ]);
    studentFees = Array.isArray(sf) ? sf : (sf?.data || []);
    assignments = Array.isArray(fa) ? fa : (fa?.data || []);
  } catch (err) {
    // §2.6: abort the cycle. Nothing has been posted, so there is no partial
    // state to unwind — the next tick simply tries again.
    throw errors.conflict(
      `The SMS could not be reached: ${err.message}`,
      { hint: 'The cycle was abandoned before posting anything. It will retry on the next tick.' }
    );
  }

  const { payments, anomalies } = unionPayments({ studentFees, assignments });
  const ctx = await loadContext(school);

  if (ctx.byCode.size === 0) {
    throw errors.conflict(
      'No postable accounts exist — the Chart of Accounts has not been set up',
      { hint: 'Fee ingest cannot run until the chart exists (O3).' }
    );
  }

  const results = [];
  const counts = { posted: 0, alreadyPosted: 0, failed: 0, skipped: 0 };

  for (const p of payments) {
    if (dryRun) {
      const money = mapper.toPaiseStrict(p.amount);
      const debit = mapper.resolveDebitAccount(p.method, ctx.index, ctx.byCode);
      const credit = mapper.resolveFeeIncomeAccount(p, ctx.index, ctx.byCode);
      const already = await FmsIngestState.findOne({
        school: oid(school), source: 'fee', sourceId: p.receiptNumber,
      }).lean();

      const problem = !money.ok ? money.error : (debit.error || credit.error);
      const status = already ? 'alreadyPosted' : (problem ? 'failed' : 'posted');
      counts[status] += 1;
      results.push({
        receiptNumber: p.receiptNumber, status,
        amount: money.ok ? money.paise : null,
        debitAccount: debit.accountCode, creditAccount: credit.accountCode,
        resolution: credit.resolution,
        needsReclassification: !!credit.needsReclassification,
        reason: problem || undefined,
      });
      continue;
    }

    const r = await postOne(school, p, ctx, req);
    counts[r.status] = (counts[r.status] || 0) + 1;
    results.push(r);
  }

  const cycle = {
    startedAt,
    finishedAt: new Date(),
    dryRun,
    sourceCounts: {
      studentFeeLedgers: studentFees.length,
      feeAssignments: assignments.length,
      uniquePayments: payments.length,
    },
    counts,
    anomalies,
    needingReclassification: results.filter((r) => r.needsReclassification).length,
    failures: results.filter((r) => r.status === 'failed'),
    results,
  };

  if (!dryRun) {
    await FmsAuditTrail.create({
      school: oid(school), entity: 'fms_ingeststate', entityId: null,
      action: 'post',
      after: { cycle: 'fee', counts, anomalies: anomalies.length,
        durationMs: cycle.finishedAt - startedAt },
      actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
      ipAddress: req?.ip,
    });
  }

  return cycle;
}

/** What the last cycle did, and what is outstanding. */
async function status(school) {
  const [total, failed, recent] = await Promise.all([
    FmsIngestState.countDocuments({ school: oid(school), source: 'fee' }),
    FmsIngestState.countDocuments({ school: oid(school), source: 'fee', status: 'failed' }),
    FmsIngestState.find({ school: oid(school), source: 'fee' })
      .sort({ updatedAt: -1 }).limit(10)
      .select('sourceId status error updatedAt').lean(),
  ]);

  const unclassified = await FmsIncomeVoucher.countDocuments({
    school: oid(school), needsReclassification: true, incomeStatus: 'posted',
  });

  const ctx = await loadContext(school);

  return {
    source: 'fee',
    postedReceipts: total,
    failedReceipts: failed,
    needingReclassification: unclassified,
    chartReady: ctx.byCode.size > 0,
    mappingCount: ctx.mappingCount,
    recent,
    note: ctx.byCode.size === 0
      ? 'The Chart of Accounts is empty — fee ingest cannot run until it exists (O3)'
      : undefined,
  };
}

module.exports = { sync, status, postOne, unionPayments, normalise, loadContext };