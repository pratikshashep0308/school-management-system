// backend/fms/services/branch/branchService.js
//
// Multi-branch. SRS M21 / FR-M21, screen SCR-66.
//
// ─── WHAT WAS ALREADY BUILT ──────────────────────────────────────────────────
// Branch scoping is not new work. Every one of the 34 FMS collections carries a
// `school` field, `fmsAuthorize` puts the caller's branch on `req.fmsScope`,
// and every service filters on it. P6.4 does not add scoping — it PROVES it
// (branchIsolation.check.js) and adds consolidation on top.
//
// ─── AN HONEST NOTE ON SCALE ─────────────────────────────────────────────────
// The Future Step School has ONE branch. Consolidation is therefore
// infrastructure for a situation that does not yet exist, and that is worth
// saying rather than implying otherwise.
//
// The isolation proof, however, matters TODAY. With one branch a scoping bug is
// invisible — every query returns the right data because there is only one set
// of it. The day a second branch is added, the same bug is a data breach, and
// by then this code will be years old and nobody will remember which services
// were checked.
//
// ─── THE DOUBLE-COUNTING RISK ────────────────────────────────────────────────
// If branches transact with each other — head office pays a supplier on behalf
// of a campus — the same money appears as an expense in one and a liability in
// the other. Summing naively counts it twice.
//
// Inter-branch entries are therefore IDENTIFIED and reported separately rather
// than silently netted, because netting them requires knowing which side is the
// real cost, and that is an accounting judgement rather than an arithmetic one.

const mongoose = require('mongoose');
const { FmsLedgerEntry, FmsAccount, FmsFinancialYear } = require('../../models/core');
const gl = require('../ledger/ledgerQueryService');
const fs = require('../reports/financialStatements');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Which branches have FMS data.
 *
 * Derived from the ledger rather than from an SMS branch list, so it answers
 * "where has money been posted" rather than "what branches exist" — the former
 * is what a consolidated report needs.
 */
async function branchesWithActivity() {
  const rows = await FmsLedgerEntry.aggregate([
    {
      $group: {
        _id: '$school',
        entries: { $sum: 1 },
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
        firstEntry: { $min: '$entryDate' },
        lastEntry: { $max: '$entryDate' },
      },
    },
    { $sort: { entries: -1 } },
  ]);

  return rows.map((r) => ({
    school: r._id,
    entries: r.entries,
    totalDebit: r.debit,
    totalCredit: r.credit,
    balanced: r.debit === r.credit,
    firstEntry: r.firstEntry,
    lastEntry: r.lastEntry,
  }));
}

/**
 * Assert the caller may see this set of branches.
 *
 * A single-branch user consolidating across branches would be reading data they
 * cannot otherwise reach — consolidation must not become a way around scoping.
 */
function assertMayConsolidate(req, branches) {
  if (!req?.fmsScope) throw errors.forbidden('No branch scope');

  if (req.fmsScope.multiBranch) return;

  const own = String(req.fmsScope.school);
  const foreign = branches.filter((b) => String(b) !== own);

  if (foreign.length) {
    throw errors.forbidden(
      'This account is scoped to a single branch and cannot consolidate across branches',
      {
        hint: 'Consolidation requires a multi-branch role assignment.',
        requested: branches.length,
        permitted: 1,
      }
    );
  }
}

/**
 * A trial balance per branch, plus the consolidated total.
 *
 * Accounts are matched by CODE, not by _id — each branch has its own chart
 * documents, so '4101 Tuition Fee Income' in one branch is a different _id from
 * the same head in another. Consolidating on _id would produce a report listing
 * the same account several times.
 */
async function consolidatedTrialBalance(branches, { from, to, req } = {}) {
  if (!Array.isArray(branches) || branches.length === 0) {
    throw errors.badRequest('At least one branch is required');
  }
  assertMayConsolidate(req, branches);

  const perBranch = [];
  const byCode = new Map();

  for (const school of branches) {
    const tb = await gl.trialBalance(school, { from, to });
    perBranch.push({
      school,
      totals: tb.totals,
      lineCount: tb.lines.length,
    });

    for (const l of tb.lines) {
      const key = l.accountCode;
      if (!byCode.has(key)) {
        byCode.set(key, {
          accountCode: l.accountCode,
          accountName: l.accountName,
          accountType: l.accountType,
          balance: 0,
          totalDebit: 0,
          totalCredit: 0,
          branches: [],
        });
      }
      const agg = byCode.get(key);
      agg.balance += l.balance;
      agg.totalDebit += l.totalDebit;
      agg.totalCredit += l.totalCredit;
      agg.branches.push({ school, balance: l.balance });
    }
  }

  const lines = [...byCode.values()]
    .sort((a, b) => String(a.accountCode).localeCompare(String(b.accountCode)));

  const totalDebit = lines.reduce((s, l) => s + l.totalDebit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.totalCredit, 0);

  return {
    branches: perBranch,
    branchCount: branches.length,
    lines,
    totals: {
      totalDebit,
      totalCredit,
      difference: totalDebit - totalCredit,
      balanced: totalDebit === totalCredit,
    },
    // Each branch balances independently, and so must the consolidation. If a
    // branch is out on its own, consolidating hides it inside a larger number.
    everyBranchBalances: perBranch.every((b) => b.totals.balanced),
    note: 'Accounts are consolidated by CODE — each branch has its own chart documents.',
  };
}

/** Consolidated Income & Expenditure and Balance Sheet. */
async function consolidatedStatements(branches, { from, to, asAt, req } = {}) {
  const ctb = await consolidatedTrialBalance(branches, { from, to, req });

  // Position is cumulative to the as-at date; the result is the period. Same
  // rule as the single-branch statements (P6.1) — a balance sheet for a slice
  // of the year would show movement as though it were balance.
  const positionTb = await consolidatedTrialBalance(branches, { to: asAt || to, req });

  const balanceLines = positionTb.lines.filter(
    (l) => ['asset', 'liability', 'equity'].includes(l.accountType)
  );
  const resultLines = ctb.lines.filter(
    (l) => ['income', 'expense'].includes(l.accountType)
  );

  const bs = fs.balanceSheet([...balanceLines, ...resultLines], { asAt: asAt || to });
  const pl = fs.profitAndLoss(resultLines, { period: { from, to } });

  return {
    branchCount: branches.length,
    branches: ctb.branches.map((b) => b.school),
    profitAndLoss: pl,
    balanceSheet: bs,
    verification: fs.verify({
      trialBalance: positionTb,
      balanceSheetResult: bs,
      profitAndLossResult: pl,
    }),
    everyBranchBalances: ctb.everyBranchBalances,
  };
}

/**
 * Entries that look like inter-branch transactions.
 *
 * Reported, never netted automatically. Deciding which side carries the real
 * cost is an accounting judgement — a report that silently eliminates one side
 * has made that judgement on the school's behalf without saying so.
 *
 * Detection is deliberately simple: an account whose code is in the
 * inter-branch range, or an entry explicitly tagged. With one branch this
 * returns nothing, which is correct.
 */
async function interBranchEntries(branches, { from, to } = {}) {
  const match = {
    school: { $in: branches.map(oid) },
    $or: [
      { accountCode: { $regex: '^19' } },    // 19xx — inter-branch current accounts
      { isInterBranch: true },
    ],
  };
  if (from || to) {
    match.entryDate = {};
    if (from) match.entryDate.$gte = new Date(from);
    if (to) {
      const d = new Date(to); d.setUTCHours(23, 59, 59, 999);
      match.entryDate.$lte = d;
    }
  }

  const rows = await FmsLedgerEntry.find(match)
    .select('school entryDate accountCode accountName debit credit voucherNumber narration')
    .sort({ entryDate: 1 }).lean();

  const total = rows.reduce((s, r) => s + (r.debit || 0) - (r.credit || 0), 0);

  return {
    count: rows.length,
    entries: rows,
    netPosition: total,
    // If branches have settled with each other correctly, the inter-branch
    // accounts net to zero across the group. A non-zero total means one side
    // has been posted and the other has not.
    settled: total === 0,
    note: rows.length === 0
      ? 'No inter-branch entries — nothing to eliminate'
      : 'Reported, not eliminated. Which side carries the real cost is an ' +
        'accounting judgement, not an arithmetic one.',
    warning: total !== 0
      ? `Inter-branch accounts do not net to zero across the group (${total} paise) — ` +
        'one side has been posted without the other'
      : undefined,
  };
}

/** A summary for the branch switcher (SCR-66). */
async function summary(req) {
  const activity = await branchesWithActivity();

  const visible = req?.fmsScope?.multiBranch
    ? activity
    : activity.filter((a) => String(a.school) === String(req?.fmsScope?.school));

  return {
    multiBranch: !!req?.fmsScope?.multiBranch,
    currentBranch: req?.fmsScope?.school || null,
    branchesVisible: visible.length,
    branches: visible,
    note: activity.length <= 1
      ? 'Only one branch has FMS activity. Consolidation is available but has ' +
        'nothing to consolidate.'
      : undefined,
  };
}

module.exports = {
  branchesWithActivity,
  consolidatedTrialBalance,
  consolidatedStatements,
  interBranchEntries,
  assertMayConsolidate,
  summary,
};