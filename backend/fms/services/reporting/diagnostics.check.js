// backend/fms/services/reporting/diagnostics.check.js
//
// Consolidated diagnostics checks.
//
//   node fms/services/reporting/diagnostics.check.js
//
// Separate database (<yourdb>_fmscheck<pid>), dropped at the end.
//
// Two things matter here and the rest is plumbing:
//
//   §3 — one broken endpoint must not empty the screen. Every other check has
//        to keep working, and the broken one has to say it broke.
//   §4 — "could not be checked" must never render as "nothing found". Those are
//        opposite facts. If a failed check reported severity 'none', the
//        dashboard would show green while blind, which is the worst possible
//        failure mode for a tool whose whole job is noticing.

const mongoose = require('mongoose');
require('dotenv').config();

let pass = 0; let fail = 0; const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log(`  ✔ ${name}`); }
  else { fail += 1; failures.push(name); console.log(`  ✖ ${name}${detail ? '  — ' + detail : ''}`); }
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

  // ── Stub every SMS endpoint the diagnostics touch ──────────────────────────
  const clientPath = require.resolve('../../client/smsClient');
  const SMS = {
    '/fees/students': [],
    '/fees/assignments': [],
    '/fees/payments-ledger': [],
    '/fees/types': [{ name: 'Tuition Fee', category: 'tuition', isActive: true }],
    '/transport/fees': [],
    '/admissions': [],
    '/library/issues': [],
    '/salary': [],
  };
  const broken = new Set();
  require.cache[clientPath] = {
    id: clientPath, filename: clientPath, loaded: true,
    exports: {
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
      async get(path) {
        if (broken.has(path)) throw new Error(`SMS GET ${path} failed (503): upstream down`);
        if (!(path in SMS)) throw new Error(`stub: unexpected path '${path}'`);
        return SMS[path];
      },
    },
  };

  const svc = require('./diagnosticsService');
  const { FmsAccount, FmsAccountGroup } = require('../../models/core');

  const school = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();

  const [grp] = await FmsAccountGroup.create([{
    school, groupCode: '4100', groupName: 'Fee Income', accountType: 'income',
    normalBalance: 'credit', createdBy: user,
  }]);
  await FmsAccount.create([{
    school, accountCode: '4101', accountName: 'Tuition Fee Income', accountGroup: grp._id,
    accountType: 'income', normalBalance: 'credit', createdBy: user,
  }]);

  const find = (r, id) => r.checks.find((c) => c.id === id);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. A quiet system reports clear');
  // ───────────────────────────────────────────────────────────────────────────
  let r = await svc.runAll(school);
  ok('all seven checks ran', r.checksRun === 7, `got ${r.checksRun}`);
  ok('none failed', r.checksFailed === 0, `got ${r.checksFailed}`);
  ok('overall is clear', r.overall === 'none', r.overall);
  ok('declares itself read-only', r.readOnly === true);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2. Findings are picked up and ranked');
  // ───────────────────────────────────────────────────────────────────────────
  SMS['/transport/fees'] = [
    { _id: new mongoose.Types.ObjectId(), paidAmount: 600, month: 5, year: 2026, receiptNo: 'TRP-1' },
    { _id: new mongoose.Types.ObjectId(), paidAmount: 600, month: 6, year: 2026, receiptNo: 'TRP-2' },
  ];
  SMS['/fees/payments-ledger'] = [
    { receiptNumber: 'RCP-ORPHAN-1', amount: 1500, paidOn: new Date('2026-05-02'), method: 'cash' },
  ];
  SMS['/library/issues'] = [{ _id: new mongoose.Types.ObjectId(), lateFee: 45 }];

  r = await svc.runAll(school);

  const transport = find(r, 'transportUsage');
  ok('transport payments found', transport.count === 2, `got ${transport.count}`);
  ok('transport total in rupees', transport.totalRupees === 1200, `got ${transport.totalRupees}`);
  ok('transport is a warning, not critical', transport.severity === 'warn');

  const only = find(r, 'feePaymentOnly');
  ok('third-store receipt found', only.count === 1, `got ${only.count}`);
  ok('and treated as critical — no report counts it', only.severity === 'critical');

  const lib = find(r, 'libraryFines');
  ok('library fines found', lib.count === 1);
  // Nothing is missing from the books: nothing was ever recorded as received.
  ok('library is information, not a finance failure', lib.severity === 'info');

  ok('overall takes the worst', r.overall === 'critical', r.overall);
  ok('worst check is listed first', r.checks[0].severity === 'critical');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3. THE ISOLATION — one dead endpoint does not empty the screen');
  // ───────────────────────────────────────────────────────────────────────────
  broken.add('/transport/fees');
  r = await svc.runAll(school);

  ok('every check still ran', r.checksRun === 7, `got ${r.checksRun}`);
  ok('exactly one failed', r.checksFailed === 1, `got ${r.checksFailed}`);
  ok('the broken one is marked not-ok', find(r, 'transportUsage').ok === false);
  ok('the others still produced findings', find(r, 'feePaymentOnly').count === 1);
  ok('the failure carries its reason', /upstream down/.test(find(r, 'transportUsage').detail));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4. THE DISTINCTION — "could not check" is not "nothing found"');
  // ───────────────────────────────────────────────────────────────────────────
  const failed = find(r, 'transportUsage');
  ok('a failed check is never severity none', failed.severity !== 'none', failed.severity);
  ok('it says it could not be checked', /Could not be checked/.test(failed.headline));
  ok('and says the result means nothing', /tells you nothing/.test(failed.recommendation));
  broken.delete('/transport/fees');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5. Several endpoints down at once');
  // ───────────────────────────────────────────────────────────────────────────
  broken.add('/library/issues');
  broken.add('/salary');
  r = await svc.runAll(school);
  ok('two failures reported', r.checksFailed === 2, `got ${r.checksFailed}`);
  ok('surviving checks unaffected', find(r, 'transportUsage').count === 2);
  broken.clear();

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6. Nothing was written');
  // ───────────────────────────────────────────────────────────────────────────
  const collections = await mongoose.connection.db.listCollections().toArray();
  const before = {};
  for (const c of collections) {
    before[c.name] = await mongoose.connection.db.collection(c.name).countDocuments();
  }
  await svc.runAll(school);
  let clean = true;
  for (const [name, count] of Object.entries(before)) {
    const now = await mongoose.connection.db.collection(name).countDocuments();
    if (now !== count) { clean = false; console.log(`    ${name}: ${count} → ${now}`); }
  }
  ok('no collection changed', clean);

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
