// backend/fms/services/ingest/payrollIngest.check.js
//
// Payroll → FMS integration checks. Per 04_integration_plan.md §3.
//
//   node fms/services/ingest/payrollIngest.check.js
//
// The SMS client is STUBBED, with the same signature as the real one.
//
// Section 2 is the P5.2 verification: post a sample payroll, confirm the
// components hit the right accounts and the batch balances, then re-post and
// confirm idempotency.

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

  const clientPath = require.resolve('../../client/smsClient');
  let SLIPS = [];
  let smsUp = true;
  require.cache[clientPath] = {
    id: clientPath, filename: clientPath, loaded: true,
    exports: {
      async get(path, params = {}) {
        if (!smsUp) throw new Error('connect ECONNREFUSED 127.0.0.1:5000');
        if (path.startsWith('/api/')) throw new Error(`stub: path '${path}' should not carry /api`);
        if (params && typeof params.params === 'object') throw new Error('stub: params must be flat');
        if (path.includes('salary')) return SLIPS;
        return [];
      },
      async health() { return { reachable: smsUp }; },
    },
  };

  const M = require('../../models/core');
  const { FmsPayrollPosting } = require('../../models/payroll');
  const svc = require('./payrollIngestService');
  const pm = require('./payrollMapping');
  const gl = require('../ledger/ledgerQueryService');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const req = { user: { _id: new Types.ObjectId(), email: 'cron@fms' }, fmsRole: 'accountsManager' };

  await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  const mkG = (c,n,t,b) => M.FmsAccountGroup.create({ school, groupCode:c, groupName:n, accountType:t, normalBalance:b });
  const mkA = (c,n,g,t,b) => M.FmsAccount.create({ school, accountCode:c, accountName:n, accountGroup:g._id, accountType:t, normalBalance:b });

  const gAsset = await mkG('1000','Assets','asset','debit');
  const gLia = await mkG('2000','Liabilities','liability','credit');
  const gExp = await mkG('5000','Expenditure','expense','debit');

  await mkA('1201','Bank — Current',gAsset,'asset','debit');
  const salaryExp = await mkA('5101','Salary & Wages Expense',gExp,'expense','debit');
  const payable   = await mkA('2101','Salary Payable',gLia,'liability','credit');
  const pfAcct    = await mkA('2102','PF Payable',gLia,'liability','credit');
  const tdsAcct   = await mkA('2103','TDS Payable',gLia,'liability','credit');
  const loanAcct  = await mkA('2104','Staff Loan Recovery',gLia,'liability','credit');
  const otherAcct = await mkA('2109','Other Deductions Payable',gLia,'liability','credit');
  // Created, but must NEVER be posted from ingest (G1).
  const esic = await mkA('2105','ESIC Payable',gLia,'liability','credit');
  const ptax = await mkA('2106','Professional Tax Payable',gLia,'liability','credit');

  const T1 = new Types.ObjectId();
  const T2 = new Types.ObjectId();
  const R = (r) => r * 100;

  const slip = (o = {}) => ({
    _id: new Types.ObjectId(), status: 'paid',
    teacher: { _id: T1, name: 'R. Sharma' },
    month: 'July', year: 2026,
    basicSalary: 40000, grossSalary: 50000, netSalary: 42200,
    deductions: { pf: 3600, tax: 2200, loan: 1500, other: 500 },
    // These must be genuinely in the PAST. An earlier version used 2026-07-31,
    // which is in the future relative to the real clock — so the G4 rule
    // correctly fell back to updatedAt and the assertion below failed. The
    // rule was right; the fixture was not.
    paymentDate: new Date('2026-07-10'), updatedAt: new Date('2026-07-12'),
    ...o,
  });

  // ── 1. G1 — what cannot be sourced is stated, not hidden ─────────────────
  console.log('1. G1 — ESIC and Professional Tax cannot be sourced');

  SLIPS = [slip()];
  const review = await svc.sync(school, { dryRun: true }, req);

  ok('the cycle NAMES the unsourced components', review.unsourcedComponents.length === 2);
  ok('and says why', review.unsourcedComponents.every((c) => /no .* field/.test(c.reason)));
  ok('the note explains where the money would be',
    /deductions.other/.test(review.note));
  ok('ESIC and PT are the two named',
    review.unsourcedComponents.map((c) => c.code).sort().join(',') === '2105,2106');

  // ── 2. THE P5.2 VERIFICATION ─────────────────────────────────────────────
  console.log('\n2. Post a payroll → right heads, balanced → re-post does nothing');

  const cycle1 = await svc.sync(school, {}, req);
  ok('the slip posted', cycle1.counts.posted === 1, JSON.stringify(cycle1.counts));

  const record = await FmsPayrollPosting.findOne({ school }).lean();
  ok('a payroll posting was recorded', !!record);
  ok('with the voucher number', !!record.voucherNumber);

  const v = await gl.voucherDetail(school, record.voucher);
  ok('THE BATCH BALANCES', v.totals.balanced, JSON.stringify(v.totals));
  ok('six lines — one debit, five credits', v.lines.length === 6, String(v.lines.length));

  const at = (code) => v.lines.find((l) => l.accountCode === code);
  ok('Dr 5101 Salary Expense = GROSS', at('5101')?.debit === R(50000));
  ok('Cr 2101 Salary Payable = NET', at('2101')?.credit === R(42200));
  ok('Cr 2102 PF Payable', at('2102')?.credit === R(3600));
  ok('Cr 2103 TDS Payable', at('2103')?.credit === R(2200));
  ok('Cr 2104 Staff Loan Recovery', at('2104')?.credit === R(1500));
  ok('Cr 2109 Other Deductions', at('2109')?.credit === R(500));

  ok('ESIC WAS NOT POSTED', !at('2105'));
  ok('PROFESSIONAL TAX WAS NOT POSTED', !at('2106'));
  ok('the teacher is named on every line',
    v.lines.every((l) => l.partyName === 'R. Sharma' && l.partyType === 'teacher'));

  // The re-post.
  const before = await M.FmsVoucher.countDocuments({ school });
  const cycle2 = await svc.sync(school, {}, req);
  ok('A RE-RUN POSTS NOTHING', cycle2.counts.posted === 0, JSON.stringify(cycle2.counts));
  ok('and reports it as already posted', cycle2.counts.alreadyPosted === 1);
  ok('NO SECOND VOUCHER', (await M.FmsVoucher.countDocuments({ school })) === before);
  ok('still one payroll posting', (await FmsPayrollPosting.countDocuments({ school })) === 1);

  const tb = await gl.trialBalance(school);
  ok('the trial balance did not double',
    tb.lines.find((l) => l.accountCode === '5101').balance === R(50000));
  ok('and it balances', tb.totals.balanced);

  // ── 3. The balance assertion is load-bearing ─────────────────────────────
  console.log('\n3. A slip that does not reconcile is NOT posted');

  const bad = slip({ teacher: { _id: T2, name: 'M. Patel' }, grossSalary: 51000 });
  SLIPS = [SLIPS[0], bad];

  const cycle3 = await svc.sync(school, {}, req);
  ok('IT FAILS RATHER THAN POSTING', cycle3.counts.failed === 1, JSON.stringify(cycle3.counts));

  const failure = cycle3.failures[0];
  ok('the failure names the stage', failure.stage === 'balance');
  ok('and reports the difference', /off by 100000 paise/.test(failure.reason), failure.reason);
  ok('and says where to fix it', /SMS/.test(failure.hint || ''));
  ok('nothing was posted for it',
    (await FmsPayrollPosting.countDocuments({ school, teacherName: 'M. Patel' })) === 0);
  ok('THE GOOD SLIP WAS UNAFFECTED', cycle3.counts.alreadyPosted === 1);

  // ── 4. G4 — the posting date ─────────────────────────────────────────────
  console.log('\n4. G4 — which date the posting belongs to');

  const paidSlip = slip({ teacher: { _id: T2, name: 'S. Iyer' } });
  SLIPS = [paidSlip];
  const c4 = await svc.sync(school, {}, req);
  ok('a paid slip with a past paymentDate uses it', c4.counts.posted === 1);

  const rec = await FmsPayrollPosting.findOne({ school, teacherName: 'S. Iyer' }).lean();
  ok('dateChosen is recorded as paymentDate', rec.dateChosen === 'paymentDate');
  ok('the posting date is the payment date',
    rec.postingDate.toISOString().slice(0, 10) === '2026-07-10');
  ok('BOTH SOURCE DATES ARE KEPT, so the choice is auditable',
    !!rec.sourcePaymentDate && !!rec.sourceUpdatedAt);

  // A future paymentDate must fall back — it records when the slip was drafted.
  const future = slip({
    teacher: { _id: new Types.ObjectId(), name: 'K. Rao' },
    // paymentDate deliberately in the future; updatedAt in the past so the
    // fallback has something usable to land on.
    paymentDate: new Date('2027-03-01'), updatedAt: new Date('2026-07-15'),
  });
  SLIPS = [future];
  await svc.sync(school, {}, req);
  const rec2 = await FmsPayrollPosting.findOne({ school, teacherName: 'K. Rao' }).lean();
  ok('A FUTURE paymentDate FALLS BACK to updatedAt', rec2.dateChosen === 'updatedAt');
  ok('and the posting sits on the fallback date',
    rec2.postingDate.toISOString().slice(0, 10) === '2026-07-15');

  // ── 5. §3.5 — status regression forces a reversal ────────────────────────
  console.log('\n5. §3.5 — paid → pending after posting');

  const regressed = { ...paidSlip, status: 'pending' };
  SLIPS = [regressed, future];

  const c5 = await svc.sync(school, {}, req);
  ok('THE POSTING WAS REVERSED', c5.reversals.some((r) => r.status === 'reversed'),
    JSON.stringify(c5.reversals));

  const afterRev = await FmsPayrollPosting.findOne({ school, teacherName: 'S. Iyer' }).lean();
  ok('the record is marked reversed', afterRev.postingStatus === 'reversed');
  ok('with a reversal voucher', !!afterRev.reversalVoucherNumber);
  ok('and a reason', /pending/.test(afterRev.reversalReason || ''));

  const tbAfter = await gl.trialBalance(school);
  ok('the trial balance still balances after reversal', tbAfter.totals.balanced);

  // Back to paid: must post FRESH, never un-reverse.
  SLIPS = [{ ...paidSlip, status: 'paid' }, future];
  const c6 = await svc.sync(school, {}, req);
  ok('RETURNING TO PAID POSTS FRESH', c6.counts.posted === 1, JSON.stringify(c6.counts));

  const live = await FmsPayrollPosting.find({ school, teacherName: 'S. Iyer' }).lean();
  ok('there are now two records for that slip', live.length === 2, String(live.length));
  ok('one reversed, one live',
    live.filter((r) => r.postingStatus === 'reversed').length === 1 &&
    live.filter((r) => r.postingStatus === 'posted').length === 1);
  ok('THE REVERSAL WAS NOT UNDONE',
    live.find((r) => r.postingStatus === 'reversed').reversalVoucherNumber !== undefined);

  // ── 6. Dry run and status ────────────────────────────────────────────────
  console.log('\n6. Review and status');
  const vBefore = await M.FmsVoucher.countDocuments({ school });
  const dry = await svc.sync(school, { dryRun: true }, req);
  ok('a review reports every slip', dry.dryRun === true && dry.results.length > 0);
  ok('AND WRITES NOTHING', (await M.FmsVoucher.countDocuments({ school })) === vBefore);
  ok('it shows the balance check per slip',
    dry.results.every((r) => r.balance || r.status === 'failed' || r.stage));

  const st = await svc.status(school);
  ok('status counts posted slips', st.postedSlips >= 2, String(st.postedSlips));
  ok('and reversed ones', st.reversedSlips === 1, String(st.reversedSlips));
  ok('and reports the chart as ready', st.chartReady === true);
  ok('and still names the unsourced components', st.unsourcedComponents.length === 2);

  // ── 7. Guards ────────────────────────────────────────────────────────────
  console.log('\n7. Guards');
  SLIPS = [slip({ status: 'pending', teacher: { _id: new Types.ObjectId(), name: 'Never Paid' } })];
  const c7 = await svc.sync(school, {}, req);
  ok('an unpaid slip is not posted at all', c7.counts.posted === 0);

  smsUp = false;
  const beforeDown = await M.FmsVoucher.countDocuments({ school });
  await throws('the cycle aborts when the SMS is down',
    () => svc.sync(school, {}, req), /could not be reached/);
  ok('and nothing was written', (await M.FmsVoucher.countDocuments({ school })) === beforeDown);
  smsUp = true;

  await throws('payroll postings are never deleted',
    () => FmsPayrollPosting.deleteOne({ school }), /never deleted/);

  // ── 8. Integrity ─────────────────────────────────────────────────────────
  console.log('\n8. Integrity');
  const finalTb = await gl.trialBalance(school);
  ok('FINAL: debits = credits', finalTb.totals.balanced, JSON.stringify(finalTb.totals));

  ok('ESIC NEVER MOVED', !finalTb.lines.find((l) => l.accountCode === '2105'));
  ok('PROFESSIONAL TAX NEVER MOVED', !finalTb.lines.find((l) => l.accountCode === '2106'));

  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_payrollpostings' });
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
      if (n.endsWith('_fmscheck')) await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  } catch (_) { /* ignore */ }
  process.exit(1);
});