// backend/fms/services/reports/financialStatements.js
//
// Building the statements from trial balance lines. SRS M16 / FR-M16.
//
// ─── PURE ON PURPOSE ─────────────────────────────────────────────────────────
// Given the trial balance, produce the Balance Sheet and the Profit & Loss. No
// database. These are the reports a trustee reads and an auditor checks, and
// the arithmetic that makes them hang together is worth testing exhaustively.
//
// ─── THE THING THAT MUST BE RIGHT ────────────────────────────────────────────
// A Balance Sheet balances only if the PERIOD RESULT reaches equity.
//
//     Assets = Liabilities + Equity + (Income − Expenditure)
//
// Income and expenditure are not balance-sheet items — they are the period's
// activity, and their net effect is what the school is worth more (or less) at
// the end than at the start. Omitting the surplus is the single most common way
// a Balance Sheet fails to balance, and it fails by exactly the surplus, which
// makes it look like something else has gone wrong.
//
// ─── SIGNS ───────────────────────────────────────────────────────────────────
// Ledger balances are Σdebit − Σcredit throughout. So:
//
//     asset, expense   positive when normal      (debit balances)
//     liability, income, equity   NEGATIVE when normal   (credit balances)
//
// Every figure presented to a reader is flipped to its natural side, because
// "Tuition Fee Income: −₹5,00,000" is technically true and useless.

/** Account type → which statement it belongs to. */
const STATEMENT = {
  asset: 'balanceSheet',
  liability: 'balanceSheet',
  equity: 'balanceSheet',
  income: 'profitAndLoss',
  expense: 'profitAndLoss',
};

/** Types whose natural balance is a credit, so the sign flips for display. */
const CREDIT_NORMAL = new Set(['liability', 'income', 'equity']);

/** Present a raw Σdr−Σcr figure on its natural side. */
function natural(balance, accountType) {
  return CREDIT_NORMAL.has(accountType) ? -balance : balance;
}

/**
 * Group trial balance lines into a statement section.
 *
 * @param {Array} lines  [{ accountCode, accountName, accountType, balance }]
 */
function section(lines, types) {
  const rows = lines
    .filter((l) => types.includes(l.accountType))
    .map((l) => ({
      accountCode: l.accountCode,
      accountName: l.accountName,
      accountType: l.accountType,
      amount: natural(l.balance, l.accountType),
      raw: l.balance,
    }))
    // A zero-balance account is noise on a statement. It stays in the trial
    // balance, where completeness matters more than readability.
    .filter((r) => r.amount !== 0)
    .sort((a, b) => String(a.accountCode).localeCompare(String(b.accountCode)));

  return { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
}

/**
 * Profit & Loss for a period.
 *
 * `surplus` rather than `profit`: a school is not trying to make one, and
 * calling it profit invites the wrong question at a trustee meeting.
 */
function profitAndLoss(lines, meta = {}) {
  const income = section(lines, ['income']);
  const expenditure = section(lines, ['expense']);
  const surplus = income.total - expenditure.total;

  return {
    statement: 'profitAndLoss',
    period: meta.period || null,
    income: {
      rows: income.rows,
      total: income.total,
    },
    expenditure: {
      rows: expenditure.rows,
      total: expenditure.total,
    },
    surplus,
    isDeficit: surplus < 0,
    label: surplus >= 0 ? 'Surplus for the period' : 'Deficit for the period',
    // Explicit so a reader does not have to work out which way round it is.
    summary: {
      totalIncome: income.total,
      totalExpenditure: expenditure.total,
      netResult: surplus,
    },
  };
}

/**
 * Balance Sheet as at a date.
 *
 * The period result is carried into equity as a distinct line, so a reader can
 * see WHY the two sides agree rather than being asked to trust that they do.
 */
function balanceSheet(lines, meta = {}) {
  const assets = section(lines, ['asset']);
  const liabilities = section(lines, ['liability']);
  const equity = section(lines, ['equity']);

  const pl = profitAndLoss(lines);
  const surplus = pl.surplus;

  // The line that makes it balance. Shown, not hidden inside a total.
  const equityRows = [...equity.rows];
  if (surplus !== 0) {
    equityRows.push({
      accountCode: '—',
      accountName: surplus >= 0 ? 'Surplus for the period' : 'Deficit for the period',
      accountType: 'equity',
      amount: surplus,
      derived: true,
      note: 'Income less expenditure for the period, carried to equity',
    });
  }

  const equityTotal = equity.total + surplus;
  const liabilitiesAndEquity = liabilities.total + equityTotal;
  const difference = assets.total - liabilitiesAndEquity;

  return {
    statement: 'balanceSheet',
    asAt: meta.asAt || null,
    assets: {
      rows: assets.rows,
      total: assets.total,
    },
    liabilities: {
      rows: liabilities.rows,
      total: liabilities.total,
    },
    equity: {
      rows: equityRows,
      total: equityTotal,
      openingEquity: equity.total,
      periodResult: surplus,
    },
    totals: {
      assets: assets.total,
      liabilitiesAndEquity,
      difference,
      balanced: difference === 0,
    },
    // A Balance Sheet that does not balance is not a report, it is a bug
    // report. Say which.
    note: difference === 0
      ? undefined
      : `Out of balance by ${difference} paise — the ledger itself should be checked first`,
  };
}

/**
 * Cash Flow, indirect method — but honest about which it is.
 *
 * A full indirect cash flow needs opening and closing balance sheets and
 * working-capital movements. What is built here is a MOVEMENT statement: what
 * came into and went out of cash and bank over the period, grouped by the
 * counterpart head. That answers "where did the money go", which is the
 * question people actually ask.
 *
 * Calling it a statutory cash flow statement would be overclaiming.
 */
function cashMovement({ openingCash, closingCash, inflows, outflows }, meta = {}) {
  const inTotal = inflows.reduce((s, r) => s + r.amount, 0);
  const outTotal = outflows.reduce((s, r) => s + r.amount, 0);
  const netMovement = inTotal - outTotal;
  const derivedClosing = openingCash + netMovement;

  return {
    statement: 'cashMovement',
    period: meta.period || null,
    openingCash,
    inflows: {
      rows: [...inflows].sort((a, b) => b.amount - a.amount),
      total: inTotal,
    },
    outflows: {
      rows: [...outflows].sort((a, b) => b.amount - a.amount),
      total: outTotal,
    },
    netMovement,
    closingCash,
    // Proof the statement reconciles to the ledger, computed independently.
    reconciles: derivedClosing === closingCash,
    derivedClosing,
    note:
      'A movement statement: cash and bank in and out by counterpart head. ' +
      'Not a statutory indirect cash flow, which needs opening and closing ' +
      'balance sheets and working-capital movements.',
  };
}

/**
 * Cross-check the statements against each other and against the ledger.
 *
 * Three independent identities. If any fails, the statements disagree with the
 * source and the report should not be relied on.
 */
function verify({ trialBalance, balanceSheetResult, profitAndLossResult }) {
  const checks = [];

  checks.push({
    name: 'Trial balance: total debits equal total credits',
    passed: trialBalance.totals.balanced,
    detail: { debit: trialBalance.totals.totalDebit, credit: trialBalance.totals.totalCredit },
  });

  checks.push({
    name: 'Balance sheet: assets equal liabilities plus equity',
    passed: balanceSheetResult.totals.balanced,
    detail: {
      assets: balanceSheetResult.totals.assets,
      liabilitiesAndEquity: balanceSheetResult.totals.liabilitiesAndEquity,
      difference: balanceSheetResult.totals.difference,
    },
  });

  checks.push({
    name: 'The period result in equity equals the P&L surplus',
    passed: balanceSheetResult.equity.periodResult === profitAndLossResult.surplus,
    detail: {
      inBalanceSheet: balanceSheetResult.equity.periodResult,
      inProfitAndLoss: profitAndLossResult.surplus,
    },
  });

  return {
    allPassed: checks.every((c) => c.passed),
    checks,
  };
}

module.exports = {
  STATEMENT,
  CREDIT_NORMAL,
  natural,
  section,
  profitAndLoss,
  balanceSheet,
  cashMovement,
  verify,
};