// backend/fms/services/reports/financialStatements.test.js
//
//   node --test fms/services/reports/financialStatements.test.js
//
// These are the reports a trustee reads and an auditor checks. Amounts are
// integer PAISE, and ledger balances are Σdebit − Σcredit throughout — so a
// credit-normal account (income, liability, equity) carries a NEGATIVE balance.

const test = require('node:test');
const assert = require('node:assert');
const s = require('./financialStatements');

const R = (r) => r * 100;

/** A line as gl.trialBalance produces it. */
const line = (code, name, type, balance) => ({
  accountCode: code, accountName: name, accountType: type, balance,
});

/**
 * A small but complete set of books.
 *   Assets      cash 30,000 + bank 70,000            = 1,00,000
 *   Liabilities creditors 20,000                     =   20,000
 *   Equity      corpus 50,000                        =   50,000
 *   Income      fees 90,000                          =   90,000
 *   Expenditure salaries 50,000 + stationery 10,000  =   60,000
 *
 *   surplus = 90,000 − 60,000 = 30,000
 *   assets 1,00,000 = liabilities 20,000 + equity 50,000 + surplus 30,000  ✓
 */
const BOOKS = [
  line('1101', 'Cash in Hand', 'asset', R(30000)),
  line('1201', 'Bank — Current', 'asset', R(70000)),
  line('2201', 'Sundry Creditors', 'liability', -R(20000)),
  line('3101', 'Corpus Fund', 'equity', -R(50000)),
  line('4101', 'Tuition Fee Income', 'income', -R(90000)),
  line('5101', 'Salary Expense', 'expense', R(50000)),
  line('5201', 'Stationery', 'expense', R(10000)),
];

// ─────────────────────────────────────────────────────────────────────────────
test('signs are flipped to the natural side', async (t) => {
  await t.test('debit-normal types are unchanged', () => {
    assert.strictEqual(s.natural(R(30000), 'asset'), R(30000));
    assert.strictEqual(s.natural(R(50000), 'expense'), R(50000));
  });

  await t.test('CREDIT-NORMAL TYPES ARE FLIPPED', () => {
    // 'Tuition Fee Income: −₹90,000' is technically true and useless.
    assert.strictEqual(s.natural(-R(90000), 'income'), R(90000));
    assert.strictEqual(s.natural(-R(20000), 'liability'), R(20000));
    assert.strictEqual(s.natural(-R(50000), 'equity'), R(50000));
  });

  await t.test('an account on the wrong side keeps its sign', () => {
    // An income head with a debit balance is unusual and should LOOK unusual.
    assert.strictEqual(s.natural(R(500), 'income'), -R(500));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('profit and loss', async (t) => {
  const pl = s.profitAndLoss(BOOKS);

  await t.test('income is totalled on its natural side', () => {
    assert.strictEqual(pl.income.total, R(90000));
  });

  await t.test('expenditure likewise', () => {
    assert.strictEqual(pl.expenditure.total, R(60000));
  });

  await t.test('the surplus is income less expenditure', () => {
    assert.strictEqual(pl.surplus, R(30000));
    assert.strictEqual(pl.isDeficit, false);
  });

  await t.test("it is called a SURPLUS, not a profit", () => {
    // A school is not trying to make one, and 'profit' invites the wrong
    // question at a trustee meeting.
    assert.match(pl.label, /Surplus/);
  });

  await t.test('a deficit is labelled as one', () => {
    const poor = s.profitAndLoss([
      line('4101', 'Fees', 'income', -R(10000)),
      line('5101', 'Salaries', 'expense', R(25000)),
    ]);
    assert.strictEqual(poor.surplus, -R(15000));
    assert.strictEqual(poor.isDeficit, true);
    assert.match(poor.label, /Deficit/);
  });

  await t.test('balance sheet accounts are excluded', () => {
    const codes = [...pl.income.rows, ...pl.expenditure.rows].map((r) => r.accountCode);
    assert.ok(!codes.includes('1101'));
    assert.ok(!codes.includes('2201'));
    assert.ok(!codes.includes('3101'));
  });

  await t.test('zero-balance accounts are omitted', () => {
    const withZero = [...BOOKS, line('4109', 'Unused Income Head', 'income', 0)];
    const r = s.profitAndLoss(withZero);
    assert.ok(!r.income.rows.some((x) => x.accountCode === '4109'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('balance sheet', async (t) => {
  const bs = s.balanceSheet(BOOKS);

  await t.test('IT BALANCES', () => {
    assert.strictEqual(bs.totals.balanced, true);
    assert.strictEqual(bs.totals.difference, 0);
  });

  await t.test('assets total correctly', () => {
    assert.strictEqual(bs.totals.assets, R(100000));
  });

  await t.test('THE PERIOD SURPLUS IS CARRIED INTO EQUITY', () => {
    // Without this the sheet is out by exactly the surplus, which looks like
    // something else has gone wrong. It is the single most common way a
    // balance sheet fails to balance.
    assert.strictEqual(bs.equity.periodResult, R(30000));
    assert.strictEqual(bs.equity.total, R(80000));   // 50,000 corpus + 30,000
  });

  await t.test('and it appears as a VISIBLE LINE, not folded into a total', () => {
    const row = bs.equity.rows.find((r) => r.derived);
    assert.ok(row, 'the surplus should be its own row');
    assert.match(row.accountName, /Surplus/);
    assert.strictEqual(row.amount, R(30000));
    assert.match(row.note, /carried to equity/);
  });

  await t.test('liabilities plus equity equals assets', () => {
    assert.strictEqual(bs.totals.liabilitiesAndEquity, R(100000));
    assert.strictEqual(bs.totals.assets, bs.totals.liabilitiesAndEquity);
  });

  await t.test('WITHOUT THE SURPLUS IT WOULD NOT BALANCE', () => {
    // Demonstrating the failure the surplus line prevents.
    const withoutSurplus = bs.liabilities.total + bs.equity.openingEquity;
    assert.notStrictEqual(withoutSurplus, bs.totals.assets);
    assert.strictEqual(bs.totals.assets - withoutSurplus, R(30000));
  });

  await t.test('a deficit reduces equity', () => {
    const poor = s.balanceSheet([
      line('1101', 'Cash', 'asset', R(5000)),
      line('3101', 'Corpus', 'equity', -R(20000)),
      line('4101', 'Fees', 'income', -R(10000)),
      line('5101', 'Salaries', 'expense', R(25000)),
    ]);
    assert.strictEqual(poor.equity.periodResult, -R(15000));
    assert.strictEqual(poor.equity.total, R(5000));   // 20,000 − 15,000
    assert.strictEqual(poor.totals.balanced, true);
  });

  await t.test('an unbalanced ledger produces an unbalanced sheet AND SAYS SO', () => {
    // Reporting a difference honestly beats presenting a sheet that quietly
    // does not add up.
    const broken = s.balanceSheet([
      line('1101', 'Cash', 'asset', R(10000)),
      line('3101', 'Corpus', 'equity', -R(5000)),
    ]);
    assert.strictEqual(broken.totals.balanced, false);
    assert.strictEqual(broken.totals.difference, R(5000));
    assert.match(broken.note, /Out of balance/);
    assert.match(broken.note, /ledger itself should be checked/);
  });

  await t.test('income and expenditure do not appear on it', () => {
    const codes = [...bs.assets.rows, ...bs.liabilities.rows, ...bs.equity.rows]
      .map((r) => r.accountCode);
    assert.ok(!codes.includes('4101'));
    assert.ok(!codes.includes('5101'));
  });

  await t.test('with no activity there is no surplus row', () => {
    const quiet = s.balanceSheet([
      line('1101', 'Cash', 'asset', R(1000)),
      line('3101', 'Corpus', 'equity', -R(1000)),
    ]);
    assert.strictEqual(quiet.equity.periodResult, 0);
    assert.ok(!quiet.equity.rows.some((r) => r.derived));
    assert.strictEqual(quiet.totals.balanced, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('cash movement', async (t) => {
  const cm = s.cashMovement({
    openingCash: R(10000),
    closingCash: R(40000),
    inflows: [{ head: 'Tuition Fee Income', amount: R(50000) }],
    outflows: [
      { head: 'Salary Expense', amount: R(15000) },
      { head: 'Stationery', amount: R(5000) },
    ],
  });

  await t.test('it reconciles to the closing balance', () => {
    assert.strictEqual(cm.netMovement, R(30000));
    assert.strictEqual(cm.derivedClosing, R(40000));
    assert.strictEqual(cm.reconciles, true);
  });

  await t.test('a mismatch is reported rather than hidden', () => {
    const bad = s.cashMovement({
      openingCash: R(10000), closingCash: R(99999),
      inflows: [{ head: 'x', amount: R(1000) }], outflows: [],
    });
    assert.strictEqual(bad.reconciles, false);
  });

  await t.test('outflows are sorted largest first', () => {
    assert.strictEqual(cm.outflows.rows[0].head, 'Salary Expense');
  });

  await t.test('IT DOES NOT CLAIM TO BE A STATUTORY CASH FLOW', () => {
    // Overclaiming here would matter: a statutory indirect cash flow needs
    // opening and closing balance sheets and working-capital movements.
    assert.match(cm.note, /Not a statutory/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('cross-verification', async (t) => {
  const tb = { totals: { balanced: true, totalDebit: R(160000), totalCredit: R(160000) } };
  const bs = s.balanceSheet(BOOKS);
  const pl = s.profitAndLoss(BOOKS);

  await t.test('all three identities hold on good books', () => {
    const v = s.verify({ trialBalance: tb, balanceSheetResult: bs, profitAndLossResult: pl });
    assert.strictEqual(v.allPassed, true);
    assert.strictEqual(v.checks.length, 3);
  });

  await t.test('an unbalanced trial balance is caught', () => {
    const v = s.verify({
      trialBalance: { totals: { balanced: false, totalDebit: 1, totalCredit: 2 } },
      balanceSheetResult: bs, profitAndLossResult: pl,
    });
    assert.strictEqual(v.allPassed, false);
    assert.strictEqual(v.checks.find((c) => /Trial balance/.test(c.name)).passed, false);
  });

  await t.test('a P&L that disagrees with the sheet is caught', () => {
    const v = s.verify({
      trialBalance: tb, balanceSheetResult: bs,
      profitAndLossResult: { ...pl, surplus: R(99999) },
    });
    assert.strictEqual(v.allPassed, false);
    assert.match(v.checks.find((c) => !c.passed).name, /period result/);
  });
});