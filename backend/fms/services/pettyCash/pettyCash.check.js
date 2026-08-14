// backend/fms/services/pettyCash/pettyCash.check.js
//
// Petty Cash integration checks. SRS M10 / BPMN WF9.
//
//   node fms/services/pettyCash/pettyCash.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end.
//
// Section 2 is the P4.5 verification: record issues and expenses, run a daily
// close with a deliberate variance, and confirm it is captured and requires
// approval before it reaches the books.

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
  const { FmsPettyCashFloat, FmsPettyCashTransaction } = require('../../models/pettyCash');
  const { FmsDailyClosing } = require('../../models/cashBankBook');
  const svc = require('./pettyCashService');
  const bookSvc = require('../cashBankBook/bookService');
  const gl = require('../ledger/ledgerQueryService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const who = (e, r) => ({ user: { _id: new Types.ObjectId(), email: e }, fmsRole: r });
  const manager = who('mgr@test', 'accountsManager');
  const custodian = who('clerk@test', 'cashier');
  const principal = who('principal@test', 'principal');

  await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  const mkG = (c,n,t,b) => M.FmsAccountGroup.create({ school, groupCode:c, groupName:n, accountType:t, normalBalance:b });
  const mkA = (c,n,g,t,b,x={}) => M.FmsAccount.create({ school, accountCode:c, accountName:n, accountGroup:g._id, accountType:t, normalBalance:b, ...x });

  const gAsset = await mkG('1000','Assets','asset','debit');
  const gExp = await mkG('5000','Expenditure','expense','debit');
  const bank = await mkA('1201','Bank',gAsset,'asset','debit',{ isBankAccount:true });
  const petty = await mkA('1102','Petty Cash',gAsset,'asset','debit',{ isCashAccount:true });
  const petty2 = await mkA('1103','Petty Cash — Lab',gAsset,'asset','debit',{ isCashAccount:true });
  const notCash = await mkA('1301','Advances',gAsset,'asset','debit');
  const sundry = await mkA('5299','Sundry Expenses',gExp,'expense','debit');
  const shortage = await mkA('5901','Cash Shortage',gExp,'expense','debit');

  const R = (r) => money.toPaise(r);

  // ── 1. Float setup ────────────────────────────────────────────────────────
  console.log('1. Float setup');

  await throws('a non-cash account cannot hold a float',
    () => svc.createFloat(school, { name:'Bad', account: notCash._id,
      custodian: custodian.user._id, floatAmount: R(5000) }, manager),
    /not flagged as a cash account/);

  await throws('float amount must be integer paise',
    () => svc.createFloat(school, { name:'Bad', account: petty._id,
      custodian: custodian.user._id, floatAmount: 5000.5 }, manager),
    /integer paise/);

  const float = await svc.createFloat(school, {
    name: 'Front Office Petty Cash', account: petty._id,
    custodian: custodian.user._id, custodianName: 'R. Clerk',
    floatAmount: R(5000), maxSingleExpense: R(2000),
  }, manager);

  ok('float created', !!float);
  ok('THRESHOLD DEFAULTS TO A QUARTER OF THE FLOAT',
    float.replenishThreshold === R(1250), String(float.replenishThreshold));

  await throws('two floats cannot share a cash head',
    () => svc.createFloat(school, { name:'Duplicate', account: petty._id,
      custodian: custodian.user._id, floatAmount: R(1000) }, manager),
    /already holds the float/);

  await throws('a threshold at or above the float is rejected',
    () => svc.createFloat(school, { name:'Odd', account: petty2._id,
      custodian: custodian.user._id, floatAmount: R(1000), replenishThreshold: R(1000) }, manager),
    /below the float amount/);

  const pos0 = await svc.position(school, float._id);
  ok('a new float starts empty', pos0.balance === 0);
  ok('and needs replenishing', pos0.needsReplenishment === true);

  // ── 2. THE P4.5 VERIFICATION ──────────────────────────────────────────────
  console.log('\n2. Issues, expenses, then a close with a deliberate variance');

  const issue = await svc.record(school, float._id, {
    transactionType: 'float', amount: R(5000), counterAccount: bank._id,
    particulars: 'Initial float to front office', transactionDate: new Date('2026-07-01'),
  }, manager);

  ok('float issued', issue.transaction.transactionType === 'float');
  ok('ONE number — voucher number is the GL voucher number',
    issue.transaction.voucherNumber === issue.voucher.voucherNumber);
  ok('balance is now the float', issue.position.balance === R(5000));
  ok('and it no longer needs replenishing', issue.position.needsReplenishment === false);

  const drPetty = (await gl.voucherDetail(school, issue.voucher._id)).lines
    .find((l) => l.accountCode === '1102');
  ok('Dr petty cash / Cr bank', drPetty?.debit === R(5000));

  const e1 = await svc.record(school, float._id, {
    transactionType: 'expense', amount: R(450), counterAccount: sundry._id,
    particulars: 'Courier charges', paidTo: 'Speed Post', billNumber: 'SP-9912',
    transactionDate: new Date('2026-07-02'),
  }, custodian);
  const e2 = await svc.record(school, float._id, {
    transactionType: 'expense', amount: R(1200), counterAccount: sundry._id,
    particulars: 'Stationery for the office', paidTo: 'Local shop',
    transactionDate: new Date('2026-07-02'),
  }, custodian);

  ok('two expenses recorded', !!e1.transaction && !!e2.transaction);
  ok('balance reduced correctly', e2.position.balance === R(5000) - R(450) - R(1200));

  const drExp = (await gl.voucherDetail(school, e1.voucher._id)).lines
    .find((l) => l.accountCode === '5299');
  ok('Dr expense / Cr petty cash', drExp?.debit === R(450));

  // Close 2 July with a DELIBERATE shortfall: the books say ₹3,350, the tin
  // holds ₹3,300 — ₹50 short.
  const systemBalance = R(5000) - R(450) - R(1200);
  ok('the books say 3350', systemBalance === R(3350));

  await throws('a cash close without a physical count is refused',
    () => bookSvc.closeDay(school, { account: petty._id, date: '2026-07-02' }, custodian),
    /physicalCount/);

  await throws('a variance without a reason is refused',
    () => bookSvc.closeDay(school, {
      account: petty._id, date: '2026-07-02', physicalCount: R(3300),
    }, custodian), /varianceReason/);

  const closing = await bookSvc.closeDay(school, {
    account: petty._id, date: '2026-07-02',
    physicalCount: R(3300),
    varianceReason: 'Fifty rupees short — cannot account for it',
  }, custodian);

  ok('THE VARIANCE IS CAPTURED', closing.variance === -R(50), String(closing.variance));
  ok('variance is computed, not supplied',
    closing.variance === closing.physicalCount - closing.systemClosing);
  ok('the system figure matches the ledger', closing.systemClosing === systemBalance);
  ok('A VARIANCE OPENS AS DISPUTED, not closed', closing.closingStatus === 'disputed');
  ok('the reason is recorded', /Fifty rupees short/.test(closing.varianceReason));

  // It REQUIRES APPROVAL — the variance cannot reach the books unverified.
  await throws('THE VARIANCE CANNOT BE POSTED UNVERIFIED',
    () => svc.postVariance(school, closing._id, { counterAccount: shortage._id }, manager),
    /Only a verified closing/);

  await throws('the counter cannot verify their own count',
    () => bookSvc.verifyClosing(school, closing._id, custodian), /Separation of duties/);

  await throws('a disputed closing needs a note to verify',
    () => bookSvc.verifyClosing(school, closing._id, manager), /note/);

  const verified = await bookSvc.verifyClosing(school, closing._id, manager,
    'Counted again with the custodian; genuinely short');
  ok('a second person verifies it', verified.closingStatus === 'verified');
  ok('THE VARIANCE IS NOT ERASED BY VERIFICATION', verified.variance === -R(50));

  const posted = await svc.postVariance(school, closing._id, { counterAccount: shortage._id }, manager);
  ok('now it posts', posted.transaction.transactionType === 'adjustment');
  ok('and the books agree with the tin', posted.position.balance === R(3300));

  const varLines = await gl.voucherDetail(school, posted.voucher._id);
  ok('Dr shortage / Cr petty cash',
    varLines.lines.find((l) => l.accountCode === '5901')?.debit === R(50) &&
    varLines.lines.find((l) => l.accountCode === '1102')?.credit === R(50));

  await throws('the same variance cannot be posted twice',
    () => svc.postVariance(school, closing._id, { counterAccount: shortage._id }, manager),
    /already been posted/);

  // ── 3. Closing balance carries forward ────────────────────────────────────
  console.log('\n3. The closing balance carries forward');

  await svc.record(school, float._id, {
    transactionType: 'expense', amount: R(300), counterAccount: sundry._id,
    particulars: 'Tea and refreshments', transactionDate: new Date('2026-07-03'),
  }, custodian);

  const day2 = await bookSvc.day(school, { bookType: 'cash', account: petty._id, date: '2026-07-03' });
  ok('DAY 3 OPENS WITH DAY 2 CLOSING',
    day2.openingBalance === R(3300), String(day2.openingBalance));
  ok('and closes 300 lower', day2.closingBalance === R(3000));

  const book = await svc.book(school, float._id, { from: '2026-07-01', to: '2026-07-31' });
  ok('the petty cash book runs', book.entries.length === 5, String(book.entries.length));
  ok('opening is zero for the period', book.openingBalance === 0);
  ok('closing matches the ledger', book.closingBalance === R(3000));
  ok('the running balance ends at the closing',
    book.entries[book.entries.length - 1].runningBalance === book.closingBalance);
  ok('inflows and outflows are separated',
    book.entries[0].inflow === R(5000) && book.entries[1].outflow === R(450));

  // ── 4. Replenishment ──────────────────────────────────────────────────────
  console.log('\n4. Replenishment');
  const beforeTop = await svc.position(school, float._id);
  ok('replenishment due restores the imprest',
    beforeTop.replenishmentDue === R(5000) - R(3000), String(beforeTop.replenishmentDue));

  const top = await svc.record(school, float._id, {
    transactionType: 'replenishment', amount: beforeTop.replenishmentDue,
    counterAccount: bank._id, particulars: 'Top up to imprest',
    transactionDate: new Date('2026-07-04'),
  }, manager);
  ok('topped back up to the float', top.position.balance === R(5000));
  ok('and nothing more is due', top.position.replenishmentDue === 0);

  // ── 5. Guards ─────────────────────────────────────────────────────────────
  console.log('\n5. Guards');
  // The balance guard needs an amount that trips ONLY it. On the main float,
  // ₹9,000 exceeds both the balance AND the ₹2,000 single-expense limit, and
  // the limit fires first — so that test proved nothing about the balance.
  // A second float with no limit isolates it.
  const bare = await svc.createFloat(school, {
    name: 'Lab Petty Cash', account: petty2._id,
    custodian: custodian.user._id, floatAmount: R(1000),
  }, manager);
  await svc.record(school, bare._id, {
    transactionType: 'float', amount: R(1000), counterAccount: bank._id,
    particulars: 'Lab float', transactionDate: new Date('2026-07-05'),
  }, manager);

  await throws('CANNOT SPEND MORE THAN IS IN THE TIN',
    () => svc.record(school, bare._id, {
      transactionType: 'expense', amount: R(1500), counterAccount: sundry._id,
      particulars: 'More than the tin holds', transactionDate: new Date('2026-07-05'),
    }, custodian), /cannot be paid out/);

  ok('spending exactly the balance is allowed',
    (await svc.record(school, bare._id, {
      transactionType: 'expense', amount: R(1000), counterAccount: sundry._id,
      particulars: 'Exactly the balance', transactionDate: new Date('2026-07-05'),
    }, custodian)).position.balance === 0);

  await throws('a single expense above the limit is refused',
    () => svc.record(school, float._id, {
      transactionType: 'expense', amount: R(2500), counterAccount: sundry._id,
      particulars: 'Over the limit', transactionDate: new Date('2026-07-05'),
    }, custodian), /single-expense limit/);

  await throws('spending must go to an EXPENSE head',
    () => svc.record(school, float._id, {
      transactionType: 'expense', amount: R(100), counterAccount: bank._id,
      particulars: 'Wrong head', transactionDate: new Date('2026-07-05'),
    }, custodian), /must go to an expense head/);

  await throws('a future-dated entry is refused',
    () => svc.record(school, float._id, {
      transactionType: 'expense', amount: R(100), counterAccount: sundry._id,
      particulars: 'Tomorrow', transactionDate: new Date('2099-01-01'),
    }, custodian), /future|no financial year/);

  // ── 6. Cancellation ───────────────────────────────────────────────────────
  console.log('\n6. Cancellation');
  const later = await svc.record(school, float._id, {
    transactionType: 'expense', amount: R(200), counterAccount: sundry._id,
    particulars: 'Entered by mistake', transactionDate: new Date('2026-07-10'),
  }, custodian);

  const cancelled = await svc.cancel(school, later.transaction._id, manager, 'Duplicate entry');
  ok('cancelled', cancelled.transaction.pcStatus === 'cancelled');
  ok('a reversal was posted', !!cancelled.reversal.voucherNumber);
  ok('NOT deleted', (await FmsPettyCashTransaction.countDocuments({ _id: later.transaction._id })) === 1);

  await throws('cannot cancel twice',
    () => svc.cancel(school, later.transaction._id, manager, 'again'), /already cancelled/);
  await throws('petty cash entries are never deleted',
    () => FmsPettyCashTransaction.deleteOne({ _id: later.transaction._id }), /never deleted/);

  // A day already counted must not change underneath the count.
  const onClosedDay = await FmsPettyCashTransaction.findOne({
    school, transactionDate: new Date('2026-07-02'), pcStatus: 'posted', transactionType: 'expense',
  });
  await throws('CANNOT CANCEL AN ENTRY ON A CLOSED DAY',
    () => svc.cancel(school, onClosedDay._id, manager, 'too late'), /already been closed/);

  // ── 7. Float status ───────────────────────────────────────────────────────
  console.log('\n7. Float status');
  await throws('suspending without a reason is refused',
    () => svc.setFloatStatus(school, float._id, { floatStatus: 'suspended' }, principal), /reason/);

  await svc.setFloatStatus(school, float._id, { floatStatus: 'suspended', reason: 'Custodian on leave' }, principal);
  await throws('a suspended float cannot be transacted with',
    () => svc.record(school, float._id, {
      transactionType: 'expense', amount: R(100), counterAccount: sundry._id,
      particulars: 'While suspended', transactionDate: new Date('2026-07-11'),
    }, custodian), /suspended/);

  await svc.setFloatStatus(school, float._id, { floatStatus: 'active', reason: 'Custodian back' }, principal);
  await throws('CANNOT CLOSE A FLOAT THAT STILL HOLDS CASH',
    () => svc.setFloatStatus(school, float._id, { floatStatus: 'closed', reason: 'done' }, principal),
    /still holds/);

  // ── 8. Integrity ──────────────────────────────────────────────────────────
  console.log('\n8. Integrity');
  const finalPos = await svc.position(school, float._id);
  const tb = await gl.trialBalance(school);
  const pettyTb = tb.lines.find((l) => l.accountCode === '1102');
  ok('FLOAT BALANCE = TRIAL BALANCE FOR PETTY CASH',
    finalPos.balance === pettyTb.balance, `float=${finalPos.balance} tb=${pettyTb.balance}`);

  const cashBook = await bookSvc.book(school, {
    bookType: 'cash', account: petty._id, from: '2026-04-01', to: '2027-03-31',
  });
  ok('AND THE CASH BOOK AGREES TOO', cashBook.closingBalance === pettyTb.balance);
  ok('FINAL: debits = credits', tb.totals.balanced, JSON.stringify(tb.totals));

  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: /^fms_pettycash/ });
  ok('petty cash activity is audited', audits >= 5, `${audits} entries`);

  ok('no parallel closing collection was created',
    (await mongoose.connection.db.listCollections().toArray())
      .every((c) => c.name !== 'fms_pettycashclosings'));
  ok('the shared daily closing was used',
    (await FmsDailyClosing.countDocuments({ school, account: petty._id })) === 1);

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