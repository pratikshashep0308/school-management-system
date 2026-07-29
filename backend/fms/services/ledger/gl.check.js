// backend/fms/services/ledger/gl.check.js
//
// General Ledger read-API integration checks. SRS M11.
//
//   cd /root/school-management-system/backend
//   node fms/services/ledger/gl.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end. Never touches
// school_management.
//
// Section 1 is the P2.2 verification: post a sample income and an expense,
// confirm the GL shows both, balances are correct, and total debits equal
// total credits.

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
    ok(name, !match || match.test(text), text);
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
  const posting = require('./LedgerPostingService');
  const gl = require('./ledgerQueryService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const user = new Types.ObjectId();
  const page = { skip: 0, limit: 25, sort: { entryDate: -1 } };

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  const mkGroup = (code, name, type, bal) =>
    M.FmsAccountGroup.create({ school, groupCode: code, groupName: name, accountType: type, normalBalance: bal });
  const mkAcct = (code, name, group, type, bal) =>
    M.FmsAccount.create({ school, accountCode: code, accountName: name, accountGroup: group._id,
      accountType: type, normalBalance: bal });

  const gAsset = await mkGroup('1000', 'Assets', 'asset', 'debit');
  const gIncome = await mkGroup('4000', 'Income', 'income', 'credit');
  const gExpense = await mkGroup('5000', 'Expenditure', 'expense', 'debit');

  const cash = await mkAcct('1101', 'Cash in Hand', gAsset, 'asset', 'debit');
  const tuition = await mkAcct('4101', 'Tuition Fee Income', gIncome, 'income', 'credit');
  const salary = await mkAcct('5101', 'Salary Expense', gExpense, 'expense', 'debit');

  // ── 1. THE P2.2 VERIFICATION ──────────────────────────────────────────────
  console.log('1. Income + expense, then check the GL');

  const income = money.toPaise(25000);
  const expense = money.toPaise(18000);

  const vIncome = await posting.post({
    school, financialYear: fy._id, voucherType: 'income',
    voucherDate: new Date('2026-07-10'), narration: 'Tuition fees collected',
    postedBy: user,
    lines: [
      { account: cash._id, debit: income, credit: 0 },
      { account: tuition._id, debit: 0, credit: income },
    ],
  });

  const vExpense = await posting.post({
    school, financialYear: fy._id, voucherType: 'payment',
    voucherDate: new Date('2026-07-15'), narration: 'July salary paid',
    postedBy: user,
    lines: [
      { account: salary._id, debit: expense, credit: 0 },
      { account: cash._id, debit: 0, credit: expense },
    ],
  });

  const list = await gl.entries(school, {}, page);
  ok('GL shows all 4 lines', list.total === 4, String(list.total));
  ok('income voucher present',
    list.items.some((e) => e.voucherNumber === vIncome.voucher.voucherNumber));
  ok('expense voucher present',
    list.items.some((e) => e.voucherNumber === vExpense.voucher.voucherNumber));
  ok('total debits = total credits',
    list.summary.balanced && list.summary.difference === 0, JSON.stringify(list.summary));
  ok('debit total = 25000 + 18000',
    list.summary.totalDebit === income + expense, String(list.summary.totalDebit));

  const tb = await gl.trialBalance(school);
  ok('trial balance is balanced', tb.totals.balanced, JSON.stringify(tb.totals));
  ok('trial balance covers 3 accounts', tb.totals.accounts === 3, String(tb.totals.accounts));

  const cashLine = tb.lines.find((l) => l.accountCode === '1101');
  ok('cash Dr 25000 Cr 18000',
    cashLine.totalDebit === income && cashLine.totalCredit === expense);
  ok('cash balance 7000 Dr',
    cashLine.balance === income - expense && cashLine.drCr === 'Dr', JSON.stringify(cashLine.balance));

  const incLine = tb.lines.find((l) => l.accountCode === '4101');
  ok('income shown as Cr', incLine.drCr === 'Cr');
  ok('income natural balance is positive',
    incLine.naturalBalance === income, String(incLine.naturalBalance));

  // ── 2. Account statement ──────────────────────────────────────────────────
  console.log('\n2. Account statement');
  const stmt = await gl.accountLedger(school, cash._id, {}, { skip: 0, limit: 25 });
  ok('two entries for cash', stmt.total === 2);
  ok('opening balance zero without a from-date', stmt.opening.balance === 0);
  ok('closing = 7000 Dr',
    stmt.closing.balance === income - expense && stmt.closing.drCr === 'Dr');
  ok('movement totals correct',
    stmt.movement.totalDebit === income && stmt.movement.totalCredit === expense);

  const [first, second] = stmt.entries;
  ok('running balance after first entry', first.runningBalance === income, String(first.runningBalance));
  ok('running balance after second', second.runningBalance === income - expense);
  ok('entries in date order', first.entryDate <= second.entryDate);

  // ── 3. Running balance survives pagination ────────────────────────────────
  console.log('\n3. Running balance under pagination');
  for (let i = 1; i <= 8; i++) {
    await posting.post({
      school, financialYear: fy._id, voucherType: 'income',
      voucherDate: new Date(`2026-08-${String(i).padStart(2, '0')}`),
      narration: `Extra ${i}`, postedBy: user,
      lines: [
        { account: cash._id, debit: 100000, credit: 0 },
        { account: tuition._id, debit: 0, credit: 100000 },
      ],
    });
  }

  const p1 = await gl.accountLedger(school, cash._id, {}, { skip: 0, limit: 4 });
  const p2 = await gl.accountLedger(school, cash._id, {}, { skip: 4, limit: 4 });
  const p3 = await gl.accountLedger(school, cash._id, {}, { skip: 8, limit: 4 });

  ok('page 1 has 4 rows', p1.entries.length === 4);
  ok('page 2 continues from page 1',
    p2.entries[0].runningBalance === p1.entries[3].runningBalance + p2.entries[0].debit - p2.entries[0].credit,
    `p1 end=${p1.entries[3].runningBalance} p2 start=${p2.entries[0].runningBalance}`);
  ok('page 3 continues from page 2',
    p3.entries[0].runningBalance === p2.entries[3].runningBalance + p3.entries[0].debit - p3.entries[0].credit);
  ok('last page running balance equals closing',
    p3.entries[p3.entries.length - 1].runningBalance === p3.closing.balance,
    `${p3.entries[p3.entries.length - 1].runningBalance} vs ${p3.closing.balance}`);

  // ── 4. Date filtering and opening balance ─────────────────────────────────
  console.log('\n4. Date range + opening balance');
  const aug = await gl.accountLedger(school, cash._id,
    { from: '2026-08-01', to: '2026-08-31' }, { skip: 0, limit: 25 });

  ok('August shows 8 entries', aug.total === 8, String(aug.total));
  ok('opening balance carries July forward',
    aug.opening.balance === income - expense, String(aug.opening.balance));
  ok('closing = opening + August movement',
    aug.closing.balance === aug.opening.balance + aug.movement.totalDebit - aug.movement.totalCredit);
  ok('first August row starts from the opening balance',
    aug.entries[0].runningBalance === aug.opening.balance + aug.entries[0].debit);

  const julyOnly = await gl.entries(school, { from: '2026-07-01', to: '2026-07-31' }, page);
  ok('July filter returns 4 lines', julyOnly.total === 4, String(julyOnly.total));
  ok('July still balances', julyOnly.summary.balanced);

  // `to` must include the whole day, not stop at midnight.
  const toTheDay = await gl.entries(school, { from: '2026-07-15', to: '2026-07-15' }, page);
  ok('to-date includes the whole day', toTheDay.total === 2, String(toTheDay.total));

  // ── 5. Voucher drill-down ─────────────────────────────────────────────────
  console.log('\n5. Voucher drill-down');
  const detail = await gl.voucherDetail(school, vIncome.voucher._id);
  ok('voucher returned', detail.voucher.voucherNumber === vIncome.voucher.voucherNumber);
  ok('both lines returned', detail.lines.length === 2);
  ok('voucher balances', detail.totals.balanced);
  ok('debits listed first', detail.lines[0].debit > 0);
  ok('financial year resolved', detail.voucher.financialYear?.yearCode === '2026-27');
  ok('no reversal links yet', !detail.reversedBy && !detail.reversalOf);

  await throws('unknown voucher → not found',
    () => gl.voucherDetail(school, new Types.ObjectId()), /not found/i);

  // ── 6. Reversal appears in the GL ─────────────────────────────────────────
  console.log('\n6. Reversal');
  const before = (await gl.trialBalance(school)).totals;
  const rev = await posting.reverse(vExpense.voucher._id, user, 'entered twice');

  const after = await gl.trialBalance(school);
  ok('trial balance still balanced after reversal', after.totals.balanced);
  ok('reversal adds lines, never removes',
    after.totals.totalDebit > before.totalDebit && after.totals.totalCredit > before.totalCredit);

  const revDetail = await gl.voucherDetail(school, rev.reversal._id);
  ok('reversal links back to the original',
    String(revDetail.reversalOf?._id) === String(vExpense.voucher._id));

  const origDetail = await gl.voucherDetail(school, vExpense.voucher._id);
  ok('original links forward to the reversal',
    String(origDetail.reversedBy?._id) === String(rev.reversal._id));
  ok('original voucher marked reversed', origDetail.voucher.voucherStatus === 'reversed');
  ok('original lines untouched', origDetail.lines.length === 2);

  const revLines = await gl.entries(school, { voucher: rev.reversal._id }, page);
  ok('reversal lines flagged', revLines.items.every((e) => e.isReversal === true));

  // ── 7. Filters ────────────────────────────────────────────────────────────
  console.log('\n7. Filters');
  const byAccount = await gl.entries(school, { account: String(tuition._id) }, page);
  ok('filter by account', byAccount.items.every((e) => String(e.account) === String(tuition._id)));

  const byType = await gl.entries(school, { voucherType: 'income' }, page);
  ok('filter by voucherType', byType.items.every((e) => e.voucherType === 'income'));

  const byFy = await gl.entries(school, { financialYear: String(fy._id) }, page);
  ok('filter by financial year returns everything', byFy.total === (await gl.entries(school, {}, page)).total);

  const other = await gl.entries(new Types.ObjectId(), {}, page);
  ok('another branch sees nothing', other.total === 0);

  await throws('invalid from-date rejected',
    async () => gl.entries(school, { from: 'not-a-date' }, page), /Invalid/);

  // ── 8. The ledger cannot be written through these paths ───────────────────
  console.log('\n8. Read-only guarantee');
  await throws('updateMany blocked', () => M.FmsLedgerEntry.updateMany({ school }, { $set: { debit: 0 } }),
    /append-only/);
  await throws('deleteMany blocked', () => M.FmsLedgerEntry.deleteMany({ school }), /append-only/);

  const matrix = require('../auth/permissionMatrix');
  ok('no role can edit the ledger',
    matrix.FINANCE_ROLES.every((r) => ['none', 'read'].includes(matrix.levelFor(r, 'ledger'))));

  const finalTb = await gl.trialBalance(school);
  ok('FINAL: system-wide debits = credits',
    finalTb.totals.balanced && finalTb.totals.difference === 0, JSON.stringify(finalTb.totals));

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