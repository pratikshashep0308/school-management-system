// backend/fms/services/ingest/payrollMappingReport.js
//
// B1 — deductions that were never broken out, quantified for the accountant.
//
// ─── STATUS: THE SCHEMA GAP IS CLOSED (2026-07-30) ───────────────────────────
// SalarySlip.deductions now carries `esic` and `professionalTax`, and both post
// to their own liability heads. UNSOURCED_COMPONENTS is empty.
//
// This report did not become pointless — it changed job. It now measures the
// HISTORIC pool: every slip written before the change put its whole deduction
// into `other`, and those postings are not restated. The report says how much
// is sitting in 2109 that belongs elsewhere, so the accountant can decide
// whether a reclassifying journal voucher is worth raising.
//
// It also keeps watching. If `other` starts growing again after the change,
// somebody is entering deductions in the wrong box.
//
// ─── THE GAP ─────────────────────────────────────────────────────────────────
// backend/models/Salary.js declares exactly four deduction fields:
//
//     deductions: { pf, tax, loan, other }
//
// payrollMapping.js maps the first three to real liability heads (2102 PF,
// 2103 TDS, 2104 Staff Loan) and everything else to 2109 Other Deductions
// Payable. Two statutory heads exist in the chart and can never be fed:
//
//     2105 ESIC Payable              — no `esic` field on the slip
//     2106 Professional Tax Payable  — no `professionalTax` field on the slip
//
// Professional tax is a Maharashtra state obligation. If the school deducts it,
// the money is sitting inside `deductions.other`, invisible, and the statutory
// breakdown in the books is wrong per head — while the totals still add up,
// which is what makes it hard to notice.
//
// ─── WHAT THIS DOES, AND DELIBERATELY DOES NOT DO ────────────────────────────
// It reads salary slips over REST, counts what is hiding in `other`, names the
// employees and months affected, and states the schema change that would fix
// it. Then it stops.
//
// It does NOT alter the SalarySlip schema, does not change payroll posting, and
// does not write anything anywhere. The question it exists to answer — "does
// this school actually deduct ESIC and professional tax?" — cannot be answered
// from the data. Only the accountant knows. A figure in `other` is consistent
// with professional tax, with a uniform deduction, with a canteen advance, and
// with a typo. Guessing which, and then posting to a statutory liability head on
// that guess, would be worse than the gap it replaced.
//
// So the report presents the evidence and asks. The schema change happens after
// somebody with the authority to say so has said so.

const mongoose = require('mongoose');

const smsClient = require('../../client/smsClient');
const mapping = require('./payrollMapping');
const { FmsAccount } = require('../../models/core');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** The account code `deductions.other` currently lands in. */
const OTHER_DEDUCTIONS_CODE = '2109';

/**
 * The change being proposed, expressed once so the report, the UI and any
 * future migration all read from the same statement rather than three
 * paraphrases that drift.
 */
const SCHEMA_CHANGE = {
  status: 'applied',
  appliedOn: '2026-07-30',
  file: 'backend/models/Salary.js',
  before: 'deductions: { pf, tax, loan, other }',
  after: 'deductions: { pf, tax, esic, professionalTax, loan, other }',
  alsoChanged: [
    'salaryController.pay and .update — both hand-sum the deduction fields, and a field '
      + 'missing from that sum overstates netSalary and breaks the balance assertion.',
    'pages/Salary.js — the form had ONE deduction box writing everything to `other`, so '
      + 'PF and TDS were never captured separately either. It now has a box per head.',
    "payrollMapping.js — COMPONENT_CODES gained esic '2105' and professionalTax '2106'.",
  ],
  notRestated: 'Slips written before the change keep their combined figure in `other` and '
    + 'still post to 2109. Rewriting posted vouchers is not something the books permit — '
    + 'moving that balance is a journal voucher and the accountant\'s decision.',
};

/** Pull every salary slip. `/salary` returns the full set — it does not paginate. */
async function fetchSlips() {
  try {
    const raw = await smsClient.get('/salary');
    return Array.isArray(raw) ? raw : (raw?.data || []);
  } catch (err) {
    throw errors.conflict(
      `The school system could not be reached: ${err.message}`,
      { hint: 'No report was produced. Nothing was changed.' }
    );
  }
}

/** Employee label off a populated slip, falling back sensibly. */
function employeeOf(slip) {
  const t = slip.teacher;
  if (!t) return { name: 'Unknown', employeeId: null };
  return {
    name: t.user?.name || t.name || 'Unknown',
    employeeId: t.employeeId || null,
  };
}

/**
 * Build the report.
 *
 * @param {string|ObjectId} school
 * @returns {Promise<object>} read-only findings
 */
async function build(school) {
  const startedAt = new Date();
  const slips = await fetchSlips();

  // ── Which unfeedable heads actually exist in this school's chart? ───────────
  const codes = mapping.UNSOURCED_COMPONENTS.map((c) => c.code).concat([OTHER_DEDUCTIONS_CODE]);
  const accounts = await FmsAccount.find({
    school: oid(school), accountCode: { $in: codes }, status: 'active',
  }).select('accountCode accountName').lean();
  const haveCode = new Set(accounts.map((a) => a.accountCode));

  const unsourcedHeads = mapping.UNSOURCED_COMPONENTS.map((c) => ({
    ...c,
    existsInChart: haveCode.has(c.code),
    // An account that exists and can never be fed reads as a genuine zero to
    // anyone looking at the trial balance. That is the misleading part.
    consequence: haveCode.has(c.code)
      ? `${c.code} ${c.name} will always read zero, which looks like "nothing was deducted" `
        + 'rather than "this cannot be measured".'
      : `${c.code} ${c.name} is not in the chart, so nothing is being claimed either way.`,
  }));

  // ── What is hiding in `other`? ─────────────────────────────────────────────
  const affected = [];
  const unbalanced = [];
  const byEmployee = new Map();
  let otherTotalPaise = 0;
  let convertible = 0;
  const conversionErrors = [];

  for (const slip of slips) {
    const conv = mapping.convertSlip(slip);
    if (!conv.ok) {
      conversionErrors.push({
        slipId: slip._id,
        employee: employeeOf(slip).name,
        month: slip.month, year: slip.year,
        errors: conv.errors,
      });
      continue;
    }
    convertible += 1;

    const bal = mapping.checkSlipBalance(conv.amounts);
    if (!bal.balanced) {
      unbalanced.push({
        slipId: slip._id,
        employee: employeeOf(slip).name,
        month: slip.month, year: slip.year,
        differencePaise: bal.difference,
        reason: bal.reason,
      });
    }

    const other = conv.amounts.other || 0;
    if (other > 0) {
      const emp = employeeOf(slip);
      otherTotalPaise += other;
      affected.push({
        slipId: slip._id,
        employee: emp.name,
        employeeId: emp.employeeId,
        month: slip.month,
        year: slip.year,
        status: slip.status,
        otherPaise: other,
        pfPaise: conv.amounts.pf,
        taxPaise: conv.amounts.tax,
        loanPaise: conv.amounts.loan,
        grossPaise: conv.amounts.gross,
      });

      const key = emp.employeeId || emp.name;
      const agg = byEmployee.get(key) || { employee: emp.name, employeeId: emp.employeeId, slips: 0, totalPaise: 0 };
      agg.slips += 1;
      agg.totalPaise += other;
      byEmployee.set(key, agg);
    }
  }

  affected.sort((a, b) => (b.year - a.year) || (b.month - a.month));

  // A single recurring amount per employee is the shape a statutory deduction
  // makes. A different figure every month is more likely to be ad-hoc. Not
  // proof of anything — a prompt for the right question.
  const perEmployee = [...byEmployee.values()].sort((a, b) => b.totalPaise - a.totalPaise);
  const distinctAmounts = new Set(affected.map((a) => a.otherPaise));
  const looksRecurring = affected.length >= 3 && distinctAmounts.size <= 2;

  return {
    ranAt: startedAt,
    readOnly: true,
    nothingWasChanged: true,

    slipsRead: slips.length,
    slipsConvertible: convertible,
    conversionErrors,

    unsourcedHeads,
    otherDeductionsAccount: OTHER_DEDUCTIONS_CODE,
    otherDeductionsAccountExists: haveCode.has(OTHER_DEDUCTIONS_CODE),

    affectedSlipCount: affected.length,
    otherTotalPaise,
    distinctAmountCount: distinctAmounts.size,
    looksRecurring,
    perEmployee,
    affectedSlips: affected,

    // Surfaced here because the accountant is already looking at payroll data.
    // A slip where gross ≠ net + deductions is a defect in the source, and it
    // blocks that slip from ever posting.
    unbalancedSlipCount: unbalanced.length,
    unbalancedSlips: unbalanced,

    schemaChange: SCHEMA_CHANGE,

    // The one question this report exists to put to a person.
    decisionRequired: affected.length > 0
      ? 'ESIC and professional tax now have their own fields, so new slips break down '
        + `correctly. The figures below are HISTORIC — deductions pooled into '`
        + `${OTHER_DEDUCTIONS_CODE} Other Deductions Payable' before the change. Decide with `
        + 'the accountant whether to leave that balance where it is, or raise a journal '
        + 'voucher reclassifying it into 2102/2103/2105/2106. Either is defensible; doing it '
        + 'silently is not.'
      : 'Nothing is sitting in the unnamed deductions account. New slips break every '
        + 'deduction out by head, and no historic slip needs reclassifying.',
  };
}

module.exports = { build, SCHEMA_CHANGE, OTHER_DEDUCTIONS_CODE };
