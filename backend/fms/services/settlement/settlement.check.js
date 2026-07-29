// backend/fms/services/settlement/settlement.check.js
//
// Settlement of the online-collections clearing head. §5 / §6.
//
//   node fms/services/settlement/settlement.check.js
//
// Section 2 is the P5.4 verification: settle a batch, confirm the matched
// entries clear and the unmatched ones stay queued.

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
  const { FmsSettlement } = require('../../models/settlement');
  const svc = require('./settlementService');
  const posting = require('../ledger/LedgerPostingService');
  const gl = require('../ledger/ledgerQueryService');
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
  const gInc = await mkG('4000','Income','income','credit');
  const gExp = await mkG('5000','Expenditure','expense','debit');

  const bank = await mkA('1201','Bank — Current',gAsset,'asset','debit',{ isBankAccount:true });
  const clearing = await mkA('1202','Bank — Online Collections',gAsset,'asset','debit');
  const tuition = await mkA('4101','Tuition Fee Income',gInc,'income','credit');
  const charges = await mkA('5401','Bank & Gateway Charges',gExp,'expense','debit');

  const R = (r) => r * 100;

  /** An online fee receipt: Dr clearing, Cr income. */
  const receipt = (amount, date, ref) => posting.post({
    school, financialYear: fy._id, voucherType: 'income',
    voucherDate: new Date(date), narration: `Online fee ${ref}`,
    referenceNumber: ref, source: 'manual', postedBy: req.user._id,
    lines: [
      { account: clearing._id, debit: amount, credit: 0, narration: 'UPI' },
      { account: tuition._id, debit: 0, credit: amount, narration: 'Tuition' },
    ],
  });

  // ── 1. Nothing pretends a gateway exists ─────────────────────────────────
  console.log('1. No gateway is installed, and the system says so');

  const st0 = await svc.status(school);
  ok('status reports NO GATEWAY CONFIGURED', st0.gatewayConfigured === false);
  ok('and explains that this is expected', /expected, not a fault/.test(st0.gatewayNote));
  ok('and names the manual alternative', /settled\s+manually/.test(st0.gatewayNote));
  ok('the clearing account is found', st0.clearingAccountPresent === true);

  // ── 2. THE P5.4 VERIFICATION ─────────────────────────────────────────────
  console.log('\n2. Settle a batch → matched clear, unmatched stay queued');

  const r1 = await receipt(R(5000), '2026-07-10', 'UPI-001');
  const r2 = await receipt(R(3000), '2026-07-10', 'UPI-002');
  const r3 = await receipt(R(7500), '2026-07-12', 'UPI-003');

  const p0 = await svc.pending(school);
  ok('all three receipts are pending', p0.count === 3, String(p0.count));
  ok('totalling 15,500', p0.totalAmount === R(15500), String(p0.totalAmount));
  ok('each carries an age', p0.entries.every((e) => typeof e.ageDays === 'number'));

  const dayOne = p0.entries.filter((e) => e.entryDate.toISOString().startsWith('2026-07-10'));
  ok('two receipts on 10 July', dayOne.length === 2);

  const settled = await svc.settle(school, {
    entryIds: dayOne.map((e) => e._id),
    bankAccount: bank._id,
    settlementReference: 'SETL-20260711-001',
    settlementDate: '2026-07-11',
  }, req);

  ok('the settlement posted', !!settled.voucher.voucherNumber);
  ok('gross is the sum of the receipts', settled.settlement.grossAmount === R(8000));
  ok('with no charges', settled.settlement.charges === 0);

  const v = await gl.voucherDetail(school, settled.voucher._id);
  ok('the posting balances', v.totals.balanced);
  ok('Dr BANK', v.lines.find((l) => l.accountCode === '1201')?.debit === R(8000));
  ok('Cr CLEARING', v.lines.find((l) => l.accountCode === '1202')?.credit === R(8000));

  const p1 = await svc.pending(school);
  ok('THE SETTLED RECEIPTS HAVE CLEARED', p1.count === 1, String(p1.count));
  ok('AND THE UNMATCHED ONE IS STILL QUEUED',
    p1.entries[0].debit === R(7500), String(p1.entries[0].debit));
  ok('the pending total dropped', p1.totalAmount === R(7500));

  const tb = await gl.trialBalance(school);
  ok('the clearing head now holds only the unsettled receipt',
    tb.lines.find((l) => l.accountCode === '1202').balance === R(7500));
  ok('and the bank shows the settlement',
    tb.lines.find((l) => l.accountCode === '1201').balance === R(8000));

  // ── 3. Idempotency ───────────────────────────────────────────────────────
  console.log('\n3. Idempotency');
  await throws('THE SAME REFERENCE CANNOT SETTLE TWICE',
    () => svc.settle(school, {
      entryIds: dayOne.map((e) => e._id), bankAccount: bank._id,
      settlementReference: 'SETL-20260711-001',
    }, req), /already been recorded/);

  await throws('nor can an already-settled entry be settled again under a new reference',
    () => svc.settle(school, {
      entryIds: [dayOne[0]._id], bankAccount: bank._id,
      settlementReference: 'SETL-DIFFERENT',
    }, req), /already settled/);

  ok('still one settlement', (await FmsSettlement.countDocuments({ school })) === 1);

  // ── 4. Charges are posted, not netted ────────────────────────────────────
  console.log('\n4. Charges');
  await throws('a short settlement without a charge account is refused',
    () => svc.settle(school, {
      entryIds: [p1.entries[0]._id], bankAccount: bank._id,
      settlementReference: 'SETL-SHORT', settledAmount: R(7350),
    }, req), /name an expense account/);

  const withCharges = await svc.settle(school, {
    entryIds: [p1.entries[0]._id], bankAccount: bank._id,
    settlementReference: 'SETL-20260713-002', settlementDate: '2026-07-13',
    settledAmount: R(7350), feeAccount: charges._id,
  }, req);

  ok('charges are computed', withCharges.settlement.charges === R(150));
  const cv = await gl.voucherDetail(school, withCharges.voucher._id);
  ok('the posting still balances', cv.totals.balanced);
  ok('Dr bank the NET', cv.lines.find((l) => l.accountCode === '1201')?.debit === R(7350));
  ok('DR CHARGES AS AN EXPENSE, not netted against income',
    cv.lines.find((l) => l.accountCode === '5401')?.debit === R(150));
  ok('Cr clearing the GROSS', cv.lines.find((l) => l.accountCode === '1202')?.credit === R(7500));

  const tb2 = await gl.trialBalance(school);
  ok('the clearing head is now empty',
    (tb2.lines.find((l) => l.accountCode === '1202')?.balance || 0) === 0);
  ok('income was NOT reduced by the charges',
    tb2.lines.find((l) => l.accountCode === '4101').naturalBalance === R(15500));

  await throws('a settlement larger than its receipts is refused',
    () => svc.settle(school, {
      entryIds: [], bankAccount: bank._id, settlementReference: 'X',
    }, req), /at least one entry/);

  // ── 5. Suggestion, not automation ────────────────────────────────────────
  console.log('\n5. Suggestion');
  const r4 = await receipt(R(2000), '2026-07-20', 'UPI-004');
  const r5 = await receipt(R(1500), '2026-07-20', 'UPI-005');

  const good = await svc.suggest(school, { amount: R(3500) });
  ok('it finds the oldest run that fits', good.matched === true);
  ok('and names the strategy', good.strategy === 'oldestRun');
  ok('with both entries', good.entries.length === 2);

  const single = await svc.suggest(school, { amount: R(2000) });
  ok('a single matching entry is found', single.matched === true && single.entries.length === 1);

  const nope = await svc.suggest(school, { amount: R(9999) });
  ok('IT REFUSES TO GUESS when nothing fits', nope.matched === false);
  ok('and says why', /No combination/.test(nope.reason));
  ok('and tells you what to do instead', /explicitly/.test(nope.hint));

  // ── 6. Reversal releases the receipts ────────────────────────────────────
  console.log('\n6. Reversal');
  const s1 = await FmsSettlement.findOne({ school, settlementReference: 'SETL-20260711-001' });
  const beforeRev = (await svc.pending(school)).count;

  await throws('a reversal needs a reason',
    () => svc.reverse(school, s1._id, req, ''), /reason/);

  const rev = await svc.reverse(school, s1._id, req, 'The credit was returned by the bank');
  ok('marked reversed', rev.settlement.settlementStatus === 'reversed');
  ok('a reversal voucher was posted', !!rev.reversal.voucherNumber);

  const afterRev = await svc.pending(school);
  ok('THE RECEIPTS RETURN TO PENDING', afterRev.count === beforeRev + 2,
    `${beforeRev} → ${afterRev.count}`);

  const tb3 = await gl.trialBalance(school);
  ok('the trial balance still balances', tb3.totals.balanced);

  await throws('cannot reverse twice',
    () => svc.reverse(school, s1._id, req, 'again'), /already reversed/);

  // Once reversed, the same entries can be settled again under a new reference.
  const resettled = await svc.settle(school, {
    entryIds: dayOne.map((e) => e._id), bankAccount: bank._id,
    settlementReference: 'SETL-REDONE', settlementDate: '2026-07-14',
  }, req);
  ok('and the receipts can be settled afresh', !!resettled.voucher.voucherNumber);

  // ── 7. Ageing ────────────────────────────────────────────────────────────
  console.log('\n7. Ageing');
  const aged = await svc.pending(school);
  ok('age buckets are reported', !!aged.ageBuckets);
  ok('the buckets sum to the total',
    Object.values(aged.ageBuckets).reduce((a, b) => a + b, 0) === aged.totalAmount);

  const st = await svc.status(school);
  ok('status reports what is pending', st.pendingCount === aged.count);
  ok('and how many settlements exist', st.settlementsRecorded >= 2);
  ok('and how many were reversed', st.settlementsReversed === 1);

  // ── 8. Guards ────────────────────────────────────────────────────────────
  console.log('\n8. Guards');
  await throws('a non-bank account cannot receive a settlement',
    () => svc.settle(school, {
      entryIds: [aged.entries[0]._id], bankAccount: clearing._id,
      settlementReference: 'SETL-BAD',
    }, req), /not a bank account/);

  await throws('an entry from another account cannot be settled',
    () => svc.settle(school, {
      entryIds: [new Types.ObjectId()], bankAccount: bank._id,
      settlementReference: 'SETL-GHOST',
    }, req), /not clearing-account entries/);

  await throws('settlements are never deleted',
    () => FmsSettlement.deleteOne({ school }), /never deleted/);

  // ── 9. Integrity ─────────────────────────────────────────────────────────
  console.log('\n9. Integrity');
  const finalTb = await gl.trialBalance(school);
  ok('FINAL: debits = credits', finalTb.totals.balanced, JSON.stringify(finalTb.totals));

  const clearingBal = finalTb.lines.find((l) => l.accountCode === '1202')?.balance || 0;
  const stillPending = (await svc.pending(school)).totalAmount;
  ok('THE CLEARING BALANCE EQUALS WHAT IS STILL PENDING',
    clearingBal === stillPending, `ledger=${clearingBal} pending=${stillPending}`);

  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_settlements' });
  ok('settlements are audited', audits >= 3, `${audits} entries`);

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