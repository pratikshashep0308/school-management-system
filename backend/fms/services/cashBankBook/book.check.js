    // backend/fms/services/cashBankBook/book.check.js
//
// Cash Book & Bank Book integration checks. SRS M13/M14.
//
//   cd /root/school-management-system/backend
//   node fms/services/cashBankBook/book.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end.
//
// Section 1 is the P2.4 verification: seed a day of cash receipts and payments,
// confirm closing = opening + receipts − payments, and that the next day opens
// with it.

const mongoose = require('mongoose');
require('dotenv').config();

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log(`  ✔ ${name}`); }
  else { fail += 1; failures.push(name); console.log(`  ✖ ${name}${detail ? '  — ' + detail : ''}`); }
}

async function throws(name, fn, match) {
  try { await fn(); ok(name, false, 'expected a throw'); }
  catch (e) {
    const text = [e.code || '', e.message || '', e.details ? JSON.stringify(e.details) : ''].join(' ');
    ok(name, !match || match.test(text), text.slice(0, 140));
  }
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set — run from backend/');

  const testUri = uri.replace(/\/([^/?]+)(\?|$)/, `/$1_fmscheck${process.pid}$2`);
  const dbName = testUri.match(/\/([^/?]+)(\?|$)/)[1];
  if (!/_fmscheck\d*$/.test(dbName)) {
    throw new Error(`Refusing to run: '${dbName}' is not a _fmscheck database`);
  }

  await mongoose.connect(testUri);
  const info = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!info.setName) throw new Error('Not a replica set');

  console.log(`\nDatabase: ${dbName}   replica set: ${info.setName}\n`);

  const M = require('../../models/core');
  const { FmsDailyClosing } = require('../../models/cashBankBook');
  const posting = require('../ledger/LedgerPostingService');
  const svc = require('./bookService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const cashier = { user: { _id: new Types.ObjectId(), email: 'cashier@test' }, fmsRole: 'cashier' };
  const manager = { user: { _id: new Types.ObjectId(), email: 'mgr@test' }, fmsRole: 'accountsManager' };

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  const mkG = (c, n, t, b) => M.FmsAccountGroup.create({ school, groupCode: c, groupName: n, accountType: t, normalBalance: b });
  const mkA = (c, n, g, t, b, extra = {}) => M.FmsAccount.create({
    school, accountCode: c, accountName: n, accountGroup: g._id, accountType: t, normalBalance: b, ...extra,
  });

  const gAsset = await mkG('1000', 'Assets', 'asset', 'debit');
  const gInc = await mkG('4000', 'Income', 'income', 'credit');
  const gExp = await mkG('5000', 'Expenditure', 'expense', 'debit');

  const cash = await mkA('1101', 'Cash in Hand', gAsset, 'asset', 'debit', { isCashAccount: true });
  const bank = await mkA('1201', 'Bank — Current', gAsset, 'asset', 'debit', { isBankAccount: true });
  const income = await mkA('4101', 'Fee Income', gInc, 'income', 'credit');
  const expense = await mkA('5299', 'Other Expenses', gExp, 'expense', 'debit');

  const post = (date, lines, type = 'journal') => posting.post({
    school, financialYear: fy._id, voucherType: type,
    voucherDate: new Date(date), postedBy: cashier.user._id, lines,
  });

  const receipt = (date, amt) => post(date, [
    { account: cash._id, debit: amt, credit: 0 },
    { account: income._id, debit: 0, credit: amt },
  ], 'receipt');

  const payment = (date, amt) => post(date, [
    { account: expense._id, debit: amt, credit: 0 },
    { account: cash._id, debit: 0, credit: amt },
  ], 'payment');

  // ── 1. THE P2.4 VERIFICATION ──────────────────────────────────────────────
  console.log('1. A day of receipts and payments');

  const r1 = money.toPaise(15000);
  const r2 = money.toPaise(8500);
  const p1 = money.toPaise(3200);

  await receipt('2026-07-10', r1);
  await receipt('2026-07-10', r2);
  await payment('2026-07-10', p1);

  const day1 = await svc.day(school, { bookType: 'cash', date: '2026-07-10' });
  ok('opening is zero on the first day', day1.openingBalance === 0);
  ok('receipts total correct', day1.receipts === r1 + r2, String(day1.receipts));
  ok('payments total correct', day1.payments === p1, String(day1.payments));
  ok('CLOSING = opening + receipts − payments',
    day1.closingBalance === day1.openingBalance + day1.receipts - day1.payments,
    `${day1.closingBalance}`);
  ok('closing = 20300 rupees', day1.closingBalance === money.toPaise(20300));
  ok('three entries listed', day1.entries.length === 3);
  ok('running balance ends at the closing',
    day1.entries[2].runningBalance === day1.closingBalance);

  // The next day must OPEN with it.
  const r3 = money.toPaise(5000);
  await receipt('2026-07-11', r3);

  const day2 = await svc.day(school, { bookType: 'cash', date: '2026-07-11' });
  ok('NEXT DAY OPENS WITH THE PREVIOUS CLOSING',
    day2.openingBalance === day1.closingBalance,
    `day1 close=${day1.closingBalance} day2 open=${day2.openingBalance}`);
  ok('day 2 closing correct', day2.closingBalance === day1.closingBalance + r3);

  // ── 2. Continuity across a range, including empty days ────────────────────
  console.log('\n2. Continuity across a range');
  const bookJul = await svc.book(school, { bookType: 'cash', from: '2026-07-09', to: '2026-07-13' });

  ok('five calendar days returned', bookJul.days.length === 5, String(bookJul.days.length));
  ok('arithmetic proof holds', bookJul.continuous === true);
  ok('period opening zero', bookJul.openingBalance === 0);
  ok('period closing matches day 2', bookJul.closingBalance === day2.closingBalance);

  for (let i = 1; i < bookJul.days.length; i++) {
    const prev = bookJul.days[i - 1];
    const cur = bookJul.days[i];
    if (cur.openingBalance !== prev.closingBalance) {
      ok(`day ${cur.date} opens with the previous closing`, false,
        `${prev.closingBalance} → ${cur.openingBalance}`);
      break;
    }
    if (i === bookJul.days.length - 1) {
      ok('EVERY day opens with the previous closing', true);
    }
  }

  const empty = bookJul.days.find((d) => d.date === '2026-07-12');
  ok('a day with no movement still appears', !!empty);
  ok('and carries the balance forward',
    empty.openingBalance === empty.closingBalance && empty.entries === 0);

  // ── 3. Nothing is double-stored ───────────────────────────────────────────
  console.log('\n3. Derived, not stored');
  const collections = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
  ok('no cash-book collection exists', !collections.includes('fms_cashbook'));
  ok('no bank-book collection exists', !collections.includes('fms_bankbook'));

  // Post another receipt and confirm the book changes with no rebuild step.
  await receipt('2026-07-11', money.toPaise(1000));
  const day2b = await svc.day(school, { bookType: 'cash', date: '2026-07-11' });
  ok('the book reflects a new posting immediately',
    day2b.closingBalance === day2.closingBalance + money.toPaise(1000));

  // ── 4. Bank book ──────────────────────────────────────────────────────────
  console.log('\n4. Bank book');
  await post('2026-07-12', [
    { account: bank._id, debit: money.toPaise(50000), credit: 0 },
    { account: cash._id, debit: 0, credit: money.toPaise(50000) },
  ]);

  const bankBook = await svc.book(school, { bookType: 'bank', from: '2026-07-01', to: '2026-07-31' });
  ok('bank book shows the deposit', bankBook.totalReceipts === money.toPaise(50000));
  ok('bank book is continuous', bankBook.continuous);

  const cashAfter = await svc.book(school, { bookType: 'cash', from: '2026-07-01', to: '2026-07-31' });
  ok('cash book shows the matching withdrawal',
    cashAfter.totalPayments === p1 + money.toPaise(50000));

  await throws('a non-cash account rejected for the cash book',
    () => svc.book(school, { bookType: 'cash', account: bank._id, from: '2026-07-01', to: '2026-07-31' }),
    /not flagged as a cash/);

  // ── 5. Daily closing ──────────────────────────────────────────────────────
  console.log('\n5. Daily closing');
  await throws('cash closing without a count rejected',
    () => svc.closeDay(school, { account: cash._id, date: '2026-07-10' }, cashier),
    /physicalCount/);

  await throws('float rupees rejected as a count',
    () => svc.closeDay(school, { account: cash._id, date: '2026-07-10', physicalCount: 20300.50 }, cashier),
    /integer paise/);

  const exact = await svc.closeDay(school, {
    account: cash._id, date: '2026-07-10', physicalCount: money.toPaise(20300),
  }, cashier);
  ok('closed with no variance', exact.variance === 0);
  ok('status is closed, not disputed', exact.closingStatus === 'closed');
  ok('system closing recomputed from the ledger', exact.systemClosing === money.toPaise(20300));
  ok('receipts and payments snapshotted',
    exact.totalReceipts === r1 + r2 && exact.totalPayments === p1);

  await throws('cannot close the same day twice',
    () => svc.closeDay(school, { account: cash._id, date: '2026-07-10', physicalCount: 1 }, cashier),
    /already closed/);

  await throws('cannot close a future day',
    () => svc.closeDay(school, { account: cash._id, date: '2099-01-01', physicalCount: 0 }, cashier),
    /future/);

  // ── 6. Variance ───────────────────────────────────────────────────────────
  console.log('\n6. Variance');
  const short = money.toPaise(25000);          // deliberately ₹300 short

  await throws('variance without a reason rejected',
    () => svc.closeDay(school, { account: cash._id, date: '2026-07-11', physicalCount: short }, cashier),
    /varianceReason/);

  const disputed = await svc.closeDay(school, {
    account: cash._id, date: '2026-07-11',
    physicalCount: short, varianceReason: 'Short by ₹300 — investigating',
  }, cashier);

  ok('variance computed, not accepted from the caller',
    disputed.variance === short - disputed.systemClosing, String(disputed.variance));
  ok('variance is negative (short)', disputed.variance < 0);
  ok('status is DISPUTED, not closed', disputed.closingStatus === 'disputed');
  ok('reason recorded', !!disputed.varianceReason);

  // ── 7. Verification ───────────────────────────────────────────────────────
  console.log('\n7. Verification');
  await throws('closer cannot verify their own closing',
    () => svc.verifyClosing(school, exact._id, cashier), /Separation of duties/);

  const verified = await svc.verifyClosing(school, exact._id, manager, 'Counted and agreed');
  ok('a different person can verify', verified.closingStatus === 'verified');
  ok('verifier recorded', String(verified.verifiedBy) === String(manager.user._id));

  await throws('cannot verify twice',
    () => svc.verifyClosing(school, exact._id, manager), /already verified/);

  await throws('a disputed closing needs a note to verify',
    () => svc.verifyClosing(school, disputed._id, manager), /note/);

  const resolved = await svc.verifyClosing(school, disputed._id, manager, 'Shortfall recovered from float');
  ok('disputed closing can be verified with a note', resolved.closingStatus === 'verified');
  ok('the variance is NOT erased by verification', resolved.variance === disputed.variance);

  // ── 8. Closings surface in the book ───────────────────────────────────────
  console.log('\n8. Closings in the book view');
  const withClosings = await svc.book(school, { bookType: 'cash', from: '2026-07-09', to: '2026-07-13' });
  const d10 = withClosings.days.find((d) => d.date === '2026-07-10');
  const d11 = withClosings.days.find((d) => d.date === '2026-07-11');
  const d12 = withClosings.days.find((d) => d.date === '2026-07-12');

  ok('closed day carries its closing', d10.closing?.status === 'verified');
  ok('disputed day shows its variance', d11.closing?.variance === disputed.variance);
  ok('an unclosed day shows null', d12.closing === null);

  // The closing snapshot must not have changed the ledger-derived balance.
  ok('CLOSING DID NOT ALTER THE DERIVED BALANCE',
    d10.closingBalance === money.toPaise(20300));

  // ── 9. Audit and integrity ────────────────────────────────────────────────
  console.log('\n9. Audit and integrity');
  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_dailyclosings' });
  ok('closings are audited', audits >= 4, `${audits} entries`);

  const verifyAudit = await M.FmsAuditTrail
    .findOne({ school, entity: 'fms_dailyclosings', action: 'approve' }).lean();
  ok('verification audited with before/after', !!verifyAudit?.before && !!verifyAudit?.after);

  const gl = require('../ledger/ledgerQueryService');
  const tb = await gl.trialBalance(school);
  ok('FINAL: trial balance still balances', tb.totals.balanced, JSON.stringify(tb.totals));

  const cashLine = tb.lines.find((l) => l.accountCode === '1101');
  const finalBook = await svc.book(school, { bookType: 'cash', from: '2026-04-01', to: '2027-03-31' });
  ok('CASH BOOK CLOSING = TRIAL BALANCE FOR CASH',
    finalBook.closingBalance === cashLine.balance,
    `book=${finalBook.closingBalance} tb=${cashLine.balance}`);

  ok('closings recorded', (await FmsDailyClosing.countDocuments({ school })) === 2);

  // ── Teardown ──────────────────────────────────────────────────────────────
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