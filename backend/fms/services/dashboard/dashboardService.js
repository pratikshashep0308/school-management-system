// backend/fms/services/dashboard/dashboardService.js
//
// Financial Dashboard. SRS M1 / FR-M1, screens SCR-04..07.
//
// ─── EVERYTHING COMES FROM THE LEDGER ────────────────────────────────────────
// No figure here is stored or maintained separately. A dashboard that can
// disagree with the ledger is worse than no dashboard, because it is the screen
// people glance at rather than the one they check.
//
// ─── ON CACHING ──────────────────────────────────────────────────────────────
// The brief asks for expensive aggregates to be cached "appropriately".
//
// A cached dashboard that can be stale is a dashboard that LIES — it shows
// yesterday's cash position to somebody about to act on it today. At this
// school's data volume (roughly a thousand ledger entries) these aggregations
// take single-digit milliseconds, so a cache buys nothing and risks that.
//
// The compromise: caching exists, is short (60s), and is NEVER INVISIBLE. Every
// response carries `cached`, `computedAt` and `ageSeconds`, so anybody looking
// at a figure can see whether it is live. A cache the reader cannot detect is
// the only kind that causes harm.

const mongoose = require('mongoose');
const { FmsLedgerEntry, FmsAccount, FmsFinancialYear } = require('../../models/core');
const { FmsIncomeVoucher } = require('../../models/income');
const { FmsExpenseRequest } = require('../../models/expense');
const { FmsBudget } = require('../../models/budget');
const gl = require('../ledger/ledgerQueryService');
const budgetService = require('../budget/budgetService');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

// ─────────────────────────────────────────────────────────────────────────────
// A deliberately small cache
// ─────────────────────────────────────────────────────────────────────────────

const TTL_MS = 60 * 1000;
const cache = new Map();

function cacheKey(school, name, params) {
  return `${school}:${name}:${JSON.stringify(params || {})}`;
}

/**
 * Run `fn`, caching for 60 seconds, and always report the cache state.
 *
 * `bypass` is honoured so a caller who needs certainty can have it.
 */
async function cached(school, name, params, fn, { bypass = false } = {}) {
  const key = cacheKey(school, name, params);
  const now = Date.now();

  if (!bypass) {
    const hit = cache.get(key);
    if (hit && now - hit.at < TTL_MS) {
      return {
        ...hit.value,
        cached: true,
        computedAt: new Date(hit.at),
        ageSeconds: Math.round((now - hit.at) / 1000),
      };
    }
  }

  const started = Date.now();
  const value = await fn();
  const took = Date.now() - started;

  cache.set(key, { at: now, value });

  // Bounded so a long-running process cannot accumulate entries indefinitely.
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }

  return {
    ...value,
    cached: false,
    computedAt: new Date(now),
    ageSeconds: 0,
    computeMs: took,
  };
}

/** Clear the cache — called after anything posts. */
function invalidate(school) {
  if (!school) { cache.clear(); return { cleared: 'all' }; }
  let n = 0;
  for (const k of cache.keys()) {
    if (k.startsWith(`${school}:`)) { cache.delete(k); n += 1; }
  }
  return { cleared: n };
}

// ─────────────────────────────────────────────────────────────────────────────

async function resolveWindow(school, { financialYear, from, to }) {
  if (financialYear) {
    const fy = await FmsFinancialYear.findOne({ _id: financialYear, school: oid(school) }).lean();
    if (!fy) throw errors.notFound('Financial year');
    return { from: fy.startDate, to: fy.endDate, yearCode: fy.yearCode, financialYear: fy._id };
  }

  const current = await FmsFinancialYear.findOne({ school: oid(school), isCurrent: true }).lean();
  if (current && !from && !to) {
    return {
      from: current.startDate, to: current.endDate,
      yearCode: current.yearCode, financialYear: current._id,
    };
  }

  if (!from || !to) {
    throw errors.badRequest(
      'No current financial year is set, so a period is required',
      { hint: 'Supply financialYear, or both from and to.' }
    );
  }

  const t = new Date(to);
  t.setUTCHours(23, 59, 59, 999);
  return { from: new Date(from), to: t, yearCode: null, financialYear: null };
}

/**
 * The headline figures (SCR-04).
 *
 * Every one is derived here from the trial balance, so a KPI cannot drift from
 * the report it summarises.
 */
async function kpis(school, opts = {}) {
  return cached(school, 'kpis', opts, async () => {
    const w = await resolveWindow(school, opts);

    const [period, position] = await Promise.all([
      gl.trialBalance(school, { from: w.from, to: w.to }),
      gl.trialBalance(school, { to: w.to }),
    ]);

    const sum = (lines, types) => lines
      .filter((l) => types.includes(l.accountType))
      .reduce((s, l) => s + (['income', 'liability', 'equity'].includes(l.accountType)
        ? -l.balance : l.balance), 0);

    const income = sum(period.lines, ['income']);
    const expenditure = sum(period.lines, ['expense']);

    // Cash position is the POSITION, not the period movement — what is in hand
    // today, regardless of when it arrived.
    const cashCodes = await FmsAccount.find({
      school: oid(school),
      $or: [{ isCashAccount: true }, { isBankAccount: true }],
    }).select('accountCode').lean();
    const cashSet = new Set(cashCodes.map((a) => a.accountCode));

    const cashPosition = position.lines
      .filter((l) => cashSet.has(l.accountCode))
      .reduce((s, l) => s + l.balance, 0);

    const receivables = sum(position.lines, ['asset']) - cashPosition;
    const payables = sum(position.lines, ['liability']);

    return {
      period: { from: w.from, to: w.to, yearCode: w.yearCode },
      income,
      expenditure,
      surplus: income - expenditure,
      isDeficit: income - expenditure < 0,
      cashPosition,
      otherAssets: receivables,
      payables,
      // Stated so a reader is not left inferring it from a zero.
      ledgerBalanced: period.totals.balanced,
      entriesInPeriod: period.lines.reduce((s, l) => s + (l.entries || 0), 0),
      empty: position.lines.length === 0,
      note: position.lines.length === 0
        ? 'No postings yet — the Chart of Accounts may not be set up (O3)'
        : undefined,
    };
  }, opts);
}

/** Where the money is, account by account (SCR-05). */
async function cashPosition(school, opts = {}) {
  return cached(school, 'cashPosition', opts, async () => {
    const accounts = await FmsAccount.find({
      school: oid(school),
      $or: [{ isCashAccount: true }, { isBankAccount: true }],
      status: 'active',
    }).select('_id accountCode accountName isCashAccount isBankAccount').lean();

    if (!accounts.length) {
      return { accounts: [], total: 0, cash: 0, bank: 0, empty: true,
        note: 'No cash or bank accounts are configured' };
    }

    const balances = await FmsLedgerEntry.aggregate([
      { $match: { school: oid(school), account: { $in: accounts.map((a) => a._id) } } },
      { $group: { _id: '$account', debit: { $sum: '$debit' }, credit: { $sum: '$credit' },
        last: { $max: '$entryDate' } } },
    ]);

    const byId = new Map(balances.map((b) => [String(b._id), b]));

    const rows = accounts.map((a) => {
      const b = byId.get(String(a._id));
      return {
        accountCode: a.accountCode,
        accountName: a.accountName,
        type: a.isCashAccount ? 'cash' : 'bank',
        balance: b ? b.debit - b.credit : 0,
        lastMovement: b?.last || null,
      };
    }).sort((x, y) => y.balance - x.balance);

    return {
      accounts: rows,
      total: rows.reduce((s, r) => s + r.balance, 0),
      cash: rows.filter((r) => r.type === 'cash').reduce((s, r) => s + r.balance, 0),
      bank: rows.filter((r) => r.type === 'bank').reduce((s, r) => s + r.balance, 0),
      // A negative cash balance is physically impossible and means something is
      // mis-posted; a negative bank balance is merely an overdraft.
      negativeCash: rows.filter((r) => r.type === 'cash' && r.balance < 0),
      empty: false,
    };
  }, opts);
}

/** Income against expenditure, month by month (SCR-06). */
async function incomeVsExpense(school, opts = {}) {
  return cached(school, 'incomeVsExpense', opts, async () => {
    const w = await resolveWindow(school, opts);

    const rows = await FmsLedgerEntry.aggregate([
      { $match: { school: oid(school), entryDate: { $gte: w.from, $lte: w.to } } },
      {
        $lookup: {
          from: 'fms_accounts', localField: 'account', foreignField: '_id',
          as: 'acct', pipeline: [{ $project: { accountType: 1 } }],
        },
      },
      { $unwind: '$acct' },
      { $match: { 'acct.accountType': { $in: ['income', 'expense'] } } },
      {
        $group: {
          _id: {
            y: { $year: '$entryDate' }, m: { $month: '$entryDate' },
            type: '$acct.accountType',
          },
          debit: { $sum: '$debit' }, credit: { $sum: '$credit' },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]);

    const months = new Map();
    for (const r of rows) {
      const key = `${r._id.y}-${String(r._id.m).padStart(2, '0')}`;
      if (!months.has(key)) months.set(key, { month: key, income: 0, expenditure: 0 });
      const bucket = months.get(key);
      if (r._id.type === 'income') bucket.income += r.credit - r.debit;
      else bucket.expenditure += r.debit - r.credit;
    }

    const series = [...months.values()].map((m) => ({ ...m, surplus: m.income - m.expenditure }));

    return {
      period: { from: w.from, to: w.to },
      series,
      totals: {
        income: series.reduce((s, m) => s + m.income, 0),
        expenditure: series.reduce((s, m) => s + m.expenditure, 0),
      },
    };
  }, opts);
}

/** Fee collection over time (SCR-06). */
async function collectionTrend(school, opts = {}) {
  return cached(school, 'collectionTrend', opts, async () => {
    const w = await resolveWindow(school, opts);

    const rows = await FmsIncomeVoucher.aggregate([
      {
        $match: {
          school: oid(school), incomeStatus: 'posted',
          receiptDate: { $gte: w.from, $lte: w.to },
        },
      },
      {
        $group: {
          _id: { y: { $year: '$receiptDate' }, m: { $month: '$receiptDate' } },
          amount: { $sum: '$amount' }, receipts: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]);

    return {
      period: { from: w.from, to: w.to },
      series: rows.map((r) => ({
        month: `${r._id.y}-${String(r._id.m).padStart(2, '0')}`,
        amount: r.amount, receipts: r.receipts,
      })),
      total: rows.reduce((s, r) => s + r.amount, 0),
      receipts: rows.reduce((s, r) => s + r.receipts, 0),
    };
  }, opts);
}

/** Expenditure by head (SCR-07). */
async function expenseByCategory(school, opts = {}) {
  return cached(school, 'expenseByCategory', opts, async () => {
    const w = await resolveWindow(school, opts);
    const tb = await gl.trialBalance(school, { from: w.from, to: w.to });

    const rows = tb.lines
      .filter((l) => l.accountType === 'expense' && l.balance !== 0)
      .map((l) => ({
        accountCode: l.accountCode, accountName: l.accountName, amount: l.balance,
      }))
      .sort((a, b) => b.amount - a.amount);

    const total = rows.reduce((s, r) => s + r.amount, 0);

    return {
      period: { from: w.from, to: w.to },
      categories: rows.map((r) => ({
        ...r,
        share: total > 0 ? Math.round((r.amount / total) * 1000) / 10 : 0,
      })),
      total,
    };
  }, opts);
}

/** Budget utilisation, delegated to the budget service (SCR-07). */
async function budgetUtilisation(school, opts = {}) {
  return cached(school, 'budgetUtilisation', opts, async () => {
    const w = await resolveWindow(school, opts);

    if (!w.financialYear) {
      return { budgets: [], totals: null, note: 'Budget utilisation needs a financial year' };
    }

    const live = await FmsBudget.countDocuments({
      school: oid(school), financialYear: w.financialYear,
      budgetStatus: { $in: ['active', 'revised'] },
    });

    if (live === 0) {
      return {
        budgets: [], totals: null, budgetCount: 0,
        note: 'No active budgets for this year — nothing to report against',
      };
    }

    const result = await budgetService.budgetVsActual(school, w.financialYear, {});

    return {
      budgetCount: result.lines.length,
      budgets: result.lines
        .map((l) => ({
          accountCode: l.accountCode, accountName: l.accountName,
          budget: l.effectiveBudget, consumed: l.consumed, available: l.available,
          utilisation: l.utilisation, isOverBudget: l.isOverBudget, isNearLimit: l.isNearLimit,
        }))
        .sort((a, b) => b.utilisation - a.utilisation),
      totals: result.totals,
    };
  }, opts);
}

/** Spending by department (SCR-07). */
async function departmentSpending(school, opts = {}) {
  return cached(school, 'departmentSpending', opts, async () => {
    const w = await resolveWindow(school, opts);

    const rows = await FmsExpenseRequest.aggregate([
      {
        $match: {
          school: oid(school),
          requestDate: { $gte: w.from, $lte: w.to },
          expenseStatus: { $in: ['paymentCompleted', 'closed'] },
        },
      },
      { $group: { _id: '$department.name', amount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]);

    const total = rows.reduce((s, r) => s + r.amount, 0);

    return {
      period: { from: w.from, to: w.to },
      departments: rows.map((r) => ({
        department: r._id || 'Unattributed',
        amount: r.amount, count: r.count,
        share: total > 0 ? Math.round((r.amount / total) * 1000) / 10 : 0,
      })),
      total,
      note: 'Paid and closed expenses only — requests in the approval chain are commitments, not spending',
    };
  }, opts);
}

/** Everything the dashboard needs, in one call. */
async function overview(school, opts = {}) {
  const [k, cash, ive, trend, expenses, budgets, depts] = await Promise.all([
    kpis(school, opts),
    cashPosition(school, opts),
    incomeVsExpense(school, opts),
    collectionTrend(school, opts),
    expenseByCategory(school, opts),
    budgetUtilisation(school, opts),
    departmentSpending(school, opts),
  ]);

  return {
    kpis: k,
    cashPosition: cash,
    charts: {
      incomeVsExpense: ive,
      collectionTrend: trend,
      expenseByCategory: expenses,
      budgetUtilisation: budgets,
      departmentSpending: depts,
    },
    // The oldest component decides how stale the screen is as a whole.
    cached: [k, cash, ive, trend, expenses, budgets, depts].some((x) => x.cached),
    maxAgeSeconds: Math.max(...[k, cash, ive, trend, expenses, budgets, depts]
      .map((x) => x.ageSeconds || 0)),
  };
}

module.exports = {
  kpis, cashPosition, incomeVsExpense, collectionTrend,
  expenseByCategory, budgetUtilisation, departmentSpending, overview,
  invalidate, resolveWindow, TTL_MS,
};