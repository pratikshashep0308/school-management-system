// backend/fms/services/banking/banking.check.js
//
// Banking & Reconciliation integration checks. SRS M9 / BPMN WF7.
//
//   node fms/services/banking/banking.check.js
//
// Section 1 is the P4.4 verification: import a statement, confirm auto-match,
// resolve one manual match, reconcile, and confirm the GL agrees with the
// bank book.

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
  const testUri = uri.replace(/\/([^/?]+)(\?|$)/, '/$1_fmscheck$2');
  const dbName = testUri.match(/\/([^/?]+)(\?|$)/)[1];
  if (!dbName.endsWith('_fmscheck')) throw new Error(`Refusing: '${dbName}'`);

  await mongoose.connect(testUri);
  const info = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!info.setName) throw new Error('Not a replica set');
  console.log(`\nDatabase: ${dbName}   replica set: ${info.setName}\n`);

  const M = require('../../models/core');
  const { FmsBankAccount, FmsBankTransaction, FmsBankReconciliation } = require('../../models/banking');
  const svc = require('./bankingService');
  const gl = require('../ledger/ledgerQueryService');
  const bookSvc = require('../cashBankBook/bookService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const who = (e, r) => ({ user: { _id: new Types.ObjectId(), email: e }, fmsRole: r });
  const accountant = who('acct@test', 'accountant');
  const manager = who('mgr@test', 'accountsManager');

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  const mkG = (c,n,t,b) => M.FmsAccountGroup.create({ school, groupCode:c, groupName:n, accountType:t, normalBalance:b });
  const mkA = (c,n,g,t,b,x={}) => M.FmsAccount.create({ school, accountCode:c, accountName:n, accountGroup:g._id, accountType:t, normalBalance:b, ...x });

  const gAsset = await mkG('1000','Assets','asset','debit');
  const gInc = await mkG('4000','Income','income','credit');
  const gExp = await mkG('5000','Expenditure','expense','debit');
  const cash = await mkA('1101','Cash in Hand',gAsset,'asset','debit',{ isCashAccount:true });
  const bankGl = await mkA('1201','Bank — Current',gAsset,'asset','debit',{ isBankAccount:true });
  const bankGl2 = await mkA('1202','Bank — Savings',gAsset,'asset','debit',{ isBankAccount:true });
  const income = await mkA('4101','Fee Income',gInc,'income','credit');
  const charges = await mkA('5202','Bank Charges',gExp,'expense','debit');

  // ── 1. THE P4.4 VERIFICATION ──────────────────────────────────────────────
  console.log('1. Import → auto-match → manual match → reconcile');

  const bank = await svc.createAccount(school, {
    accountName: 'TFS Current Account', accountNumber: '00112233445566',
    ifsc: 'SBIN0001234', bankName: 'State Bank of India',
    ledgerAccount: bankGl._id, openingBalance: money.toPaise(100000),
    openingDate: new Date('2026-04-01'),
  }, manager);
  ok('bank account created', !!bank);
  ok('mapped to a GL head', bank.ledgerAccountCode === '1201');

  // Post three movements that WILL appear on the statement.
  const dep = await svc.recordMovement(school, {
    bankAccount: bank._id, movementType: 'deposit', amount: money.toPaise(25000),
    counterAccount: income._id, valueDate: new Date('2026-07-05'),
    narration: 'Fee collection banked', reference: 'NEFT001',
  }, accountant);
  const wd = await svc.recordMovement(school, {
    bankAccount: bank._id, movementType: 'withdrawal', amount: money.toPaise(12500),
    counterAccount: cash._id, valueDate: new Date('2026-07-06'),
    narration: 'Cheque 004521 to Sharma', reference: '004521',
  }, accountant);
  // And one that will NOT — a cheque issued but not yet presented.
  await svc.recordMovement(school, {
    bankAccount: bank._id, movementType: 'withdrawal', amount: money.toPaise(9000),
    counterAccount: cash._id, valueDate: new Date('2026-07-08'),
    narration: 'Cheque 004522 issued', reference: '004522',
  }, accountant);

  ok('deposit posted Dr bank',
    (await gl.voucherDetail(school, dep.voucher._id)).lines
      .find((l)=>l.accountCode==='1201')?.debit === money.toPaise(25000));
  ok('withdrawal posted Cr bank',
    (await gl.voucherDetail(school, wd.voucher._id)).lines
      .find((l)=>l.accountCode==='1201')?.credit === money.toPaise(12500));

  // The statement: the two cleared items plus a bank charge we never posted.
  const csv = [
    'Txn Date,Description,Chq/Ref No,Withdrawal,Deposit,Balance',
    '05/07/2026,"NEFT CR NEFT001",NEFT001,,25000.00,125000.00',
    '06/07/2026,"CHQ PAID 004521",004521,12500.00,,112500.00',
    '07/07/2026,"BANK CHARGES QTRLY",,118.00,,112382.00',
  ].join('\n');
  const mapping = { date:'Txn Date', narration:'Description', reference:'Chq/Ref No',
    debit:'Withdrawal', credit:'Deposit', balance:'Balance' };

  const imp = await svc.importStatement(school, bank._id, { csv, mapping }, accountant);
  ok('STATEMENT IMPORTED', imp.imported === 3, String(imp.imported));
  ok('no parse errors', imp.parseErrors.length === 0);

  const again = await svc.importStatement(school, bank._id, { csv, mapping }, accountant);
  ok('RE-IMPORTING THE SAME RANGE ADDS NOTHING', again.imported === 0);
  ok('and the duplicates are reported', again.duplicatesSkipped === 3);

  const auto = await svc.autoMatch(school, bank._id, { from:'2026-07-01', to:'2026-07-31' }, accountant);
  ok('AUTO-MATCH FOUND BOTH CLEARED ITEMS', auto.applied === 2, `applied=${auto.applied}`);
  ok('the bank charge is left unmatched', auto.unmatchedCount === 1);
  ok('the unpresented cheque surfaces as outstanding',
    auto.unmatchedEntries.length === 1, String(auto.unmatchedEntries.length));

  // The bank charge has no posting. Post it, then match by hand.
  await throws('CANNOT RECONCILE WITH AN UNMATCHED LINE',
    () => svc.reconcile(school, bank._id, {
      from:'2026-07-01', to:'2026-07-31', bankClosingBalance: money.toPaise(112382),
    }, manager), /still unmatched/);

  const chargePost = await svc.recordMovement(school, {
    bankAccount: bank._id, movementType: 'withdrawal', amount: 11800,
    counterAccount: charges._id, valueDate: new Date('2026-07-07'),
    narration: 'Quarterly bank charges',
  }, accountant);

  const chargeLine = await FmsBankTransaction.findOne({
    school, bankAccount: bank._id, amount: 11800,
  });
  const chargeEntry = (await gl.entries(school, { voucher: String(chargePost.voucher._id) },
    { skip:0, limit:10, sort:{} })).items.find((e)=>e.accountCode==='1201');

  const manual = await svc.manualMatch(school, chargeLine._id, chargeEntry._id, manager, 'Quarterly charges');
  ok('MANUAL MATCH RESOLVES IT', manual.transaction.reconciliationStatus === 'matched');
  ok('no direction or amount warning', !manual.warnings.directionMismatch && !manual.warnings.amountMismatch);

  const pos = await svc.reconciliationPosition(school, bank._id, {
    from:'2026-07-01', to:'2026-07-31', bankClosingBalance: money.toPaise(112382),
  });
  ok('the unpresented cheque is the only reconciling item',
    pos.unpresentedCheques === money.toPaise(9000), String(pos.unpresentedCheques));
  ok('RECONCILES TO ZERO', pos.reconciled === true, JSON.stringify({
    bank: pos.bankClosingBalance, adj: pos.adjustedBankBalance, book: pos.bookBalance, diff: pos.difference }));

  const rec = await svc.reconcile(school, bank._id, {
    from:'2026-07-01', to:'2026-07-31', bankClosingBalance: money.toPaise(112382),
  }, manager);
  ok('reconciliation completed', rec.reconciliation.periodStatus === 'reconciled');
  ok('difference is zero', rec.reconciliation.difference === 0);

  // The GL must agree with the bank book, by a different code path.
  const bookBank = await bookSvc.book(school, { bookType:'bank', from:'2026-04-01', to:'2027-03-31' });
  const tb = await gl.trialBalance(school);
  const bankTb = tb.lines.find((l)=>l.accountCode==='1201');
  ok('BANK BOOK = TRIAL BALANCE FOR THE BANK',
    bookBank.closingBalance === bankTb.balance,
    `book=${bookBank.closingBalance} tb=${bankTb.balance}`);
  ok('and the reconciliation used the same book balance',
    rec.reconciliation.bookBalance === bank.openingBalance + bankTb.balance,
    `${rec.reconciliation.bookBalance}`);

  // ── 2. The reconciled period is closed ────────────────────────────────────
  console.log('\n2. A reconciled period locks');
  await throws('CANNOT POST INTO A RECONCILED PERIOD',
    () => svc.recordMovement(school, {
      bankAccount: bank._id, movementType:'deposit', amount: money.toPaise(500),
      counterAccount: income._id, valueDate: new Date('2026-07-15'),
    }, accountant), /closed to new postings/);

  const laterOk = await svc.recordMovement(school, {
    bankAccount: bank._id, movementType:'deposit', amount: money.toPaise(500),
    counterAccount: income._id, valueDate: new Date('2026-08-01'),
  }, accountant);
  ok('but a LATER date still posts', !!laterOk.voucher);

  const recLine = await FmsBankTransaction.findOne({ school, reconciliationStatus:'reconciled' });
  await throws('a reconciled line cannot be unmatched',
    () => svc.unmatch(school, recLine._id, manager), /completed reconciliation/);

  await throws('the same period cannot be reconciled twice',
    () => svc.reconcile(school, bank._id, {
      from:'2026-07-01', to:'2026-07-31', bankClosingBalance: 1,
    }, manager), /already reconciled/);

  const reopened = await svc.reopen(school, rec.reconciliation._id, manager, 'Bank sent a corrected statement');
  ok('a reconciliation can be REOPENED with a reason', reopened.periodStatus === 'inProgress');
  ok('and the reason is recorded', /corrected statement/.test(reopened.notes));

  const reopenedPost = await svc.recordMovement(school, {
    bankAccount: bank._id, movementType:'deposit', amount: money.toPaise(100),
    counterAccount: income._id, valueDate: new Date('2026-07-15'),
  }, accountant);
  ok('posting into the reopened period works again', !!reopenedPost.voucher);

  // ── 3. Direction, the thing that catches people out ───────────────────────
  console.log('\n3. Direction');
  const b2 = await svc.createAccount(school, {
    accountName:'TFS Savings', accountNumber:'99887766554433', ifsc:'SBIN0001234',
    bankName:'SBI', ledgerAccount: bankGl2._id,
  }, manager);

  await svc.recordMovement(school, {
    bankAccount: b2._id, movementType:'withdrawal', amount: money.toPaise(5000),
    counterAccount: cash._id, valueDate: new Date('2026-09-01'), narration:'Cash withdrawn',
  }, accountant);

  // A statement line showing money IN of the same amount must not match it.
  await svc.importStatement(school, b2._id, {
    csv: ['Date,Narration,Deposit,Withdrawal','01/09/2026,SOMETHING ELSE,5000.00,'].join('\n'),
    mapping: { date:'Date', narration:'Narration', credit:'Deposit', debit:'Withdrawal' },
  }, accountant);

  const dirAuto = await svc.autoMatch(school, b2._id, { from:'2026-09-01', to:'2026-09-30' }, accountant);
  ok('A DEPOSIT DOES NOT MATCH A WITHDRAWAL of the same amount',
    dirAuto.applied === 0, `applied=${dirAuto.applied}`);

  // ── 4. Guards ─────────────────────────────────────────────────────────────
  console.log('\n4. Guards');
  await throws('two bank accounts cannot share a GL head',
    () => svc.createAccount(school, {
      accountName:'Duplicate', accountNumber:'111', ifsc:'X', bankName:'Y',
      ledgerAccount: bankGl._id,
    }, manager), /already used by/);

  await throws('a non-bank GL account is refused',
    () => svc.createAccount(school, {
      accountName:'Wrong', accountNumber:'222', ifsc:'X', bankName:'Y',
      ledgerAccount: cash._id,
    }, manager), /not flagged as a bank account/);

  await throws('a transfer to the same account is refused',
    () => svc.transfer(school, { fromBankAccount: b2._id, toBankAccount: b2._id, amount: 100 }, accountant),
    /two different accounts/);

  const xfer = await svc.transfer(school, {
    fromBankAccount: b2._id, toBankAccount: bank._id, amount: money.toPaise(2000),
    valueDate: new Date('2026-09-05'),
  }, accountant);
  const xd = await gl.voucherDetail(school, xfer.voucher._id);
  ok('a transfer posts Dr destination / Cr source',
    xd.lines.find((l)=>l.accountCode==='1201')?.debit === money.toPaise(2000) &&
    xd.lines.find((l)=>l.accountCode==='1202')?.credit === money.toPaise(2000));

  const taken = await FmsBankTransaction.findOne({ school, matchedEntry: { $ne: null } });
  const other = await FmsBankTransaction.findOne({ school, matchedEntry: null });
  if (taken && other) {
    await throws('ONE ledger entry cannot be matched to two statement lines',
      () => svc.manualMatch(school, other._id, taken.matchedEntry, manager), /already matched/);
  }

  // ── 5. Import errors surface ──────────────────────────────────────────────
  console.log('\n5. Import errors');
  const messy = await svc.importStatement(school, b2._id, {
    csv: [
      'Date,Narration,Deposit,Withdrawal',
      '10/09/2026,Good line,1000.00,',
      'garbage,Bad date,500.00,',
      '11/09/2026,No amount,,',
    ].join('\n'),
    mapping: { date:'Date', narration:'Narration', credit:'Deposit', debit:'Withdrawal' },
  }, accountant);
  ok('good rows import', messy.imported === 1);
  ok('BAD ROWS ARE REPORTED, not silently dropped', messy.parseErrors.length === 2);
  ok('each error names its line', messy.parseErrors.every((e)=>e.line && e.reason));

  await throws('a file with no usable rows is rejected outright',
    () => svc.importStatement(school, b2._id, { csv:'A,B\n1,2' }, accountant), /Nothing could be imported/);

  // ── 6. Final ──────────────────────────────────────────────────────────────
  console.log('\n6. Final integrity');
  const finalTb = await gl.trialBalance(school);
  ok('FINAL: debits = credits', finalTb.totals.balanced, JSON.stringify(finalTb.totals));

  await throws('a reconciliation is never deleted',
    () => FmsBankReconciliation.deleteOne({ _id: rec.reconciliation._id }), /signed statement/);

  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: /^fms_bank/ });
  ok('banking activity is audited', audits >= 4, `${audits} entries`);

  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failures:'); failures.forEach((f)=>console.log(`  - ${f}`)); }
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
  } catch (_) {}
  process.exit(1);
});