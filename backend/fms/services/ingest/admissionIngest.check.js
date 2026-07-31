// backend/fms/services/ingest/admissionIngest.check.js
//
// A2 — registration fee ingest checks.
//
//   node fms/services/ingest/admissionIngest.check.js
//
// Separate database (<yourdb>_fmscheck<pid>), dropped at the end.
//
// The SMS client is STUBBED, and the stub PAGINATES — because the real endpoint
// does, at 50 by default, and smsClient throws the page metadata away. A stub
// that returned everything in one response would pass a test the real thing
// fails. Section 2 exists for exactly that.

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
    ok(name, !match || match.test(text), text.slice(0, 160));
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

  // ── Stub the SMS BEFORE the service is required ────────────────────────────
  const clientPath = require.resolve('../../client/smsClient');
  let ADMISSIONS = [];
  let smsUp = true;
  let pageRequests = [];
  require.cache[clientPath] = {
    id: clientPath, filename: clientPath, loaded: true,
    exports: {
      async get(path, params = {}) {
        if (!smsUp) throw new Error('connect ECONNREFUSED 127.0.0.1:5000');
        if (path !== '/admissions') throw new Error(`stub: unexpected path '${path}'`);
        // Behave like admissionController.getAdmissions: page/limit in, a bare
        // array out (smsClient strips the envelope).
        const page = Number(params.page) || 1;
        const limit = Number(params.limit) || 50;
        pageRequests.push({ page, limit });
        return ADMISSIONS.slice((page - 1) * limit, page * limit);
      },
    },
  };

  const svc = require('./admissionIngestService');
  const {
    FmsAccount, FmsAccountGroup, FmsFinancialYear, FmsIngestState, FmsVoucher, FmsLedgerEntry,
  } = require('../../models/core');
  const { FmsIncomeVoucher } = require('../../models/income');

  // The unique index on (school, source, sourceId) is what makes a replay a
  // no-op. Mongoose builds it in the background, so on a fresh database the
  // first replay can beat the build and post twice. Wait for it.
  await Promise.all([FmsIngestState.init(), FmsVoucher.init()]);

  const school = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();

  // ── Chart: cash + other fee income, the minimum this needs ─────────────────
  const [assets] = await FmsAccountGroup.create([{
    school, groupCode: '1100', groupName: 'Current Assets', accountType: 'asset',
    normalBalance: 'debit', createdBy: user,
  }]);
  const [income] = await FmsAccountGroup.create([{
    school, groupCode: '4100', groupName: 'Fee Income', accountType: 'income',
    normalBalance: 'credit', createdBy: user,
  }]);
  await FmsAccount.create([
    {
      school, accountCode: '1101', accountName: 'Cash in Hand', accountGroup: assets._id,
      accountType: 'asset', normalBalance: 'debit', isCashAccount: true, createdBy: user,
    },
    {
      school, accountCode: '4107', accountName: 'Other Fee Income', accountGroup: income._id,
      accountType: 'income', normalBalance: 'credit', createdBy: user,
    },
  ]);
  const [fy] = await FmsFinancialYear.create([{
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', createdBy: user,
  }]);

  const req = { user: { _id: user } };

  const admission = (over = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    studentName: 'Ravi Deshmukh',
    applicationNumber: 'APP-2026-001',
    applyingForClass: 'I',
    status: 'approved',
    registrationFee: { amount: 500, paid: true, paidOn: new Date('2026-05-12'), receiptNo: 'REG-001' },
    ...over,
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. A collected registration fee posts as income');
  // ───────────────────────────────────────────────────────────────────────────
  ADMISSIONS = [admission()];
  let cycle = await svc.sync(school, {}, req);

  ok('one fee found', cycle.feesFound === 1, `got ${cycle.feesFound}`);
  ok('one posted', cycle.counts.posted === 1, JSON.stringify(cycle.counts));
  ok('credited 4107 in the absence of 4110', cycle.postedTo === '4107', cycle.postedTo);
  ok('flagged as not using a dedicated account', cycle.usingDedicatedAccount === false);

  const ledger = await FmsLedgerEntry.find({ school }).lean();
  const debits = ledger.reduce((s, l) => s + (l.debit || 0), 0);
  const credits = ledger.reduce((s, l) => s + (l.credit || 0), 0);
  ok('ledger balances', debits === credits && debits === 50000, `${debits} vs ${credits}`);

  const iv = await FmsIncomeVoucher.findOne({ school }).lean();
  ok('income voucher categorised as admissionFee', iv?.category === 'admissionFee');
  ok('receipt number carried as a reference', iv?.reference === 'REG-001');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2. THE PAGING — the source endpoint returns 50 at a time');
  // ───────────────────────────────────────────────────────────────────────────
  // 250 admissions, all paid. A single-page fetch would post 200 and silently
  // lose 50 — the same shape of bug as the chart stopping at 25 groups.
  // Raw driver, deliberately: the models block deleteMany (financial documents
  // are never hard-deleted). This is a fixture reset, not application code.
  await mongoose.connection.db.collection('fms_ingeststate').deleteMany({});
  await mongoose.connection.db.collection('fms_vouchers').deleteMany({});
  await mongoose.connection.db.collection('fms_ledgerentries').deleteMany({});
  await mongoose.connection.db.collection('fms_incomevouchers').deleteMany({});

  ADMISSIONS = Array.from({ length: 250 }, (_, i) => admission({
    applicationNumber: `APP-2026-${String(i + 100).padStart(4, '0')}`,
    registrationFee: { amount: 500, paid: true, paidOn: new Date('2026-05-12'), receiptNo: `REG-${i}` },
  }));
  pageRequests = [];
  cycle = await svc.sync(school, {}, req);

  ok('read every admission', cycle.admissionsRead === 250, `got ${cycle.admissionsRead}`);
  ok('paged more than once', pageRequests.length > 1, `${pageRequests.length} request(s)`);
  ok('posted all 250', cycle.counts.posted === 250, JSON.stringify(cycle.counts));
  ok('did not report truncation', cycle.sourceTruncated === false);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3. Replays post nothing twice');
  // ───────────────────────────────────────────────────────────────────────────
  cycle = await svc.sync(school, {}, req);
  ok('all already present', cycle.counts.alreadyPosted === 250, JSON.stringify(cycle.counts));
  ok('nothing posted again', (cycle.counts.posted || 0) === 0);

  const voucherCount = await FmsVoucher.countDocuments({ school });
  ok('still one voucher per admission', voucherCount === 250, `got ${voucherCount}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4. Unpaid and unusable records are left alone');
  // ───────────────────────────────────────────────────────────────────────────
  ADMISSIONS = [
    admission({ registrationFee: { amount: 500, paid: false } }),                 // not collected
    admission({ registrationFee: { amount: 0, paid: true, paidOn: new Date('2026-05-12') } }),
    admission({ registrationFee: { amount: 500, paid: true } }),                  // no date
    admission({ registrationFee: undefined }),                                    // no fee at all
  ];
  cycle = await svc.sync(school, {}, req);
  ok('nothing posted', (cycle.counts.posted || 0) === 0, JSON.stringify(cycle.counts));
  ok('paid-without-amount surfaced',
    cycle.anomalies.some((a) => a.type === 'paidWithoutAmount'));
  ok('paid-without-date surfaced',
    cycle.anomalies.some((a) => a.type === 'paidWithoutDate'));
  ok('unpaid and missing are silent, not anomalies', cycle.anomalies.length === 2,
    JSON.stringify(cycle.anomalies.map((a) => a.type)));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5. A dedicated 4110 is used the moment it exists');
  // ───────────────────────────────────────────────────────────────────────────
  await FmsAccount.create([{
    school, accountCode: '4110', accountName: 'Admission & Registration Fee Income',
    accountGroup: income._id, accountType: 'income', normalBalance: 'credit', createdBy: user,
  }]);
  ADMISSIONS = [admission({ applicationNumber: 'APP-2026-9999' })];
  cycle = await svc.sync(school, { dryRun: true }, req);
  ok('preview routes to 4110', cycle.postedTo === '4110', cycle.postedTo);
  ok('reports a dedicated account in use', cycle.usingDedicatedAccount === true);
  ok('preview wrote nothing',
    (await FmsVoucher.countDocuments({ school })) === 250);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6. A closed financial year is skipped, not forced');
  // ───────────────────────────────────────────────────────────────────────────
  await FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'closed' } });
  ADMISSIONS = [admission({ applicationNumber: 'APP-2026-8888' })];
  cycle = await svc.sync(school, {}, req);
  ok('skipped rather than posted', cycle.counts.skipped === 1, JSON.stringify(cycle.counts));
  await FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'open' } });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n7. An unreachable SMS aborts before writing anything');
  // ───────────────────────────────────────────────────────────────────────────
  smsUp = false;
  await throws('cycle abandoned', () => svc.sync(school, {}, req), /could not be reached/);
  smsUp = true;

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n8. Admission claims are filed under their own source');
  // ───────────────────────────────────────────────────────────────────────────
  // If these were filed under 'fee', the deleted-receipt reconciliation would
  // walk them, find no matching receipt in /fees/students, and report every
  // registration fee as a deleted payment.
  const feeClaims = await FmsIngestState.countDocuments({ school, source: 'fee' });
  const admClaims = await FmsIngestState.countDocuments({ school, source: 'admission' });
  ok('no admission claim filed under fee', feeClaims === 0, `got ${feeClaims}`);
  ok('claims filed under admission', admClaims > 0, `got ${admClaims}`);

  // ── Result ─────────────────────────────────────────────────────────────────
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log('Failures:\n  - ' + failures.join('\n  - '));

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error('\nFATAL:', e.message);
  try { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } catch { /* */ }
  process.exit(1);
});
