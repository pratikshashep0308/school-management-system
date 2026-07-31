// backend/fms/services/ingest/feeIngest.check.js
//
// Fee Collection → FMS integration checks. Per 04_integration_plan.md §2.
//
//   node fms/services/ingest/feeIngest.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end.
//
// The SMS client is STUBBED — this proves the FMS side handles what the SMS
// sends, without needing the SMS running or real fee data present. The shapes
// below are taken from the P0.3 discovery of the actual collections.
//
// Section 2 is the P5.1 verification: fire a fee receipt, confirm one income
// voucher and a balanced GL; fire the same event again and confirm no second
// posting.

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

  // ── Stub the SMS BEFORE the service is required ──────────────────────────
  const clientPath = require.resolve('../../client/smsClient');
  let SMS = { studentFees: [], assignments: [] };
  let smsUp = true;
  require.cache[clientPath] = {
    id: clientPath, filename: clientPath, loaded: true,
    exports: {
      // Same signature as the real client: get(path, params), returning the
      // ALREADY-UNWRAPPED array. A stub that differs from the thing it stands
      // in for tests the stub, not the code.
      // getAll() pages through endpoints that return 50 rows at a time. These
      // stubs return a whole array in one go, so paging is a single pass — but
      // the method must exist, or the service under test fails with
      // "smsClient.getAll is not a function" and tests nothing at all.
      async getAll(path, params = {}) {
        const rows = await this.get(path, params);
        return {
          rows: Array.isArray(rows) ? rows : (rows?.data || []),
          pages: 1,
          truncated: false,
        };
      },
      async get(path, params = {}) {
        if (!smsUp) throw new Error('connect ECONNREFUSED 127.0.0.1:5000');
        if (typeof path !== 'string' || path.startsWith('/api/')) {
          throw new Error(`stub: unexpected path '${path}' — the client base URL already carries /api`);
        }
        if (params && typeof params.params === 'object') {
          throw new Error('stub: params must be flat, not nested under { params }');
        }
        if (path.includes('students')) return SMS.studentFees;
        if (path.includes('assignments')) return SMS.assignments;
        return [];
      },
      async health() { return { reachable: smsUp }; },
    },
  };

  const M = require('../../models/core');
  const { FmsIncomeVoucher } = require('../../models/income');
  const { FmsAccountMapping } = require('../../models/integration');
  const svc = require('./feeIngestService');
  const mapper = require('./accountMapper');
  const gl = require('../ledger/ledgerQueryService');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const req = { user: { _id: new Types.ObjectId(), email: 'cron@fms' }, fmsRole: 'accountsManager' };

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  const mkG = (c,n,t,b) => M.FmsAccountGroup.create({ school, groupCode:c, groupName:n, accountType:t, normalBalance:b });
  const mkA = (c,n,g,t,b,x={}) => M.FmsAccount.create({ school, accountCode:c, accountName:n, accountGroup:g._id, accountType:t, normalBalance:b, ...x });

  const gAsset = await mkG('1000','Assets','asset','debit');
  const gInc = await mkG('4000','Income','income','credit');

  const cash = await mkA('1101','Cash in Hand',gAsset,'asset','debit',{ isCashAccount:true });
  const bank = await mkA('1201','Bank — Current',gAsset,'asset','debit',{ isBankAccount:true });
  const clearing = await mkA('1202','Bank — Online Collections',gAsset,'asset','debit');
  const tuition = await mkA('4101','Tuition Fee Income',gInc,'income','credit');
  const exam = await mkA('4102','Examination Fee Income',gInc,'income','credit');
  const unclassified = await mkA('4109','Fee Income — Unclassified',gInc,'income','credit');

  const FT_TUITION = new Types.ObjectId();
  const FT_EXAM = new Types.ObjectId();
  const FT_NEW = new Types.ObjectId();
  const STUDENT = new Types.ObjectId();

  const R = (r) => r * 100;

  // ── 1. The source union (P0.3 F1) ─────────────────────────────────────────
  console.log('1. The source union recovers assignment-only payments');

  const u = svc.unionPayments({
    studentFees: [{
      _id: 'sf1', student: { _id: STUDENT, name: 'Aarav Sharma', admissionNumber: 'ADM-42' },
      paymentHistory: [
        { _id: 'p1', receiptNumber: 'RCP-001', amount: 5000, paidOn: '2026-07-05', method: 'cash' },
        { _id: 'p2', receiptNumber: 'RCP-002', amount: 3000, paidOn: '2026-07-06', method: 'online' },
      ],
    }],
    assignments: [{
      _id: 'fa1', student: { _id: STUDENT, name: 'Aarav Sharma' },
      feeType: { _id: FT_TUITION, name: 'Tuition', category: 'tuition' },
      payments: [
        // Same receipt as RCP-001 — the dual-write case.
        { _id: 'q1', receiptNumber: 'RCP-001', amount: 5000, paidOn: '2026-07-05', method: 'cash' },
        // ASSIGNMENT-ONLY — the payment DD §9 would have dropped entirely.
        { _id: 'q2', receiptNumber: 'RCP-003', amount: 7500, paidOn: '2026-07-07', method: 'cheque' },
      ],
    }],
  });

  ok('the union deduplicates on receiptNumber', u.payments.length === 3, String(u.payments.length));
  ok('ASSIGNMENT-ONLY PAYMENTS ARE RECOVERED',
    u.payments.some((p) => p.receiptNumber === 'RCP-003'));
  ok('the dual-written payment appears once',
    u.payments.filter((p) => p.receiptNumber === 'RCP-001').length === 1);
  ok('and takes the RICHER record — the one carrying a fee type',
    String(u.payments.find((p) => p.receiptNumber === 'RCP-001').feeType) === String(FT_TUITION));

  const blanks = svc.unionPayments({
    studentFees: [{ _id: 'sf', student: STUDENT, paymentHistory: [
      { receiptNumber: '', amount: 100, paidOn: '2026-07-05', method: 'cash' },
      { receiptNumber: '   ', amount: 200, paidOn: '2026-07-05', method: 'cash' },
    ] }],
    assignments: [],
  });
  ok('a BLANK receipt number is reported, not keyed on', blanks.payments.length === 0);
  ok('and both are flagged as anomalies', blanks.anomalies.length === 2);
  ok('with a reason', blanks.anomalies[0].type === 'blankReceiptNumber');

  const conflict = svc.unionPayments({
    studentFees: [{ _id: 'sf', student: STUDENT, paymentHistory: [
      { receiptNumber: 'RCP-X', amount: 100, paidOn: '2026-07-05', method: 'cash' },
    ] }],
    assignments: [{ _id: 'fa', student: STUDENT, payments: [
      { receiptNumber: 'RCP-X', amount: 999, paidOn: '2026-07-05', method: 'cash' },
    ] }],
  });
  ok('the SAME receipt with DIFFERENT amounts is flagged',
    conflict.anomalies.some((a) => a.type === 'receiptAmountMismatch'));

  // ── 2. THE P5.1 VERIFICATION ──────────────────────────────────────────────
  console.log('\n2. Fire a receipt → one voucher, balanced GL → replay does nothing');

  SMS = {
    studentFees: [{
      _id: new Types.ObjectId(),
      student: { _id: STUDENT, name: 'Aarav Sharma', admissionNumber: 'ADM-42' },
      paymentHistory: [
        { _id: new Types.ObjectId(), receiptNumber: 'RCP-1001', amount: 12500,
          paidOn: '2026-07-10', method: 'cash' },
      ],
    }],
    assignments: [{
      _id: new Types.ObjectId(),
      student: { _id: STUDENT, name: 'Aarav Sharma', admissionNumber: 'ADM-42' },
      feeType: { _id: FT_TUITION, name: 'Tuition Fee', category: 'tuition' },
      payments: [
        { _id: new Types.ObjectId(), receiptNumber: 'RCP-1002', amount: 8000,
          paidOn: '2026-07-11', method: 'online', transactionId: 'TXN-88' },
      ],
    }],
  };

  const cycle1 = await svc.sync(school, {}, req);
  ok('both receipts posted', cycle1.counts.posted === 2, JSON.stringify(cycle1.counts));
  ok('none failed', (cycle1.counts.failed || 0) === 0,
    JSON.stringify(cycle1.failures?.map((f) => f.reason)));

  const vouchers = await FmsIncomeVoucher.find({ school }).lean();
  ok('ONE INCOME VOUCHER PER RECEIPT', vouchers.length === 2);
  ok('the SMS receipt number is stored',
    vouchers.some((v) => v.sourceReceiptNumber === 'RCP-1001'));
  ok('marked as coming from the SMS', vouchers.every((v) => v.sourceSystem === 'sms'));

  const cashReceipt = vouchers.find((v) => v.sourceReceiptNumber === 'RCP-1001');
  const detail = await gl.voucherDetail(school, cashReceipt.voucher);
  ok('THE GL POSTING BALANCES', detail.totals.balanced);
  ok('Dr cash for a cash payment',
    detail.lines.find((l) => l.accountCode === '1101')?.debit === R(12500));
  ok('Cr Unclassified — the StudentFee ledger carries no fee type',
    detail.lines.find((l) => l.accountCode === '4109')?.credit === R(12500));
  ok('and it is FLAGGED for reclassification', cashReceipt.needsReclassification === true);
  ok('the student is named on both lines',
    detail.lines.every((l) => l.partyName === 'Aarav Sharma'));

  const online = vouchers.find((v) => v.sourceReceiptNumber === 'RCP-1002');
  const onlineDetail = await gl.voucherDetail(school, online.voucher);
  ok('ONLINE GOES TO THE CLEARING HEAD, not the bank',
    onlineDetail.lines.find((l) => l.accountCode === '1202')?.debit === R(8000));
  ok('and is classified by its fee type',
    onlineDetail.lines.find((l) => l.accountCode === '4101')?.credit === R(8000));
  ok('so it is NOT flagged', online.needsReclassification === false);

  // THE REPLAY — the core requirement.
  const before = await M.FmsVoucher.countDocuments({ school });
  const cycle2 = await svc.sync(school, {}, req);

  ok('A REPLAY POSTS NOTHING', cycle2.counts.posted === 0, JSON.stringify(cycle2.counts));
  ok('and reports them as already present', cycle2.counts.alreadyPosted === 2);
  ok('NO SECOND VOUCHER', (await M.FmsVoucher.countDocuments({ school })) === before);
  ok('still exactly two income vouchers',
    (await FmsIncomeVoucher.countDocuments({ school })) === 2);

  const tb2 = await gl.trialBalance(school);
  ok('the trial balance did not double', tb2.totals.totalCredit === R(20500),
    String(tb2.totals.totalCredit));
  ok('and it balances', tb2.totals.balanced);

  // ── 3. Unmapped fee type surfaces, never skips ────────────────────────────
  console.log('\n3. An unmapped fee type is an ERROR, not a silent skip');

  SMS.assignments.push({
    _id: new Types.ObjectId(),
    student: { _id: STUDENT, name: 'Aarav Sharma' },
    feeType: { _id: FT_NEW, name: 'Excursion Fee', category: 'excursion' },
    payments: [{ _id: new Types.ObjectId(), receiptNumber: 'RCP-1003',
      amount: 2000, paidOn: '2026-07-12', method: 'cash' }],
  });

  const cycle3 = await svc.sync(school, {}, req);
  ok('IT FAILS RATHER THAN POSTING', cycle3.counts.failed === 1, JSON.stringify(cycle3.counts));
  ok('and it is NOT silently skipped', cycle3.counts.skipped === undefined || cycle3.counts.skipped === 0);

  const failure = cycle3.failures.find((f) => f.receiptNumber === 'RCP-1003');
  ok('the failure names the fee type', /Excursion Fee/.test(failure.reason));
  ok('and says what to do about it', /mapping/.test(failure.hint || failure.reason));
  ok('nothing was posted for it',
    (await FmsIncomeVoucher.countDocuments({ school, sourceReceiptNumber: 'RCP-1003' })) === 0);
  ok('THE REST OF THE BATCH CONTINUED', cycle3.counts.alreadyPosted === 2);

  // Add the mapping; it should now post.
  await FmsAccountMapping.create({
    school, mappingType: 'feeType', sourceKey: String(FT_NEW),
    sourceLabel: 'Excursion Fee', account: exam._id,
    accountCode: exam.accountCode, accountName: exam.accountName,
  });

  const cycle4 = await svc.sync(school, {}, req);
  ok('ONCE MAPPED, IT POSTS', cycle4.counts.posted === 1, JSON.stringify(cycle4.counts));
  const excursion = await FmsIncomeVoucher.findOne({ school, sourceReceiptNumber: 'RCP-1003' }).lean();
  ok('to the mapped head', excursion.creditAccountCode === '4102');
  ok('and is not flagged', excursion.needsReclassification === false);

  // ── 4. A bad record does not abandon the batch ────────────────────────────
  console.log('\n4. One bad record, batch continues');

  SMS.studentFees.push({
    _id: new Types.ObjectId(), student: { _id: STUDENT, name: 'Aarav Sharma' },
    paymentHistory: [
      { _id: new Types.ObjectId(), receiptNumber: 'RCP-BAD1', amount: 12.345,
        paidOn: '2026-07-13', method: 'cash' },
      { _id: new Types.ObjectId(), receiptNumber: 'RCP-BAD2', amount: 500,
        paidOn: 'not-a-date', method: 'cash' },
      { _id: new Types.ObjectId(), receiptNumber: 'RCP-GOOD', amount: 1500,
        paidOn: '2026-07-13', method: 'cash' },
    ],
  });

  const cycle5 = await svc.sync(school, {}, req);
  ok('the good record still posted', cycle5.counts.posted === 1, JSON.stringify(cycle5.counts));
  ok('and the two bad ones failed', cycle5.counts.failed === 2);
  ok('SUB-PAISA AMOUNTS ARE REJECTED, never rounded',
    /whole paise/.test(cycle5.failures.find((f) => f.receiptNumber === 'RCP-BAD1').reason));
  ok('an unparseable date is rejected',
    /date/.test(cycle5.failures.find((f) => f.receiptNumber === 'RCP-BAD2').reason));
  ok('each failure names its stage',
    cycle5.failures.every((f) => !!f.stage));

  // ── 5. Dry run changes nothing ────────────────────────────────────────────
  console.log('\n5. Dry run');
  const vouchersBefore = await M.FmsVoucher.countDocuments({ school });
  const dry = await svc.sync(school, { dryRun: true }, req);
  ok('a dry run reports what would happen', dry.dryRun === true && dry.results.length > 0);
  ok('AND WRITES NOTHING', (await M.FmsVoucher.countDocuments({ school })) === vouchersBefore);
  ok('it recognises what is already posted', dry.counts.alreadyPosted >= 3);

  // ── 6. SMS unreachable ────────────────────────────────────────────────────
  console.log('\n6. SMS unreachable');
  smsUp = false;
  const beforeDown = await M.FmsVoucher.countDocuments({ school });
  await throws('the cycle aborts cleanly', () => svc.sync(school, {}, req), /could not be reached/);
  ok('and nothing was written', (await M.FmsVoucher.countDocuments({ school })) === beforeDown);
  smsUp = true;

  // ── 7. Status and reclassification queue ──────────────────────────────────
  console.log('\n7. Status');
  const st = await svc.status(school);
  ok('status reports posted receipts', st.postedReceipts >= 4, String(st.postedReceipts));
  // Every StudentFee-sourced receipt lacks a fee type and is therefore flagged:
  // RCP-1001 from section 2 and RCP-GOOD from section 4. Asserting a hardcoded
  // 1 encoded an assumption about the fixture rather than the behaviour, and
  // broke the moment section 4 added another.
  const flagged = await FmsIncomeVoucher.countDocuments({
    school, needsReclassification: true, incomeStatus: 'posted',
  });
  ok('status agrees with the flagged vouchers',
    st.needingReclassification === flagged, `status=${st.needingReclassification} vouchers=${flagged}`);
  ok('and it is exactly the StudentFee-sourced receipts',
    flagged === (await FmsIncomeVoucher.countDocuments({
      school, sourceCollection: 'studentFee', incomeStatus: 'posted',
    })), String(flagged));
  ok('none of the fee-type-carrying receipts are flagged',
    (await FmsIncomeVoucher.countDocuments({
      school, sourceCollection: 'feeAssignment', needsReclassification: true,
    })) === 0);
  ok('and that the chart is ready', st.chartReady === true);

  // ── 8. Integrity ──────────────────────────────────────────────────────────
  console.log('\n8. Integrity');
  const tb = await gl.trialBalance(school);
  ok('FINAL: debits = credits', tb.totals.balanced, JSON.stringify(tb.totals));

  const posted = await FmsIncomeVoucher.countDocuments({ school, incomeStatus: 'posted' });
  const ingestRows = await M.FmsIngestState.countDocuments({ school, source: 'fee' });
  ok('one ingest record per posted receipt', posted === ingestRows, `vouchers=${posted} ingest=${ingestRows}`);

  await throws('a duplicate SMS receipt number is impossible at the database',
    () => FmsIncomeVoucher.create({
      school, financialYear: fy._id, receiptNumber: 'MANUAL-1', receiptDate: new Date('2026-07-10'),
      category: 'studentFee', amount: 100, paymentMode: 'cash',
      debitAccount: cash._id, creditAccount: tuition._id, payerName: 'X',
      voucher: new Types.ObjectId(), postedBy: req.user._id,
      sourceSystem: 'sms', sourceReceiptNumber: 'RCP-1001',
    }), /duplicate|E11000/i);

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