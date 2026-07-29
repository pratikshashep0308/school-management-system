// backend/fms/services/dashboard/dashboard.check.js
//
// Financial Dashboard. SRS M1.
//
//   node fms/services/dashboard/dashboard.check.js
//
// Section 2 is the P6.5 verification: every KPI must equal the figure derived
// independently from the ledger. A dashboard that disagrees with the ledger is
// worse than none, because it is the screen people glance at rather than check.

const mongoose = require('mongoose');
require('dotenv').config();

let pass = 0; let fail = 0; const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log(`  ✔ ${name}`); }
  else { fail += 1; failures.push(name); console.log(`  ✖ ${name}${detail ? '  — ' + detail : ''}`); }
}
async function throws(name, fn, match) {
  try { await fn(); ok(name, false, 'expected a throw'); }
  catch (e) {
    const text = [e.code || '', e.message || ''].join(' ');
    ok(name, !match || match.test(text), text.slice(0, 150));
  }
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set — run from backend/');
  const testUri = uri.replace(/\/([^/?]+)(\?|$)/, `/$1_fmscheck${process.pid}$2`);
  const dbName = testUri.match(/\/([^/?]+)(\?|$)/)[1];
  if (!/_fmscheck\d*$/.test(dbName)) throw new Error(`Refusing: '${dbName}'`);

  await mongoose.connect(testUri);
  const info = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!info.setName) throw new Error('Not a replica set');
  console.log(`\nDatabase: ${dbName}   replica set: ${info.setName}\n`);

  const M = require('../../models/core');
  const svc = require('./dashboardService');
  const gl = require('../ledger/ledgerQueryService');
  const posting = require('../ledger/LedgerPostingService');
  const budgetSvc = require('../budget/budgetService');
  const { FmsBudget } = require('../../models/budget');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const POSTER = new Types.ObjectId();
  const R = (r) => r * 100;
  const req = { user: { _id: POSTER } };

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  const mkG = (c, n, t, b) => M.FmsAccountGroup.create({
    school, groupCode: c, groupName: n, accountType: t, normalBalance: b });
  const mkA = (c, n, g, t, b, x = {}) => M.FmsAccount.create({
    school, accountCode: c, accountName: n, accountGroup: g._id,
    accountType: t, normalBalance: b, ...x });

  const gAsset = await mkG('1000', 'Assets', 'asset', 'debit');
  const gLia = await mkG('2000', 'Liabilities', 'liability', 'credit');
  const gInc = await mkG('4000', 'Income', 'income', 'credit');
  const gExp = await mkG('5000', 'Expenditure', 'expense', 'debit');

  const cash = await mkA('1101', 'Cash in Hand', gAsset, 'asset', 'debit', { isCashAccount: true });
  const bank = await mkA('1201', 'Bank — Current', gAsset, 'asset', 'debit', { isBankAccount: true });
  const creditors = await mkA('2201', 'Sundry Creditors', gLia, 'liability', 'credit');
  const tuition = await mkA('4101', 'Tuition Fee Income', gInc, 'income', 'credit');
  const salary = await mkA('5101', 'Salary Expense', gExp, 'expense', 'debit');
  const stationery = await mkA('5201', 'Printing & Stationery', gExp, 'expense', 'debit');

  const post = (date, lines, type = 'journal') => posting.post({
    school, financialYear: fy._id, voucherType: type,
    voucherDate: new Date(date), postedBy: POSTER, source: 'manual', lines,
  });

  // ── 1. Seed ──────────────────────────────────────────────────────────────
  console.log('1. Seeding across three months');

  await post('2026-05-10', [
    { account: cash._id, debit: R(60000), credit: 0 },
    { account: tuition._id, debit: 0, credit: R(60000) },
  ], 'receipt');
  await post('2026-06-12', [
    { account: bank._id, debit: R(30000), credit: 0 },
    { account: tuition._id, debit: 0, credit: R(30000) },
  ], 'receipt');
  await post('2026-06-30', [
    { account: salary._id, debit: R(50000), credit: 0 },
    { account: bank._id, debit: 0, credit: R(50000) },
  ], 'payment');
  // Bought on credit — an expense with NO cash movement.
  await post('2026-07-05', [
    { account: stationery._id, debit: R(10000), credit: 0 },
    { account: creditors._id, debit: 0, credit: R(10000) },
  ]);

  const tb = await gl.trialBalance(school);
  ok('the ledger balances', tb.totals.balanced);

  // ── 2. THE P6.5 VERIFICATION ─────────────────────────────────────────────
  console.log('\n2. Every KPI equals the ledger-derived figure');

  const k = await svc.kpis(school, { financialYear: String(fy._id) });

  // Derive independently from the trial balance, not from the dashboard.
  const ledgerIncome = Math.abs(tb.lines.find((l) => l.accountCode === '4101').balance);
  const ledgerSalary = tb.lines.find((l) => l.accountCode === '5101').balance;
  const ledgerStationery = tb.lines.find((l) => l.accountCode === '5201').balance;
  const ledgerCash = tb.lines.find((l) => l.accountCode === '1101').balance;
  const ledgerBank = tb.lines.find((l) => l.accountCode === '1201').balance;
  const ledgerCreditors = Math.abs(tb.lines.find((l) => l.accountCode === '2201').balance);

  ok('KPI INCOME EQUALS THE LEDGER', k.income === ledgerIncome, `${k.income} vs ${ledgerIncome}`);
  ok('KPI EXPENDITURE EQUALS THE LEDGER',
    k.expenditure === ledgerSalary + ledgerStationery,
    `${k.expenditure} vs ${ledgerSalary + ledgerStationery}`);
  ok('KPI SURPLUS IS INCOME LESS EXPENDITURE', k.surplus === k.income - k.expenditure);
  ok('and equals 30,000', k.surplus === R(30000), String(k.surplus));

  ok('KPI CASH POSITION EQUALS CASH PLUS BANK',
    k.cashPosition === ledgerCash + ledgerBank, `${k.cashPosition} vs ${ledgerCash + ledgerBank}`);
  ok('and equals 40,000', k.cashPosition === R(40000), String(k.cashPosition));
  ok('KPI PAYABLES EQUALS THE LEDGER', k.payables === ledgerCreditors);

  ok('it reports the ledger as balanced', k.ledgerBalanced === true);
  ok('and is not flagged empty', k.empty === false);

  // ── 3. Cash position ─────────────────────────────────────────────────────
  console.log('\n3. Cash position');
  const cp = await svc.cashPosition(school, {});
  ok('both accounts appear', cp.accounts.length === 2);
  ok('the total matches the KPI', cp.total === k.cashPosition);
  ok('cash and bank are separated', cp.cash === R(60000) && cp.bank === R(-20000),
    `cash=${cp.cash} bank=${cp.bank}`);
  ok('a negative CASH balance would be flagged', Array.isArray(cp.negativeCash));
  ok('last movement is recorded', cp.accounts.every((a) => !!a.lastMovement));

  // ── 4. Charts tie back ───────────────────────────────────────────────────
  console.log('\n4. Charts agree with the ledger');

  const ive = await svc.incomeVsExpense(school, { financialYear: String(fy._id) });
  ok('income vs expense totals match the KPIs',
    ive.totals.income === k.income && ive.totals.expenditure === k.expenditure,
    JSON.stringify(ive.totals));
  ok('it is broken down by month', ive.series.length === 3, String(ive.series.length));
  ok('May shows income only',
    ive.series.find((m) => m.month === '2026-05').income === R(60000) &&
    ive.series.find((m) => m.month === '2026-05').expenditure === 0);
  ok('June shows both',
    ive.series.find((m) => m.month === '2026-06').surplus === R(-20000),
    String(ive.series.find((m) => m.month === '2026-06').surplus));

  const cat = await svc.expenseByCategory(school, { financialYear: String(fy._id) });
  ok('expense categories total the same as the KPI', cat.total === k.expenditure);
  ok('salary is the largest', cat.categories[0].accountCode === '5101');
  ok('shares add to about 100', Math.abs(cat.categories.reduce((s, c) => s + c.share, 0) - 100) < 0.2);

  // ── 5. Empty states are honest ───────────────────────────────────────────
  console.log('\n5. Empty states');

  const empty = new Types.ObjectId();
  await M.FmsFinancialYear.create({
    school: empty, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  const emptyK = await svc.kpis(empty, {});
  ok('an empty school produces ZEROS, not an error', emptyK.income === 0 && emptyK.surplus === 0);
  ok('AND SAYS IT IS EMPTY', emptyK.empty === true);
  ok('naming the likely cause', /Chart of Accounts/.test(emptyK.note || ''));

  const emptyCash = await svc.cashPosition(empty, {});
  ok('cash position is empty and says so', emptyCash.empty === true);

  const noBudget = await svc.budgetUtilisation(school, { financialYear: String(fy._id) });
  ok('no active budgets reports NOTHING TO REPORT, not zero utilisation',
    noBudget.budgetCount === 0 && /nothing to report/i.test(noBudget.note || ''),
    JSON.stringify(noBudget.note));

  // ── 6. Budget utilisation once a budget exists ───────────────────────────
  console.log('\n6. Budget utilisation');
  const bud = await budgetSvc.create(school, {
    financialYear: fy._id, account: salary._id, budgetAmount: R(60000),
  }, req);
  await budgetSvc.activate(school, bud._id, req);
  svc.invalidate(school);

  const bu = await svc.budgetUtilisation(school, { financialYear: String(fy._id) });
  ok('the budget appears', bu.budgetCount === 1);
  ok('consumed matches the ledger', bu.budgets[0].consumed === ledgerSalary,
    `${bu.budgets[0].consumed} vs ${ledgerSalary}`);
  ok('utilisation is computed', Math.abs(bu.budgets[0].utilisation - 0.8333) < 0.001,
    String(bu.budgets[0].utilisation));

  // ── 7. The cache is never invisible ──────────────────────────────────────
  console.log('\n7. Caching');

  svc.invalidate(school);
  const first = await svc.kpis(school, { financialYear: String(fy._id) });
  ok('a fresh call is NOT cached', first.cached === false);
  ok('and reports how long it took', typeof first.computeMs === 'number');
  ok('with a computedAt', !!first.computedAt);

  const second = await svc.kpis(school, { financialYear: String(fy._id) });
  ok('a repeat call IS cached', second.cached === true);
  ok('AND SAYS SO, with its age', typeof second.ageSeconds === 'number');
  ok('the figures are identical', second.income === first.income);

  const live = await svc.kpis(school, { financialYear: String(fy._id), bypass: true });
  ok('bypass forces a fresh computation', live.cached === false);

  // A posting made after a cached read must be visible once invalidated —
  // otherwise the dashboard would show a stale cash position to somebody
  // about to act on it.
  await post('2026-07-20', [
    { account: cash._id, debit: R(5000), credit: 0 },
    { account: tuition._id, debit: 0, credit: R(5000) },
  ], 'receipt');

  const stale = await svc.kpis(school, { financialYear: String(fy._id) });
  ok('a cached read still shows the OLD figure', stale.income === first.income);
  ok('but is clearly marked cached', stale.cached === true);

  svc.invalidate(school);
  const fresh = await svc.kpis(school, { financialYear: String(fy._id) });
  ok('AFTER INVALIDATION THE NEW POSTING APPEARS',
    fresh.income === first.income + R(5000), `${fresh.income} vs ${first.income + R(5000)}`);

  // ── 8. Overview and guards ───────────────────────────────────────────────
  console.log('\n8. Overview');
  const ov = await svc.overview(school, { financialYear: String(fy._id) });
  ok('the overview carries the KPIs', !!ov.kpis);
  ok('and all five charts', Object.keys(ov.charts).length === 5, Object.keys(ov.charts).join(','));
  ok('and reports the worst staleness across components',
    typeof ov.maxAgeSeconds === 'number');

  await throws('an unknown financial year is refused',
    () => svc.kpis(school, { financialYear: new Types.ObjectId() }), /not found/i);

  const noFy = new Types.ObjectId();
  await throws('a school with no current year and no dates is refused',
    () => svc.kpis(noFy, {}), /period is required/i);

  // ── 9. Reporting writes nothing ──────────────────────────────────────────
  console.log('\n9. Integrity');
  const before = await M.FmsLedgerEntry.countDocuments({ school });
  await svc.overview(school, { financialYear: String(fy._id), bypass: true });
  ok('THE DASHBOARD WRITES NOTHING',
    (await M.FmsLedgerEntry.countDocuments({ school })) === before);

  const finalTb = await gl.trialBalance(school);
  ok('FINAL: debits = credits', finalTb.totals.balanced);

  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failures:'); failures.forEach((f) => console.log(`  - ${f}`)); }
  console.log(`Test database ${dbName} dropped.\n`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\nCHECK ABORTED:', err.message);
  try {
    if (mongoose.connection.readyState === 1) {
      const n = mongoose.connection.db.databaseName;
      if (/_fmscheck\d*$/.test(n)) await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  } catch (_) { /* ignore */ }
  process.exit(1);
});