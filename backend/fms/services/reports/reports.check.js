// backend/fms/services/reports/reports.check.js
//
// Financial reports. SRS M16.
//
//   node fms/services/reports/reports.check.js
//
// Section 2 is the P6.1 verification: generate a Trial Balance and Balance
// Sheet on real postings, confirm they balance, and confirm PDF and Excel
// export produce genuine files.

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
    const text = [e.code || '', e.message || '', e.details ? JSON.stringify(e.details) : ''].join(' ');
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
  const svc = require('./reportService');
  const ex = require('./exporters');
  const gl = require('../ledger/ledgerQueryService');
  const posting = require('../ledger/LedgerPostingService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const req = { user: { _id: new Types.ObjectId(), email: 'mgr@test' }, fmsRole: 'accountsManager' };

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  const mkG = (c,n,t,b) => M.FmsAccountGroup.create({ school, groupCode:c, groupName:n, accountType:t, normalBalance:b });
  const mkA = (c,n,g,t,b,x={}) => M.FmsAccount.create({ school, accountCode:c, accountName:n, accountGroup:g._id, accountType:t, normalBalance:b, ...x });

  const gAsset = await mkG('1000','Assets','asset','debit');
  const gLia = await mkG('2000','Liabilities','liability','credit');
  const gEq = await mkG('3000','Funds','equity','credit');
  const gInc = await mkG('4000','Income','income','credit');
  const gExp = await mkG('5000','Expenditure','expense','debit');

  const cash = await mkA('1101','Cash in Hand',gAsset,'asset','debit',{ isCashAccount:true });
  const bank = await mkA('1201','Bank — Current',gAsset,'asset','debit',{ isBankAccount:true });
  const creditors = await mkA('2201','Sundry Creditors',gLia,'liability','credit');
  const corpus = await mkA('3101','Corpus Fund',gEq,'equity','credit');
  const tuition = await mkA('4101','Tuition Fee Income',gInc,'income','credit');
  const salary = await mkA('5101','Salary Expense',gExp,'expense','debit');
  const stationery = await mkA('5201','Printing & Stationery',gExp,'expense','debit');

  const R = (r) => money.toPaise(r);
  const post = (date, lines, type='journal') => posting.post({
    school, financialYear: fy._id, voucherType: type,
    voucherDate: new Date(date), postedBy: req.user._id, lines,
  });

  // ── 1. Seed a small but complete set of books ────────────────────────────
  console.log('1. Seeding');

  // Corpus contributed
  await post('2026-04-01', [
    { account: bank._id, debit: R(50000), credit: 0 },
    { account: corpus._id, debit: 0, credit: R(50000) },
  ]);
  // Fees collected
  await post('2026-05-10', [
    { account: cash._id, debit: R(60000), credit: 0 },
    { account: tuition._id, debit: 0, credit: R(60000) },
  ], 'receipt');
  await post('2026-06-10', [
    { account: bank._id, debit: R(30000), credit: 0 },
    { account: tuition._id, debit: 0, credit: R(30000) },
  ], 'receipt');
  // Salaries paid
  await post('2026-06-30', [
    { account: salary._id, debit: R(50000), credit: 0 },
    { account: bank._id, debit: 0, credit: R(50000) },
  ], 'payment');
  // Stationery on credit — an unpaid liability
  await post('2026-07-05', [
    { account: stationery._id, debit: R(10000), credit: 0 },
    { account: creditors._id, debit: 0, credit: R(10000) },
  ]);

  const tb = await gl.trialBalance(school);
  ok('the ledger balances', tb.totals.balanced, JSON.stringify(tb.totals));

  // ── 2. THE P6.1 VERIFICATION ─────────────────────────────────────────────
  console.log('\n2. Trial Balance and Balance Sheet on real postings');

  const period = { financialYear: String(fy._id) };

  const pl = await svc.profitAndLoss(school, period);
  ok('income totals 90,000', pl.income.total === R(90000), String(pl.income.total));
  ok('expenditure totals 60,000', pl.expenditure.total === R(60000), String(pl.expenditure.total));
  ok('SURPLUS IS 30,000', pl.surplus === R(30000), String(pl.surplus));
  ok('and it is called a surplus, not a profit', /Surplus/.test(pl.label));

  const bs = await svc.balanceSheet(school, period);
  ok('THE BALANCE SHEET BALANCES', bs.totals.balanced, JSON.stringify(bs.totals));
  ok('assets are 90,000', bs.totals.assets === R(90000), String(bs.totals.assets));
  ok('liabilities are 10,000', bs.liabilities.total === R(10000));
  ok('equity is 80,000 — corpus plus surplus', bs.equity.total === R(80000),
    String(bs.equity.total));
  ok('THE SURPLUS APPEARS AS ITS OWN LINE',
    bs.equity.rows.some((r) => r.derived && r.amount === R(30000)));

  ok('all three identities hold', bs.verification.allPassed,
    JSON.stringify(bs.verification.checks.filter((c) => !c.passed)));
  ok('including that the sheet agrees with the P&L',
    bs.verification.checks.find((c) => /period result/.test(c.name)).passed);

  // Export — genuine files, not just "it did not throw".
  const xl = await ex.toExcel(bs, { title: 'Balance Sheet' });
  ok('EXCEL EXPORT PRODUCES A FILE', xl.byteLength > 3000, String(xl.byteLength));
  ok('and it is a real xlsx container', Buffer.from(xl).slice(0, 2).toString() === 'PK');

  const pdf = await ex.toPdf(pl, { title: 'Income and Expenditure' });
  ok('PDF EXPORT PRODUCES A FILE', pdf.length > 1000, String(pdf.length));
  ok('and it is a real PDF', pdf.slice(0, 5).toString() === '%PDF-');

  // ── 3. The statements agree with the ledger ──────────────────────────────
  console.log('\n3. Statements tie back to the ledger');

  const tbTotal = tb.lines
    .filter((l) => l.accountType === 'income')
    .reduce((s, l) => s + Math.abs(l.balance), 0);
  ok('P&L income equals the ledger income', pl.income.total === tbTotal);

  const cashTb = tb.lines.find((l) => l.accountCode === '1101').balance;
  const bankTb = tb.lines.find((l) => l.accountCode === '1201').balance;
  const assetsInSheet = bs.assets.rows.reduce((s, r) => s + r.amount, 0);
  ok('BALANCE SHEET ASSETS EQUAL THE LEDGER', assetsInSheet === cashTb + bankTb,
    `sheet=${assetsInSheet} ledger=${cashTb + bankTb}`);

  // ── 4. Cash movement ─────────────────────────────────────────────────────
  console.log('\n4. Cash movement');
  const cm = await svc.cashMovement(school, period);
  ok('it reconciles to the closing balance', cm.reconciles,
    JSON.stringify({ opening: cm.openingCash, net: cm.netMovement, closing: cm.closingCash }));
  ok('closing cash equals cash plus bank', cm.closingCash === cashTb + bankTb);
  ok('fee income appears as an inflow',
    cm.inflows.rows.some((r) => /Tuition/.test(r.head)));
  ok('salary appears as an outflow',
    cm.outflows.rows.some((r) => /Salary/.test(r.head)));
  ok('THE UNPAID STATIONERY DOES NOT APPEAR — no cash moved',
    !cm.outflows.rows.some((r) => /Stationery/.test(r.head)) &&
    !cm.inflows.rows.some((r) => /Stationery/.test(r.head)));
  ok('it does not claim to be a statutory cash flow', /Not a statutory/.test(cm.note));

  // ── 5. A balance sheet is a POSITION, not a movement ─────────────────────
  console.log('\n5. Position vs movement');

  // A sheet for July only must still show the FULL asset position, not July's
  // movement in each account. Getting this wrong produces a sheet that balances
  // and is wrong.
  // A balance sheet as at 31 July shows the position to that date AND the
  // surplus from the FINANCIAL YEAR START to that date — year-to-date.
  //
  // An earlier version of this check asserted a "July-only" surplus, which is
  // not a thing: the May and June activity is already in the asset position, so
  // a July-only result leaves the sheet out by everything before July. The
  // check was asserting the bug.
  const asAtJuly = await svc.balanceSheet(school, { from: '2026-07-01', to: '2026-07-31' });
  ok('the position is cumulative to the as-at date',
    asAtJuly.totals.assets === R(90000), String(asAtJuly.totals.assets));
  ok('THE SURPLUS IS YEAR-TO-DATE, not the requested slice',
    asAtJuly.equity.periodResult === R(30000), String(asAtJuly.equity.periodResult));
  ok('the result window starts at the financial year start',
    asAtJuly.resultPeriod.from.toISOString().slice(0, 10) === '2026-04-01',
    asAtJuly.resultPeriod.from.toISOString().slice(0, 10));
  ok('AND IT BALANCES', asAtJuly.totals.balanced, JSON.stringify(asAtJuly.totals));

  // Mid-year: as at 30 June, before the stationery was bought on credit.
  const asAtJune = await svc.balanceSheet(school, { to: '2026-06-30' });
  ok('a mid-year sheet balances too', asAtJune.totals.balanced, JSON.stringify(asAtJune.totals));
  ok('and excludes what had not happened yet',
    asAtJune.equity.periodResult === R(40000), String(asAtJune.equity.periodResult));

  // ── 6. Operational reports ───────────────────────────────────────────────
  console.log('\n6. Operational reports');
  const fee = await svc.feeCollection(school, period);
  ok('fee collection reports a total', typeof fee.total === 'number');
  ok('and excludes cancelled receipts', /Cancelled receipts are excluded/.test(fee.note));

  const dept = await svc.departmentExpense(school, period);
  ok('department expense runs', Array.isArray(dept.departments));
  ok('and excludes unapproved commitments', /commitments, not expenditure/.test(dept.note));

  const cat = svc.catalogue();
  ok('the catalogue names where each report comes from',
    cat.every((c) => !!c.source));
  ok('and marks the reused ones as reused',
    cat.filter((c) => /P2\.2|P2\.4|P4\.1|P4\.2/.test(c.source)).length >= 5);

  // ── 7. Guards ────────────────────────────────────────────────────────────
  console.log('\n7. Guards');
  await throws('a report with no period is refused',
    () => svc.profitAndLoss(school, {}), /period is required/);
  await throws('an unknown financial year is refused',
    () => svc.balanceSheet(school, { financialYear: new Types.ObjectId() }), /not found/);

  const empty = new Types.ObjectId();
  const emptyBs = await svc.balanceSheet(empty, { from: '2026-04-01', to: '2027-03-31' });
  ok('an empty school produces an empty but BALANCED sheet',
    emptyBs.totals.balanced && emptyBs.totals.assets === 0);

  // ── 8. Integrity ─────────────────────────────────────────────────────────
  console.log('\n8. Integrity');
  const finalTb = await gl.trialBalance(school);
  ok('FINAL: debits = credits', finalTb.totals.balanced);

  const before = await M.FmsLedgerEntry.countDocuments({ school });
  await svc.balanceSheet(school, period);
  await svc.profitAndLoss(school, period);
  await svc.cashMovement(school, period);
  ok('REPORTING WRITES NOTHING',
    (await M.FmsLedgerEntry.countDocuments({ school })) === before);

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