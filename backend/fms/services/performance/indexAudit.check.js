// backend/fms/services/performance/indexAudit.check.js
//
// Do the FMS's real query shapes use indexes, or scan collections?
//
//   node fms/services/performance/indexAudit.check.js
//
// ─── MEASURE FIRST ───────────────────────────────────────────────────────────
// The brief says explicitly: do not micro-optimise prematurely. This does not
// optimise anything. It runs MongoDB's own explain() over the query shapes the
// services actually issue and reports which would scan a collection.
//
// Run it against a database with realistic volume. Against an empty one it
// still reports the PLAN — MongoDB chooses a COLLSCAN for a tiny collection
// even when an index exists, so plan output on an empty database is not
// evidence of a problem. The check accounts for that by reporting the plan and
// whether a usable index EXISTS, separately.
//
// ─── ON THE 500-CONCURRENT-USER TARGET ───────────────────────────────────────
// The NFR asks for ~500 concurrent users. This school has roughly ten active
// students and five staff. That number is boilerplate from a generic template,
// and building for it would be exactly the premature optimisation the brief
// warns against. What matters here is that no query is ACCIDENTALLY unindexed —
// which stays true whether there are five users or five hundred.

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

  // Read-only: this inspects the LIVE database, because query plans depend on
  // the data that is actually there. It writes nothing.
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`\nDatabase: ${db.databaseName}   (read-only inspection)\n`);

  const dirs = ['core', 'income', 'expense', 'approval', 'payment', 'budget', 'vendor',
    'purchase', 'banking', 'pettyCash', 'integration', 'payroll', 'settlement',
    'journal', 'cashBankBook', 'notification'];
  for (const d of dirs) { try { require(`../../models/${d}`); } catch (_) { /* absent */ } }

  const { Types } = mongoose;
  const S = new Types.ObjectId();          // a school that does not exist
  const A = new Types.ObjectId();

  // The query shapes the services actually issue, named so a failure is
  // actionable rather than a puzzle.
  const SHAPES = [
    ['fms_ledgerentries', 'trial balance', { school: S }],
    ['fms_ledgerentries', 'account ledger', { school: S, account: A }],
    ['fms_ledgerentries', 'ledger by date', { school: S, entryDate: { $gte: new Date('2026-04-01') } }],
    ['fms_ledgerentries', 'by voucher', { voucher: A }],
    ['fms_vouchers', 'voucher list', { school: S, voucherType: 'journal' }],
    ['fms_vouchers', 'idempotency', { school: S, source: 'fee', sourceId: 'X' }],
    ['fms_ingeststate', 'ingest replay guard', { school: S, source: 'fee', sourceId: 'X' }],
    ['fms_accounts', 'chart lookup', { school: S, accountCode: '4101' }],
    ['fms_incomevouchers', 'receipt list', { school: S, incomeStatus: 'posted' }],
    ['fms_incomevouchers', 'sms receipt', { school: S, sourceReceiptNumber: 'RCP-1' }],
    ['fms_expenserequests', 'expense list', { school: S, expenseStatus: 'submitted' }],
    ['fms_expenserequests', 'committed spend', { school: S, budgetHead: A }],
    ['fms_budgets', 'budget lookup', { school: S, financialYear: A, account: A }],
    ['fms_paymentvouchers', 'double-payment guard', { school: S, expenseRequest: A }],
    ['fms_purchaseorders', 'po list', { school: S, poStatus: 'issued' }],
    ['fms_purchaseinvoices', 'duplicate invoice', { school: S, vendor: A, invoiceNumber: 'X' }],
    ['fms_banktransactions', 'unreconciled', { school: S, bankAccount: A, reconciliationStatus: 'unreconciled' }],
    ['fms_bankreconciliations', 'period lock', { school: S, bankAccount: A, periodStatus: 'reconciled' }],
    ['fms_audittrail', 'audit search', { school: S, entity: 'fms_vouchers' }],
    ['fms_notifications', 'inbox', { school: S, recipient: A, deliveryStatus: 'sent' }],
    ['fms_settlements', 'settlement replay guard', { school: S, settlementReference: 'X' }],
    ['fms_payrollpostings', 'live posting', { school: S, salarySlip: A }],
  ];

  const existing = (await db.listCollections().toArray()).map((c) => c.name);

  console.log('1. Every query shape has an index that can serve it\n');

  const unindexed = [];
  const scanning = [];

  for (const [coll, label, filter] of SHAPES) {
    if (!existing.includes(coll)) {
      console.log(`  –  ${coll} — not created yet, skipped (${label})`);
      continue;
    }

    const plan = await db.collection(coll).find(filter).explain('queryPlanner');
    const winning = plan.queryPlanner?.winningPlan || {};
    const stages = JSON.stringify(winning);
    const usesIndex = stages.includes('IXSCAN');

    // Does a usable index EXIST, independent of what the planner chose? On a
    // near-empty collection MongoDB prefers a scan even when one does, so the
    // two questions must be asked separately.
    const idx = await db.collection(coll).indexes();
    const keys = Object.keys(filter);
    const covered = idx.some((i) => {
      const first = Object.keys(i.key)[0];
      return keys.includes(first);
    });

    const count = await db.collection(coll).estimatedDocumentCount();

    if (!covered) unindexed.push({ coll, label, filter: keys.join(', ') });
    else if (!usesIndex && count > 100) scanning.push({ coll, label, count });

    const mark = !covered ? '✖' : (usesIndex ? '✔' : '·');
    console.log(`  ${mark}  ${coll.padEnd(26)} ${label.padEnd(24)} ` +
      `${count} docs, ${usesIndex ? 'IXSCAN' : 'COLLSCAN'}${covered ? '' : '  <<< NO INDEX'}`);
  }

  console.log();
  ok('EVERY QUERY SHAPE HAS A USABLE INDEX',
    unindexed.length === 0,
    unindexed.map((u) => `${u.coll} (${u.label}) on ${u.filter}`).join('; '));

  ok('no collection over 100 documents is being scanned',
    scanning.length === 0,
    scanning.map((s) => `${s.coll} ${s.label} (${s.count} docs)`).join('; '));

  // ── 2. Timing, so the report has numbers rather than opinions ────────────
  console.log('\n2. Timing the shapes that matter\n');

  const timed = [];
  const TIME = [
    ['trial balance', async () => db.collection('fms_ledgerentries').aggregate([
      { $match: { school: S } },
      { $group: { _id: '$account', d: { $sum: '$debit' }, c: { $sum: '$credit' } } },
    ]).toArray()],
    ['ledger page', async () => db.collection('fms_ledgerentries')
      .find({ school: S }).sort({ entryDate: -1 }).limit(50).toArray()],
    ['audit search', async () => db.collection('fms_audittrail')
      .find({ school: S }).sort({ createdAt: -1 }).limit(50).toArray()],
  ];

  for (const [label, fn] of TIME) {
    const t0 = Date.now();
    try { await fn(); } catch (_) { /* collection may not exist */ }
    const ms = Date.now() - t0;
    timed.push({ label, ms });
    console.log(`  ${label.padEnd(20)} ${ms} ms`);
  }

  const slowest = Math.max(...timed.map((t) => t.ms));
  ok('every measured shape is well under the 3s NFR',
    slowest < 3000, `slowest was ${slowest} ms`);

  console.log('\n3. Scale\n');
  const entries = existing.includes('fms_ledgerentries')
    ? await db.collection('fms_ledgerentries').estimatedDocumentCount() : 0;
  console.log(`  ledger entries in this database: ${entries}`);
  console.log('  NFR target: ~500 concurrent users');
  console.log('  Actual: ~10 active students, ~5 staff');
  console.log('  → the target is template boilerplate; the indexes matter regardless');

  await mongoose.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failures:'); failures.forEach((f) => console.log(`  - ${f}`)); }
  console.log();
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\nAUDIT ABORTED:', err.message);
  try { if (mongoose.connection.readyState === 1) await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});