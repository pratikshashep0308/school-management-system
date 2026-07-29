// backend/fms/services/reports/reportService.js
//
// Financial reports. SRS M16 / FR-M16, screens SCR-55..60.
//
// ─── SINGLE SOURCE OF TRUTH ──────────────────────────────────────────────────
// Every figure here comes from fms_ledgerentries. Nothing is stored, cached or
// maintained in parallel — a report that can disagree with the ledger is worse
// than no report, because somebody will act on it.
//
// ─── WHAT THIS DOES NOT REBUILD ──────────────────────────────────────────────
// Several reports FR-M16 lists already exist and are already tested:
//
//   Trial Balance, General Ledger   ledgerQueryService (P2.2)
//   Cash Book, Bank Book            bookService (P2.4)
//   Budget vs Actual                budgetService (P4.1)
//   Vendor Outstanding              vendorService.history (P4.2)
//
// They are exposed through /reports/* for convenience, but they are the same
// code. Duplicating them here would give two answers to the same question.

const mongoose = require('mongoose');
const { FmsLedgerEntry, FmsAccount, FmsFinancialYear } = require('../../models/core');
const { FmsIncomeVoucher } = require('../../models/income');
const gl = require('../ledger/ledgerQueryService');
const budgetService = require('../budget/budgetService');
const fs = require('./financialStatements');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Resolve a reporting window from a financial year or explicit dates. */
async function resolvePeriod(school, { financialYear, from, to }) {
  if (financialYear) {
    const fy = await FmsFinancialYear.findOne({ _id: financialYear, school: oid(school) }).lean();
    if (!fy) throw errors.notFound('Financial year');
    return {
      from: from ? new Date(from) : fy.startDate,
      to: to ? new Date(to) : fy.endDate,
      financialYear: fy._id,
      yearCode: fy.yearCode,
    };
  }

  if (!from || !to) {
    throw errors.badRequest(
      "A reporting period is required",
      { hint: 'Supply financialYear, or both from and to.' }
    );
  }
  const t = new Date(to);
  t.setUTCHours(23, 59, 59, 999);
  return { from: new Date(from), to: t, financialYear: null, yearCode: null };
}

/**
 * Trial balance lines with account types attached.
 *
 * `gl.trialBalance` already resolves types from the chart rather than from the
 * entry snapshots — deliberately, so a reclassified account reports under its
 * current type while history keeps its original code.
 */
async function trialBalanceLines(school, period) {
  const tb = await gl.trialBalance(school, {
    from: period.from, to: period.to,
    financialYear: period.financialYear || undefined,
  });
  return tb;
}

// ─────────────────────────────────────────────────────────────────────────────
// The statements
// ─────────────────────────────────────────────────────────────────────────────

async function profitAndLoss(school, opts) {
  const period = await resolvePeriod(school, opts);
  const tb = await trialBalanceLines(school, period);
  const pl = fs.profitAndLoss(tb.lines, { period });

  return { ...pl, period, sourceTotals: tb.totals };
}

/**
 * Balance Sheet.
 *
 * NOTE ON THE PERIOD: a balance sheet is a position AS AT a date, so assets,
 * liabilities and equity are taken from inception to that date — not from the
 * period start. Only the surplus is a period figure.
 *
 * Taking the whole sheet from the period start would report the period's
 * MOVEMENT in each account as though it were the balance, which is wrong and
 * would still balance.
 */
/**
 * The as-at date for a balance sheet.
 *
 * A balance sheet needs ONE date, not a range — `from` became meaningless once
 * the result window was fixed to year-to-date. Accepts `to`, or the end of a
 * named financial year, or today.
 */
async function resolveAsAt(school, { financialYear, to }) {
  if (to) {
    const d = new Date(to);
    if (Number.isNaN(d.getTime())) {
      throw errors.badRequest("'to' is not a valid date");
    }
    d.setUTCHours(23, 59, 59, 999);
    return d;
  }

  if (financialYear) {
    const fy = await FmsFinancialYear.findOne({
      _id: financialYear, school: oid(school),
    }).lean();
    if (!fy) throw errors.notFound('Financial year');
    return fy.endDate;
  }

  return new Date();
}

async function balanceSheet(school, opts) {
  const asAt = await resolveAsAt(school, opts);
  const period = { from: null, to: asAt };

  // ── The two windows, and why they differ ─────────────────────────────────
  //
  // POSITION — assets, liabilities, equity — is cumulative from inception to
  // the as-at date. That is what a balance sheet IS.
  //
  // RESULT — the surplus carried into equity — runs from the FINANCIAL YEAR
  // START to the same date. Year-to-date, not the requested period.
  //
  // An earlier version used the requested period for the result, so a sheet
  // asked for "July only" showed July's surplus against an asset position that
  // already reflected April to June. It was out by everything that happened
  // before July. A balance sheet as at a date shows the year to that date;
  // there is no such thing as a July-only balance sheet.
  const yearStart = await financialYearStart(school, period.to);

  const position = await gl.trialBalance(school, { to: period.to });
  const yearToDate = await gl.trialBalance(school, { from: yearStart, to: period.to });

  const balanceLines = position.lines.filter(
    (l) => ['asset', 'liability', 'equity'].includes(l.accountType)
  );
  const resultLines = yearToDate.lines.filter(
    (l) => ['income', 'expense'].includes(l.accountType)
  );

  const bs = fs.balanceSheet([...balanceLines, ...resultLines], { asAt: period.to });
  const pl = fs.profitAndLoss(resultLines, { period: { from: yearStart, to: period.to } });

  return {
    ...bs,
    asAt: period.to,
    resultPeriod: { from: yearStart, to: period.to },
    verification: fs.verify({
      trialBalance: position,
      balanceSheetResult: bs,
      profitAndLossResult: pl,
    }),
    note:
      'Assets, liabilities and equity are cumulative to the as-at date. The ' +
      'surplus is from the start of the financial year to the same date — a ' +
      'balance sheet shows the year to date, never a narrower slice.',
  };
}

/**
 * The start of the financial year containing a date.
 *
 * Falls back to the epoch when no year covers it, so the result becomes
 * "everything up to this date" rather than silently reporting nothing.
 */
async function financialYearStart(school, asAt) {
  const fy = await FmsFinancialYear.findOne({
    school: oid(school), startDate: { $lte: asAt }, endDate: { $gte: asAt },
  }).lean();
  return fy ? fy.startDate : new Date(0);
}

/**
 * Cash movement — where the money went.
 *
 * Built by finding every voucher that touched cash or bank, then attributing
 * the movement to the OTHER side of that voucher. That is what answers "what
 * did we spend it on", rather than "cash decreased".
 */
async function cashMovement(school, opts) {
  const period = await resolvePeriod(school, opts);

  const cashAccounts = await FmsAccount.find({
    school: oid(school),
    $or: [{ isCashAccount: true }, { isBankAccount: true }],
  }).select('_id accountCode accountName').lean();

  if (!cashAccounts.length) {
    throw errors.conflict('No cash or bank accounts are configured');
  }
  const cashIds = cashAccounts.map((a) => a._id);
  const cashIdSet = new Set(cashIds.map(String));

  const balanceAt = async (when) => {
    const [agg] = await FmsLedgerEntry.aggregate([
      { $match: { school: oid(school), account: { $in: cashIds }, entryDate: { $lte: when } } },
      { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ]);
    return (agg?.debit || 0) - (agg?.credit || 0);
  };

  const openingCash = await balanceAt(new Date(period.from.getTime() - 1));
  const closingCash = await balanceAt(period.to);

  // Vouchers touching cash in the window.
  const touched = await FmsLedgerEntry.find({
    school: oid(school), account: { $in: cashIds },
    entryDate: { $gte: period.from, $lte: period.to },
  }).select('voucher debit credit').lean();

  const voucherIds = [...new Set(touched.map((e) => String(e.voucher)))].map(oid);

  const counterparts = await FmsLedgerEntry.aggregate([
    { $match: { school: oid(school), voucher: { $in: voucherIds } } },
    {
      $group: {
        _id: { account: '$account', code: '$accountCode', name: '$accountName' },
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
      },
    },
  ]);

  const inflows = [];
  const outflows = [];

  for (const c of counterparts) {
    if (cashIdSet.has(String(c._id.account))) continue;   // the cash side itself

    // A credit on the counterpart means cash came IN (income, a loan received);
    // a debit means cash went OUT (an expense, an asset bought).
    const inAmt = c.credit - c.debit;
    if (inAmt > 0) inflows.push({ head: c._id.name, accountCode: c._id.code, amount: inAmt });
    else if (inAmt < 0) outflows.push({ head: c._id.name, accountCode: c._id.code, amount: -inAmt });
  }

  return {
    ...fs.cashMovement({ openingCash, closingCash, inflows, outflows }, { period }),
    period,
    accounts: cashAccounts.map((a) => ({ code: a.accountCode, name: a.accountName })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived operational reports
// ─────────────────────────────────────────────────────────────────────────────

/** Expenditure by department, from the expense records that carry one. */
async function departmentExpense(school, opts) {
  const period = await resolvePeriod(school, opts);
  const { FmsExpenseRequest } = require('../../models/expense');

  const rows = await FmsExpenseRequest.aggregate([
    {
      $match: {
        school: oid(school),
        requestDate: { $gte: period.from, $lte: period.to },
        expenseStatus: { $in: ['paymentCompleted', 'closed'] },
      },
    },
    {
      $group: {
        _id: { dept: '$department.name', head: '$budgetHeadCode' },
        amount: { $sum: '$totalAmount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { amount: -1 } },
  ]);

  const byDept = new Map();
  for (const r of rows) {
    const d = r._id.dept || 'Unattributed';
    if (!byDept.has(d)) byDept.set(d, { department: d, total: 0, count: 0, heads: [] });
    const entry = byDept.get(d);
    entry.total += r.amount;
    entry.count += r.count;
    entry.heads.push({ accountCode: r._id.head, amount: r.amount, count: r.count });
  }

  const departments = [...byDept.values()].sort((a, b) => b.total - a.total);

  return {
    report: 'departmentExpense',
    period,
    departments,
    total: departments.reduce((s, d) => s + d.total, 0),
    note:
      'Paid and closed expenses only. Requests still in the approval chain are ' +
      'excluded — they are commitments, not expenditure.',
  };
}

/** Fee collection by period and method. */
async function feeCollection(school, opts) {
  const period = await resolvePeriod(school, opts);

  const rows = await FmsIncomeVoucher.aggregate([
    {
      $match: {
        school: oid(school),
        receiptDate: { $gte: period.from, $lte: period.to },
        incomeStatus: 'posted',
      },
    },
    {
      $group: {
        _id: { category: '$category', mode: '$paymentMode' },
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const byCategory = new Map();
  const byMode = new Map();
  let total = 0;

  for (const r of rows) {
    total += r.amount;
    const c = r._id.category || 'unclassified';
    byCategory.set(c, (byCategory.get(c) || 0) + r.amount);
    const m = r._id.mode || 'unknown';
    byMode.set(m, (byMode.get(m) || 0) + r.amount);
  }

  const cancelled = await FmsIncomeVoucher.aggregate([
    {
      $match: {
        school: oid(school),
        receiptDate: { $gte: period.from, $lte: period.to },
        incomeStatus: 'cancelled',
      },
    },
    { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);

  const unclassified = await FmsIncomeVoucher.countDocuments({
    school: oid(school), needsReclassification: true, incomeStatus: 'posted',
  });

  return {
    report: 'feeCollection',
    period,
    total,
    byCategory: [...byCategory.entries()].map(([k, v]) => ({ category: k, amount: v }))
      .sort((a, b) => b.amount - a.amount),
    byMode: [...byMode.entries()].map(([k, v]) => ({ mode: k, amount: v }))
      .sort((a, b) => b.amount - a.amount),
    cancelled: { amount: cancelled[0]?.amount || 0, count: cancelled[0]?.count || 0 },
    needingReclassification: unclassified,
    note: 'Cancelled receipts are excluded from the total and reported separately.',
  };
}

/** Budget vs actual — delegated, not reimplemented. */
async function budgetVsActual(school, opts) {
  if (!opts.financialYear) {
    throw errors.badRequest('financialYear is required for budget vs actual');
  }
  const result = await budgetService.budgetVsActual(school, opts.financialYear, {
    departmentName: opts.department,
  });
  return { report: 'budgetVsActual', ...result };
}

/** Every report this module can produce, and where each comes from. */
function catalogue() {
  return [
    { key: 'trialBalance', name: 'Trial Balance', source: 'ledgerQueryService (P2.2)' },
    { key: 'balanceSheet', name: 'Balance Sheet', source: 'this module' },
    { key: 'profitAndLoss', name: 'Income & Expenditure', source: 'this module' },
    { key: 'cashMovement', name: 'Cash Movement', source: 'this module' },
    { key: 'generalLedger', name: 'General Ledger', source: 'ledgerQueryService (P2.2)' },
    { key: 'cashBook', name: 'Cash Book', source: 'bookService (P2.4)' },
    { key: 'bankBook', name: 'Bank Book', source: 'bookService (P2.4)' },
    { key: 'budgetVsActual', name: 'Budget vs Actual', source: 'budgetService (P4.1)' },
    { key: 'departmentExpense', name: 'Department Expense', source: 'this module' },
    { key: 'feeCollection', name: 'Fee Collection', source: 'this module' },
    { key: 'vendorOutstanding', name: 'Vendor Outstanding', source: 'vendorService (P4.2)' },
  ];
}

module.exports = {
  resolvePeriod,
  resolveAsAt,
  profitAndLoss,
  balanceSheet,
  cashMovement,
  departmentExpense,
  feeCollection,
  budgetVsActual,
  catalogue,
};