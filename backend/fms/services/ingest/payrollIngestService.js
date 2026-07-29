// backend/fms/services/ingest/payrollIngestService.js
//
// Payroll → FMS. Per docs/discovery/04_integration_plan.md §3.
//
// ─── WHAT THIS POSTS (option (a), §3.1) ──────────────────────────────────────
//     Dr  5101 Salary & Wages Expense       gross
//         Cr  2101 Salary Payable                   net
//         Cr  2102 PF Payable                       pf
//         Cr  2103 TDS Payable                      tax
//         Cr  2104 Staff Loan Recovery              loan
//         Cr  2109 Other Deductions Payable         other
//
// ESIC and Professional Tax are NOT posted — the SMS SalarySlip has no fields
// for them (G1). Every response says so, so nobody reads the absence of
// movement on those heads as "nothing was deducted".
//
// ─── §3.5 STATUS REVERSAL ────────────────────────────────────────────────────
// A slip can move paid → pending; nothing in the SMS prevents it. If the FMS
// has already posted, the next cycle detects it and posts a REVERSAL. If it
// returns to paid later it posts fresh with a new voucher number — never an
// un-reversal, because the period in between genuinely happened.

const mongoose = require('mongoose');
const {
  FmsAccount, FmsFinancialYear, FmsAuditTrail, FmsIngestState,
} = require('../../models/core');
const { FmsPayrollPosting } = require('../../models/payroll');
const smsClient = require('../../client/smsClient');
const posting = require('../ledger/LedgerPostingService');
const pm = require('./payrollMapping');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Load the chart once per cycle. */
async function loadChart(school) {
  const accounts = await FmsAccount.find({ school, status: 'active', isPostable: true })
    .select('_id accountCode accountName accountType').lean();
  return new Map(accounts.map((a) => [a.accountCode, a]));
}

/**
 * Assess one slip without posting it — the SCR-54 review.
 *
 * Everything a person needs to decide whether to post: the components, the
 * balance check, which date was chosen and why, and what cannot be sourced.
 */
function assess(slip, byCode) {
  const teacherName = slip.teacher?.name || slip.teacherName || 'Staff member';

  const converted = pm.convertSlip(slip);
  if (!converted.ok) {
    return {
      slipId: String(slip._id), teacherName, postable: false,
      stage: 'amounts', reason: 'one or more amounts could not be converted',
      fieldErrors: converted.errors,
    };
  }

  const balance = pm.checkSlipBalance(converted.amounts);
  if (!balance.balanced) {
    return {
      slipId: String(slip._id), teacherName, postable: false,
      stage: 'balance', reason: balance.reason, balance,
      hint: 'The SMS computes gross and net in a controller with no schema guarantee. ' +
            'This slip does not reconcile and must be corrected there.',
    };
  }

  const when = pm.resolvePostingDate(slip);
  if (!when.date) {
    return {
      slipId: String(slip._id), teacherName, postable: false,
      stage: 'date', reason: when.error,
    };
  }

  const built = pm.buildLines(converted.amounts, byCode, {
    partyName: teacherName,
    party: slip.teacher?._id || slip.teacher || null,
  });
  if (!built.ok) {
    return {
      slipId: String(slip._id), teacherName, postable: false,
      stage: 'accounts', reason: built.error, missing: built.missing,
    };
  }

  return {
    slipId: String(slip._id),
    teacherName,
    postable: true,
    month: slip.month,
    year: slip.year,
    status: slip.status,
    amounts: converted.amounts,
    balance,
    postingDate: when.date,
    dateChosen: when.chosen,
    dateReason: when.reason,
    paymentDate: when.paymentDate,
    updatedAt: when.updatedAt,
    lines: built.lines,
    componentsPosted: built.componentsPosted,
    componentsUnsourced: built.componentsUnsourced,
  };
}

/** Post one assessed slip. Returns a result rather than throwing. */
async function postOne(school, slip, assessment, req) {
  const key = String(slip._id);

  const fy = await FmsFinancialYear.findOne({
    school, startDate: { $lte: assessment.postingDate }, endDate: { $gte: assessment.postingDate },
  }).lean();

  if (!fy) {
    return { slipId: key, status: 'failed', stage: 'financialYear',
      reason: `no financial year covers ${assessment.postingDate.toISOString().slice(0, 10)}` };
  }
  if (['closed', 'locked'].includes(fy.fyStatus)) {
    return { slipId: key, status: 'skipped', stage: 'financialYear',
      reason: `financial year ${fy.yearCode} is ${fy.fyStatus}` };
  }

  try {
    const result = await posting.post({
      school,
      financialYear: fy._id,
      voucherType: 'journal',
      voucherDate: assessment.postingDate,
      narration: `Payroll — ${assessment.teacherName}` +
                 (slip.month ? ` (${slip.month} ${slip.year || ''})`.trimEnd() : ''),
      source: 'payroll',
      sourceId: key,
      sourceRef: slip._id,
      postedBy: req?.user?._id,
      lines: assessment.lines,
    });

    const record = await FmsPayrollPosting.create({
      school,
      financialYear: fy._id,
      salarySlip: slip._id,
      teacher: slip.teacher?._id || slip.teacher || null,
      teacherName: assessment.teacherName,
      month: slip.month,
      year: slip.year,
      slipStatus: slip.status,
      grossAmount: assessment.amounts.gross,
      netAmount: assessment.amounts.net,
      deductions: {
        pf: assessment.amounts.pf,
        tax: assessment.amounts.tax,
        loan: assessment.amounts.loan,
        other: assessment.amounts.other,
      },
      componentsPosted: assessment.componentsPosted,
      // Recorded per §3.4 so the date choice is auditable long after the fact.
      postingDate: assessment.postingDate,
      dateChosen: assessment.dateChosen,
      sourcePaymentDate: assessment.paymentDate,
      sourceUpdatedAt: assessment.updatedAt,
      voucher: result.voucher._id,
      voucherNumber: result.voucher.voucherNumber,
      postingStatus: 'posted',
      postedBy: req?.user?._id,
      createdBy: req?.user?._id,
    });

    return {
      slipId: key, status: 'posted',
      teacherName: assessment.teacherName,
      voucherNumber: result.voucher.voucherNumber,
      gross: assessment.amounts.gross,
      lineCount: result.entries.length,
      dateChosen: assessment.dateChosen,
      payrollPosting: record._id,
    };
  } catch (err) {
    if (err.code === 'DUPLICATE_SOURCE' || err.code === 11000 ||
        /already (been )?(posted|ingested)/i.test(err.message || '')) {
      return { slipId: key, status: 'alreadyPosted', reason: 'posted in an earlier cycle' };
    }
    return { slipId: key, status: 'failed', stage: 'posting', reason: err.message, code: err.code };
  }
}

/**
 * §3.5 — a slip the FMS posted that is no longer paid.
 *
 * Reverses, and marks the posting reversed. If it becomes paid again the next
 * cycle posts it fresh: the reversal stays, because the period in which the
 * salary was un-paid genuinely happened.
 */
async function reverseUnpaid(school, slipsById, req) {
  const posted = await FmsPayrollPosting.find({
    school, postingStatus: 'posted',
  }).lean();

  const reversed = [];

  for (const p of posted) {
    const slip = slipsById.get(String(p.salarySlip));

    // A slip that has vanished entirely is a different problem — flagged, not
    // silently reversed, because deletion in the SMS may be an accident.
    if (!slip) {
      reversed.push({ slipId: String(p.salarySlip), status: 'sourceMissing',
        reason: 'posted here but no longer present in the SMS — investigate before reversing' });
      continue;
    }

    if (slip.status === 'paid') continue;

    try {
      const result = await posting.reverse(
        p.voucher, req?.user?._id,
        `Salary slip returned to '${slip.status}' after posting`
      );

      await FmsPayrollPosting.updateOne(
        { _id: p._id },
        {
          $set: {
            postingStatus: 'reversed',
            reversalVoucher: result.reversal._id,
            reversalVoucherNumber: result.reversal.voucherNumber,
            reversedAt: new Date(),
            reversedBy: req?.user?._id,
            reversalReason: `slip status is now '${slip.status}'`,
          },
        }
      );

      // No need to touch fms_ingeststate: LedgerPostingService.reverse() already
      // sets ingestStatus to 'reversed', and post() only treats 'posted' as a
      // duplicate — so a slip returning to 'paid' posts fresh, exactly as §3.5
      // requires. (An earlier version wrote `status` here, which is not the
      // field name; it would have created a stray key and left the real one
      // saying 'posted', silently blocking the re-post.)

      reversed.push({
        slipId: String(p.salarySlip), status: 'reversed',
        teacherName: p.teacherName,
        reversalVoucher: result.reversal.voucherNumber,
        newSlipStatus: slip.status,
      });
    } catch (err) {
      reversed.push({ slipId: String(p.salarySlip), status: 'reversalFailed', reason: err.message });
    }
  }

  return reversed;
}

/** Fetch and filter slips. §3.2: no status query param exists, so filter here. */
async function fetchSlips() {
  const raw = await smsClient.get('/salary');
  const all = Array.isArray(raw) ? raw : (raw?.data || []);
  return all;
}

/**
 * Run a cycle.
 * @param {boolean} [opts.dryRun]  assess and report, post nothing (SCR-54)
 */
async function sync(school, opts = {}, req) {
  const startedAt = new Date();
  const { dryRun = false } = opts;

  let slips;
  try {
    slips = await fetchSlips();
  } catch (err) {
    throw errors.conflict(
      `The SMS could not be reached: ${err.message}`,
      { hint: 'The cycle was abandoned before posting anything. It will retry on the next tick.' }
    );
  }

  const byCode = await loadChart(school);
  if (byCode.size === 0) {
    throw errors.conflict(
      'No postable accounts exist — the Chart of Accounts has not been set up',
      { hint: 'Payroll posting cannot run until the chart exists (O3).' }
    );
  }

  const slipsById = new Map(slips.map((s) => [String(s._id), s]));
  const paid = slips.filter((s) => s.status === 'paid');

  const results = [];
  const counts = { posted: 0, alreadyPosted: 0, failed: 0, skipped: 0, notPayable: 0 };

  for (const slip of paid) {
    const assessment = assess(slip, byCode);

    if (!assessment.postable) {
      counts.failed += 1;
      results.push({ ...assessment, status: 'failed' });
      continue;
    }

    if (dryRun) {
      const already = await FmsIngestState.findOne({
        school: oid(school), source: 'payroll', sourceId: String(slip._id),
        ingestStatus: 'posted',
      }).lean();
      const status = already ? 'alreadyPosted' : 'posted';
      counts[status] += 1;
      results.push({ ...assessment, status, lines: undefined });
      continue;
    }

    const r = await postOne(school, slip, assessment, req);
    counts[r.status] = (counts[r.status] || 0) + 1;
    results.push({ ...r, componentsUnsourced: assessment.componentsUnsourced });
  }

  const reversals = dryRun ? [] : await reverseUnpaid(school, slipsById, req);

  const cycle = {
    startedAt,
    finishedAt: new Date(),
    dryRun,
    sourceCounts: { totalSlips: slips.length, paidSlips: paid.length },
    counts,
    reversals,
    failures: results.filter((r) => r.status === 'failed'),
    results,
    // Stated on every cycle, not buried in a comment.
    unsourcedComponents: pm.UNSOURCED_COMPONENTS,
    note:
      'ESIC and Professional Tax are never posted from ingest — the SMS SalarySlip ' +
      'has no fields for them (G1). If the school deducts either, the amount is ' +
      'inside deductions.other and cannot be separated here.',
  };

  if (!dryRun) {
    await FmsAuditTrail.create({
      school: oid(school), entity: 'fms_payrollpostings', entityId: null,
      action: 'post',
      after: { cycle: 'payroll', counts, reversals: reversals.length },
      actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
      ipAddress: req?.ip,
    });
  }

  return cycle;
}

async function status(school) {
  const [total, reversed, recent] = await Promise.all([
    FmsPayrollPosting.countDocuments({ school, postingStatus: 'posted' }),
    FmsPayrollPosting.countDocuments({ school, postingStatus: 'reversed' }),
    FmsPayrollPosting.find({ school }).sort({ createdAt: -1 }).limit(10)
      .select('teacherName month year grossAmount voucherNumber postingStatus dateChosen').lean(),
  ]);

  const byCode = await loadChart(school);
  const required = Object.values(pm.COMPONENT_CODES);
  const missing = required.filter((c) => !byCode.has(c));

  return {
    source: 'payroll',
    postedSlips: total,
    reversedSlips: reversed,
    chartReady: missing.length === 0,
    missingAccounts: missing,
    unsourcedComponents: pm.UNSOURCED_COMPONENTS,
    recent,
    note: missing.length
      ? `Payroll cannot post until these accounts exist: ${missing.join(', ')}`
      : undefined,
  };
}

module.exports = { sync, status, assess, postOne, reverseUnpaid, loadChart };