// backend/fms/services/ingest/expenseIngest.check.js
//
// SMS Expense → FMS integration checks. Per 04_integration_plan.md §4.
//
//   node fms/services/ingest/expenseIngest.check.js
//
// Section 1 asserts what P5.3 does NOT rebuild — the purchase postings §4
// specifies already exist in P4.3, and duplicating them would be the actual
// mistake here.

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

  const clientPath = require.resolve('../../client/smsClient');
  let EXPENSES = [];
  let smsUp = true;
  require.cache[clientPath] = {
    id: clientPath, filename: clientPath, loaded: true,
    exports: {
      async get(path, params = {}) {
        if (!smsUp) throw new Error('connect ECONNREFUSED 127.0.0.1:5000');
        if (path.startsWith('/api/')) throw new Error(`stub: path '${path}' should not carry /api`);
        if (params && typeof params.params === 'object') throw new Error('stub: params must be flat');
        if (path.includes('expenses')) return EXPENSES;
        return [];
      },
      async health() { return { reachable: smsUp }; },
    },
  };

  const M = require('../../models/core');

  // ── Wait for the indexes ───────────────────────────────────────────────────
  // Mongoose builds indexes in the BACKGROUND after a model is first used. This
  // file creates a fresh database on every run, so the unique index on
  // (school, source, sourceId) — the thing that makes ingest idempotent — may
  // not exist yet when the first replay is attempted.
  //
  // That is exactly what the "A REPLAY IMPORTS NOTHING" and "a duplicate source
  // id is impossible at the database" failures were: not a broken guarantee, a
  // race against the index build. It is intermittent, which is why this suite
  // passed one run and failed the next while banking did the opposite.
  //
  // init() resolves once the build is done.
  await Promise.all([M.FmsIngestState.init(), M.FmsVoucher.init()]);
  const { FmsExpenseRequest } = require('../../models/expense');
  const { FmsAccountMapping } = require('../../models/integration');
  const svc = require('./expenseIngestService');
  const purchaseSvc = require('../purchase/purchaseService');
  const gl = require('../ledger/ledgerQueryService');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const req = { user: { _id: new Types.ObjectId(), email: 'cron@fms' }, fmsRole: 'accountsManager' };

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });
  await M.FmsNumberSequence.create({
    school, financialYear: fy._id, type: 'EXP', prefix: 'EXP',
    yearLabel: fy.yearCode, sequence: 0, padding: 5,
  });

  const mkG = (c,n,t,b) => M.FmsAccountGroup.create({ school, groupCode:c, groupName:n, accountType:t, normalBalance:b });
  const mkA = (c,n,g,t,b,x={}) => M.FmsAccount.create({ school, accountCode:c, accountName:n, accountGroup:g._id, accountType:t, normalBalance:b, ...x });

  const gAsset = await mkG('1000','Assets','asset','debit');
  const gLia = await mkG('2000','Liabilities','liability','credit');
  const gExp = await mkG('5000','Expenditure','expense','debit');

  const cash = await mkA('1101','Cash in Hand',gAsset,'asset','debit',{ isCashAccount:true });
  const bank = await mkA('1201','Bank — Current',gAsset,'asset','debit',{ isBankAccount:true });
  const creditors = await mkA('2201','Sundry Creditors',gLia,'liability','credit');
  const stationery = await mkA('5201','Printing & Stationery',gExp,'expense','debit');
  const other = await mkA('5299','Other Expenses',gExp,'expense','debit');

  const CAT_STATIONERY = new Types.ObjectId();
  const CAT_UNKNOWN = new Types.ObjectId();
  const R = (r) => r * 100;

  // ── 1. What P5.3 does NOT rebuild ────────────────────────────────────────
  console.log('1. The purchase postings §4 specifies already exist (P4.3)');

  ok('the Purchase module resolves a Sundry Creditors account',
    typeof purchaseSvc.creditorsAccount === 'function');
  ok('it exposes invoice verification (posts the payable)',
    typeof purchaseSvc.verifyInvoice === 'function');
  ok('and payment (settles it)', typeof purchaseSvc.payInvoice === 'function');
  ok('THE EXPENSE INGEST DOES NOT DUPLICATE THEM',
    typeof svc.verifyInvoice === 'undefined' && typeof svc.payInvoice === 'undefined');
  ok('and it says so in its status', /Purchase module/.test((await svc.status(school)).note));

  // ── 2. The one genuine boundary ──────────────────────────────────────────
  console.log('\n2. SMS expenses import');

  EXPENSES = [
    { _id: new Types.ObjectId(), amount: 2500, date: '2026-07-10',
      description: 'A4 paper and toner', paidTo: 'Sharma Stationers',
      category: { _id: CAT_STATIONERY, name: 'Stationery' }, categoryName: 'Stationery',
      paymentMethod: 'cash', billNumber: 'B-4471' },
    { _id: new Types.ObjectId(), amount: 1800, date: '2026-07-12',
      description: 'Plumbing repair', paidTo: 'Local plumber',
      category: { _id: CAT_UNKNOWN, name: 'Maintenance' }, categoryName: 'Maintenance',
      paymentMethod: 'cash' },
  ];

  await FmsAccountMapping.create({
    school, mappingType: 'expenseCategory', sourceKey: String(CAT_STATIONERY),
    sourceLabel: 'Stationery', account: stationery._id,
    accountCode: stationery.accountCode, accountName: stationery.accountName,
  });

  const c1 = await svc.sync(school, {}, req);
  ok('both imported', c1.counts.posted === 2, JSON.stringify(c1.counts));

  const imported = await FmsExpenseRequest.find({ school, sourceSystem: 'sms' }).lean();
  ok('two FMS expense records created', imported.length === 2);
  ok('each has an expense number', imported.every((e) => /^EXP-2026-27-\d{5}$/.test(e.expenseNumber)));

  const mapped = imported.find((e) => e.purpose === 'A4 paper and toner');
  ok('a MAPPED category goes to its head', mapped.budgetHeadCode === '5201');
  ok('and is not flagged', mapped.needsReclassification === false);

  const unmapped = imported.find((e) => e.purpose === 'Plumbing repair');
  ok('an UNMAPPED category falls back to Other Expenses', unmapped.budgetHeadCode === '5299');
  ok('and IS flagged for reclassification', unmapped.needsReclassification === true);

  const v = await gl.voucherDetail(school, (await M.FmsVoucher.findOne({
    school, narration: /A4 paper/,
  }).lean())._id);
  ok('the posting balances', v.totals.balanced);
  ok('Dr the expense head', v.lines.find((l) => l.accountCode === '5201')?.debit === R(2500));
  ok('Cr cash', v.lines.find((l) => l.accountCode === '1101')?.credit === R(2500));

  // ── 3. No manufactured approvals ─────────────────────────────────────────
  console.log('\n3. An imported expense does not pretend to be approved');

  ok('it is recorded as COMPLETED — the money is already gone',
    imported.every((e) => e.expenseStatus === 'paymentCompleted'));
  ok('with exactly ONE workflow entry', imported.every((e) => e.workflow.length === 1));
  ok('and that entry is an import, not an approval',
    imported.every((e) => e.workflow[0].action === 'import'));
  ok('WHICH SAYS SO IN WORDS',
    imported.every((e) => /NOT verified or approved/.test(e.workflow[0].comment)));
  ok('no approval records were fabricated',
    (await mongoose.connection.db.collection('fms_expenseapprovals')
      .countDocuments({ school })) === 0);

  // ── 4. Idempotency ───────────────────────────────────────────────────────
  console.log('\n4. Idempotency');
  const before = await M.FmsVoucher.countDocuments({ school });
  const c2 = await svc.sync(school, {}, req);
  ok('A REPLAY IMPORTS NOTHING', c2.counts.posted === 0, JSON.stringify(c2.counts));
  ok('and reports them as already present', c2.counts.alreadyPosted === 2);
  ok('no second voucher', (await M.FmsVoucher.countDocuments({ school })) === before);
  ok('still two expense records',
    (await FmsExpenseRequest.countDocuments({ school, sourceSystem: 'sms' })) === 2);

  await throws('a duplicate source id is impossible at the database',
    () => FmsExpenseRequest.create({
      school, financialYear: fy._id, expenseNumber: 'EXP-DUP',
      requestDate: new Date('2026-07-10'), department: { name: 'X' },
      requestedBy: req.user._id, category: 'X', purpose: 'X',
      budgetHead: other._id, baseAmount: 100, totalAmount: 100, paymentMode: 'cash',
      sourceSystem: 'sms', sourceExpenseId: EXPENSES[0]._id,
    }), /duplicate|E11000/i);

  // ── 5. Bad records ───────────────────────────────────────────────────────
  console.log('\n5. Bad records');
  EXPENSES.push(
    { _id: new Types.ObjectId(), amount: 12.345, date: '2026-07-14',
      description: 'Sub-paisa', categoryName: 'X', paymentMethod: 'cash' },
    { _id: new Types.ObjectId(), amount: 500, date: 'not-a-date',
      description: 'Bad date', categoryName: 'X', paymentMethod: 'cash' },
    { _id: new Types.ObjectId(), amount: 900, date: '2026-07-15',
      description: 'Good one', categoryName: 'X', paymentMethod: 'cash' },
  );

  const c3 = await svc.sync(school, {}, req);
  ok('the good record imported', c3.counts.posted === 1, JSON.stringify(c3.counts));
  ok('the two bad ones failed', c3.counts.failed === 2);
  ok('sub-paisa is rejected, never rounded',
    /whole paise/.test(c3.failures.find((f) => f.stage === 'amount').reason));
  ok('a bad date is rejected', c3.failures.some((f) => f.stage === 'date'));
  ok('the batch continued', c3.counts.alreadyPosted === 2);

  // ── 6. Dry run, status, SMS down ─────────────────────────────────────────
  console.log('\n6. Dry run and guards');
  const vBefore = await M.FmsVoucher.countDocuments({ school });
  const dry = await svc.sync(school, { dryRun: true }, req);
  ok('a dry run reports', dry.dryRun === true && dry.results.length > 0);
  ok('AND WRITES NOTHING', (await M.FmsVoucher.countDocuments({ school })) === vBefore);

  const st = await svc.status(school);
  ok('status counts imports', st.importedExpenses === 3, String(st.importedExpenses));
  ok('and unmapped categories', st.unmappedCategories >= 1, String(st.unmappedCategories));
  ok('and confirms the fallback account exists', st.fallbackAccountPresent === true);

  smsUp = false;
  const beforeDown = await M.FmsVoucher.countDocuments({ school });
  await throws('the cycle aborts when the SMS is down',
    () => svc.sync(school, {}, req), /could not be reached/);
  ok('and nothing was written', (await M.FmsVoucher.countDocuments({ school })) === beforeDown);
  smsUp = true;

  // ── 7. Integrity ─────────────────────────────────────────────────────────
  console.log('\n7. Integrity');
  const tb = await gl.trialBalance(school);
  ok('FINAL: debits = credits', tb.totals.balanced, JSON.stringify(tb.totals));
  ok('SUNDRY CREDITORS NEVER MOVED — imports are not payables',
    !tb.lines.find((l) => l.accountCode === '2201'));

  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_expenserequests' });
  ok('cycles are audited', audits >= 3, `${audits} entries`);

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