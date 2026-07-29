// backend/fms/services/branch/branchIsolation.check.js
//
// Branch isolation and consolidation. SRS M21 / FR-M21.
//
//   node fms/services/branch/branchIsolation.check.js
//
// ─── WHY THIS MATTERS NOW, WITH ONE BRANCH ───────────────────────────────────
// With a single branch a scoping bug is INVISIBLE — every query returns the
// right data because there is only one set of it. The day a second branch is
// added the same bug is a data breach, and by then this code will be years old.
//
// So this creates two branches with deliberately overlapping data — same
// account codes, same amounts, same dates — and proves every read path returns
// only its own.

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
  const testUri = uri.replace(/\/([^/?]+)(\?|$)/, '/$1_fmscheck$2');
  const dbName = testUri.match(/\/([^/?]+)(\?|$)/)[1];
  if (!dbName.endsWith('_fmscheck')) throw new Error(`Refusing: '${dbName}'`);

  await mongoose.connect(testUri);
  const info = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!info.setName) throw new Error('Not a replica set');
  console.log(`\nDatabase: ${dbName}   replica set: ${info.setName}\n`);

  const M = require('../../models/core');
  const svc = require('./branchService');
  const gl = require('../ledger/ledgerQueryService');
  const reports = require('../reports/reportService');
  const posting = require('../ledger/LedgerPostingService');
  const budgetSvc = require('../budget/budgetService');
  const { Types } = mongoose;

  // Two branches. Deliberately similar, so a leak is obvious rather than
  // plausible.
  const A = new Types.ObjectId();
  const B = new Types.ObjectId();
  const R = (r) => r * 100;

  // Every posting must be attributable — LedgerPostingService requires it.
  const POSTER = new Types.ObjectId();

  const setup = async (school, feeAmount, salaryAmount) => {
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
    const gInc = await mkG('4000', 'Income', 'income', 'credit');
    const gExp = await mkG('5000', 'Expenditure', 'expense', 'debit');

    // SAME CODES in both branches — different documents.
    const cash = await mkA('1101', 'Cash in Hand', gAsset, 'asset', 'debit', { isCashAccount: true });
    const tuition = await mkA('4101', 'Tuition Fee Income', gInc, 'income', 'credit');
    const salary = await mkA('5101', 'Salary Expense', gExp, 'expense', 'debit');

    await posting.post({
      school, financialYear: fy._id, voucherType: 'receipt',
      voucherDate: new Date('2026-05-10'), narration: 'Fees',
      source: 'manual', postedBy: POSTER, lines: [
        { account: cash._id, debit: feeAmount, credit: 0 },
        { account: tuition._id, debit: 0, credit: feeAmount },
      ],
    });

    await posting.post({
      school, financialYear: fy._id, voucherType: 'payment',
      voucherDate: new Date('2026-06-30'), narration: 'Salaries',
      source: 'manual', postedBy: POSTER, lines: [
        { account: salary._id, debit: salaryAmount, credit: 0 },
        { account: cash._id, debit: 0, credit: salaryAmount },
      ],
    });

    return { fy, cash, tuition, salary };
  };

  const a = await setup(A, R(60000), R(40000));
  const b = await setup(B, R(25000), R(15000));

  // ── 1. Isolation ─────────────────────────────────────────────────────────
  console.log('1. Each branch sees only its own');

  const tbA = await gl.trialBalance(A);
  const tbB = await gl.trialBalance(B);

  ok('branch A fee income is its own', 
    Math.abs(tbA.lines.find((l) => l.accountCode === '4101').balance) === R(60000),
    String(tbA.lines.find((l) => l.accountCode === '4101').balance));
  ok('branch B fee income is its own',
    Math.abs(tbB.lines.find((l) => l.accountCode === '4101').balance) === R(25000));
  ok('NEITHER INCLUDES THE OTHER',
    Math.abs(tbA.lines.find((l) => l.accountCode === '4101').balance) !== R(85000));

  ok('each branch balances independently', tbA.totals.balanced && tbB.totals.balanced);

  const plA = await reports.profitAndLoss(A, { financialYear: a.fy._id });
  const plB = await reports.profitAndLoss(B, { financialYear: b.fy._id });
  ok('branch A surplus is 20,000', plA.surplus === R(20000), String(plA.surplus));
  ok('branch B surplus is 10,000', plB.surplus === R(10000), String(plB.surplus));

  const bsA = await reports.balanceSheet(A, { to: '2027-03-31' });
  ok('branch A balance sheet balances', bsA.totals.balanced);
  ok('and shows only its own assets', bsA.totals.assets === R(20000), String(bsA.totals.assets));

  // Ledger reads
  const ledgerA = await gl.accountLedger(A, a.tuition._id, {}, { skip: 0, limit: 50 });
  ok('an account ledger returns only its branch entries',
    ledgerA.entries.every((e) => String(e.school) === String(A)));

  // A foreign account id must not resolve
  await throws("branch A cannot read branch B's account ledger",
    () => gl.accountLedger(A, b.tuition._id, {}, { skip: 0, limit: 50 }), /not found|Account/i);

  // Budgets
  const budA = await budgetSvc.create(A, {
    financialYear: a.fy._id, account: a.salary._id, budgetAmount: R(50000),
  }, { user: { _id: new Types.ObjectId() } });
  await budgetSvc.activate(A, budA._id, { user: { _id: new Types.ObjectId() } });

  const posA = await budgetSvc.position(A, budA._id);
  ok('a budget counts only its own branch spending',
    posA.actual === R(40000), String(posA.actual));

  const checkB = await budgetSvc.checkAvailability(B, b.salary._id, b.fy._id, R(100));
  ok("branch B does not see branch A's budget", checkB.checked === false, JSON.stringify(checkB));

  // ── 2. THE P6.4 VERIFICATION ─────────────────────────────────────────────
  console.log('\n2. Consolidation is the correct sum');

  const multi = { fmsScope: { school: A, multiBranch: true } };

  const ctb = await svc.consolidatedTrialBalance([A, B], { req: multi });
  ok('the consolidation balances', ctb.totals.balanced, JSON.stringify(ctb.totals));
  ok('and every branch balances on its own', ctb.everyBranchBalances);

  const consFees = ctb.lines.find((l) => l.accountCode === '4101');
  ok('CONSOLIDATED FEE INCOME IS THE SUM',
    Math.abs(consFees.balance) === R(85000), String(consFees.balance));
  ok('and it appears ONCE, not once per branch',
    ctb.lines.filter((l) => l.accountCode === '4101').length === 1);
  ok('with the per-branch split retained', consFees.branches.length === 2);

  const consSalary = ctb.lines.find((l) => l.accountCode === '5101');
  ok('consolidated salary is the sum', consSalary.balance === R(55000));

  const cons = await svc.consolidatedStatements([A, B], {
    from: '2026-04-01', to: '2027-03-31', req: multi,
  });
  ok('CONSOLIDATED SURPLUS IS THE SUM OF THE BRANCHES',
    cons.profitAndLoss.surplus === R(30000), String(cons.profitAndLoss.surplus));
  ok('which equals A plus B', cons.profitAndLoss.surplus === plA.surplus + plB.surplus);
  ok('the consolidated balance sheet balances', cons.balanceSheet.totals.balanced);
  ok('all three identities hold', cons.verification.allPassed);

  // ── 3. Consolidation is not a way around scoping ─────────────────────────
  console.log('\n3. Consolidation respects RBAC');

  const singleA = { fmsScope: { school: A, multiBranch: false } };

  await throws('A SINGLE-BRANCH USER CANNOT CONSOLIDATE ACROSS BRANCHES',
    () => svc.consolidatedTrialBalance([A, B], { req: singleA }),
    /single branch|cannot consolidate/i);

  const ownOnly = await svc.consolidatedTrialBalance([A], { req: singleA });
  ok('but may consolidate their own branch alone', ownOnly.totals.balanced);

  await throws('and cannot consolidate somebody else\'s branch alone',
    () => svc.consolidatedTrialBalance([B], { req: singleA }), /cannot consolidate/i);

  await throws('no scope at all is refused',
    () => svc.consolidatedTrialBalance([A], { req: {} }), /No branch scope/);

  // ── 4. Inter-branch entries ──────────────────────────────────────────────
  console.log('\n4. Inter-branch entries');

  const ib = await svc.interBranchEntries([A, B]);
  ok('with no inter-branch accounts there is nothing to eliminate', ib.count === 0);
  ok('and it says so', /nothing to eliminate/.test(ib.note));
  ok('the group nets to zero', ib.settled === true);

  // One side posted without the other — the case that would corrupt a
  // consolidation if it were silently netted.
  const gAssetA = await M.FmsAccountGroup.findOne({ school: A, groupCode: '1000' });
  const ibAcct = await M.FmsAccount.create({
    school: A, accountCode: '1901', accountName: 'Inter-branch — Campus B',
    accountGroup: gAssetA._id, accountType: 'asset', normalBalance: 'debit',
  });
  await posting.post({
    school: A, financialYear: a.fy._id, voucherType: 'journal',
    voucherDate: new Date('2026-07-01'), narration: 'Paid on behalf of Campus B',
    source: 'manual', postedBy: POSTER, lines: [
      { account: ibAcct._id, debit: R(5000), credit: 0 },
      { account: a.cash._id, debit: 0, credit: R(5000) },
    ],
  });

  const ib2 = await svc.interBranchEntries([A, B]);
  ok('an inter-branch entry IS DETECTED', ib2.count === 1);
  ok('AND IS NOT SILENTLY NETTED', /not eliminated/.test(ib2.note));
  ok('an unsettled position is flagged', ib2.settled === false);
  ok('with a warning naming the amount', /500000 paise/.test(ib2.warning || ''),
    ib2.warning);

  // ── 5. Branch discovery ──────────────────────────────────────────────────
  console.log('\n5. Branch discovery');
  const all = await svc.branchesWithActivity();
  ok('both branches are found', all.length === 2, String(all.length));
  ok('each reports balanced totals', all.every((x) => x.balanced));

  const sumMulti = await svc.summary(multi);
  ok('a multi-branch user sees both', sumMulti.branchesVisible === 2);

  const sumSingle = await svc.summary(singleA);
  ok('A SINGLE-BRANCH USER SEES ONLY THEIR OWN', sumSingle.branchesVisible === 1);
  ok('and it is theirs', String(sumSingle.branches[0].school) === String(A));

  // ── 6. Integrity ─────────────────────────────────────────────────────────
  console.log('\n6. Integrity');
  const finalA = await gl.trialBalance(A);
  const finalB = await gl.trialBalance(B);
  ok('branch A still balances', finalA.totals.balanced);
  ok('branch B still balances', finalB.totals.balanced);

  const finalCons = await svc.consolidatedTrialBalance([A, B], { req: multi });
  ok('FINAL: the consolidation balances', finalCons.totals.balanced);
  ok('and equals the sum of the parts',
    finalCons.totals.totalDebit === finalA.totals.totalDebit + finalB.totals.totalDebit,
    `${finalCons.totals.totalDebit} vs ${finalA.totals.totalDebit + finalB.totals.totalDebit}`);

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
      if (n.endsWith('_fmscheck')) await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  } catch (_) { /* ignore */ }
  process.exit(1);
});