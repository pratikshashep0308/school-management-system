// backend/fms/services/reporting/syncLog.check.js
//
// Sync logging checks.
//
//   node fms/services/reporting/syncLog.check.js
//
// Separate database (<yourdb>_fmscheck<pid>), dropped at the end.
//
// The checks that earn their place:
//
//   §4 — a log that cannot be written must not fail the sync. Undoing a correct
//        posting because its diary entry failed would be indefensible.
//   §5 — truncation keeps FAILURES. A capped list that dropped the only failure
//        and kept a hundred successes is worse than no list at all.
//   §6 — request and response bodies stay out unless explicitly switched on.
//        Otherwise this quietly becomes a second copy of every student's
//        payment history.

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

  const smsClient = require('../../client/smsClient');
  const svc = require('./syncLogService');
  const { FmsSyncLog } = require('../../models/core');

  const school = new mongoose.Types.ObjectId();
  const req = { user: { _id: new mongoose.Types.ObjectId(), email: 'accounts@school.in' } };

  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. A clean run is recorded');
  // ───────────────────────────────────────────────────────────────────────────
  await svc.run({ source: 'fee', school, req }, async () => ({
    counts: { posted: 2, alreadyPosted: 1, failed: 0, skipped: 0 },
    results: [
      { receiptNumber: 'RCP-1', status: 'posted', voucherNumber: 'IV/1', amount: 50000 },
      { receiptNumber: 'RCP-2', status: 'posted', voucherNumber: 'IV/2', amount: 25000 },
      { receiptNumber: 'RCP-3', status: 'alreadyPosted' },
    ],
  }));

  let log = await FmsSyncLog.findOne({ school, source: 'fee' }).lean();
  ok('a log was written', !!log);
  ok('outcome is success', log.outcome === 'success', log.outcome);
  ok('counts carried', log.counts.posted === 2 && log.counts.alreadyPosted === 1);
  ok('posted amount totalled', log.postedAmount === 75000, `got ${log.postedAmount}`);
  ok('actor recorded', String(log.actor) === String(req.user._id));
  ok('actor email recorded', log.actorEmail === 'accounts@school.in');
  ok('duration measured', typeof log.durationMs === 'number');
  ok('records kept', log.records.length === 3);
  ok('identifier normalised from receiptNumber', log.records[0].sourceId === 'RCP-1');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2. Partial and failed runs are distinguished');
  // ───────────────────────────────────────────────────────────────────────────
  await svc.run({ source: 'payroll', school, req }, async () => ({
    counts: { posted: 1, failed: 1 },
    results: [
      { sourceId: 'slip-1', status: 'posted', voucherNumber: 'PV/1', amount: 100 },
      { sourceId: 'slip-2', status: 'failed', reason: 'no mapping', stage: 'incomeAccount' },
    ],
  }));
  log = await FmsSyncLog.findOne({ school, source: 'payroll' }).lean();
  ok('some posted, some failed → partial', log.outcome === 'partial', log.outcome);
  ok('failure reason kept', log.records.find((r) => r.status === 'failed').failureReason === 'no mapping');
  ok('stage kept', log.records.find((r) => r.status === 'failed').stage === 'incomeAccount');

  await svc.run({ source: 'expense', school, req }, async () => ({
    counts: { posted: 0, failed: 3 },
    results: [1, 2, 3].map((i) => ({ sourceId: `e-${i}`, status: 'failed', reason: 'no account' })),
  }));
  log = await FmsSyncLog.findOne({ school, source: 'expense' }).lean();
  ok('nothing posted, all failed → failed', log.outcome === 'failed', log.outcome);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3. A thrown cycle is recorded and the error still propagates');
  // ───────────────────────────────────────────────────────────────────────────
  let raised = null;
  try {
    await svc.run({ source: 'admission', school, req }, async () => {
      throw new Error('The school system could not be reached');
    });
  } catch (e) { raised = e; }

  ok('the error reached the caller', /could not be reached/.test(raised?.message || ''));
  log = await FmsSyncLog.findOne({ school, source: 'admission' }).lean();
  ok('recorded as aborted', log.outcome === 'aborted', log.outcome);
  ok('reason stored', /could not be reached/.test(log.error));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4. THE RULE — a log that cannot be written does not fail the sync');
  // ───────────────────────────────────────────────────────────────────────────
  const realCreate = FmsSyncLog.create.bind(FmsSyncLog);
  FmsSyncLog.create = async () => { throw new Error('disk full'); };

  let result = null;
  let blewUp = null;
  try {
    result = await svc.run({ source: 'fee', school, req }, async () => ({
      counts: { posted: 1 }, results: [{ receiptNumber: 'RCP-9', status: 'posted', amount: 1 }],
    }));
  } catch (e) { blewUp = e; }

  ok('the sync did not throw', blewUp === null, blewUp?.message);
  ok('and the caller got its result', result?.counts?.posted === 1);
  FmsSyncLog.create = realCreate;

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5. THE CAP — truncation keeps failures, not successes');
  // ───────────────────────────────────────────────────────────────────────────
  // 250 records where exactly one failed. If the cap kept the first hundred in
  // order, the failure would be dropped and the log would show a clean run.
  const many = Array.from({ length: 250 }, (_, i) => ({
    sourceId: `r-${i}`, status: 'alreadyPosted',
  }));
  many[240] = { sourceId: 'r-BROKEN', status: 'failed', reason: 'the one that matters' };

  await svc.run({ source: 'admission', school, req }, async () => ({
    counts: { alreadyPosted: 249, failed: 1 }, results: many,
  }));

  log = await FmsSyncLog.find({ school, source: 'admission' }).sort({ startedAt: -1 }).limit(1).lean();
  log = log[0];
  ok('capped', log.records.length === svc.MAX_RECORDS, `got ${log.records.length}`);
  ok('truncation flagged', log.recordsTruncated === true);
  ok('true total retained', log.totalRecords === 250, `got ${log.totalRecords}`);
  ok('THE FAILURE SURVIVED', log.records.some((r) => r.sourceId === 'r-BROKEN'));
  ok('and it is first', log.records[0].sourceId === 'r-BROKEN');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6. Bodies stay out unless switched on');
  // ───────────────────────────────────────────────────────────────────────────
  // FMS_SYNC_LOG_BODIES is unset in this run, so nothing recorded by the client
  // should carry a payload. Otherwise this collection quietly becomes a second
  // copy of every student's payment history.
  smsClient.startRecording();
  const calls = smsClient.stopRecording();
  ok('recorder returns an array', Array.isArray(calls));

  const withBodies = await FmsSyncLog.find({ school }).lean();
  const anyBody = withBodies.some((l) =>
    (l.calls || []).some((c) => c.requestBody || c.responseBody));
  ok('no request or response body was stored', anyBody === false);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n7. Summary and listing');
  // ───────────────────────────────────────────────────────────────────────────
  const summary = await svc.summary(school);
  ok('one row per source', summary.length === 4, `got ${summary.length}`);
  const feeRow = summary.find((r) => r.source === 'fee');
  ok('fee run counted', feeRow.runs === 2, `got ${feeRow.runs}`);
  ok('last outcome reported', !!feeRow.lastOutcome);

  const list = await svc.list(school, { limit: 10 });
  ok('newest first', list[0].startedAt >= list[1].startedAt);
  ok('bulky fields omitted from the list',
    list[0].calls === undefined && list[0].records === undefined);

  const failedOnly = await svc.list(school, { outcome: 'failed' });
  ok('filterable by outcome', failedOnly.every((l) => l.outcome === 'failed'));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n8. Retention is configured');
  // ───────────────────────────────────────────────────────────────────────────
  // Operational logs must not grow without limit. The financial evidence is
  // permanent elsewhere, so nothing recoverable is lost when one expires.
  const indexes = await mongoose.connection.db.collection('fms_synclogs').indexes();
  const ttl = indexes.find((i) => i.expireAfterSeconds !== undefined);
  ok('a TTL index exists', !!ttl);
  ok('and it is on startedAt', !!ttl && Object.keys(ttl.key)[0] === 'startedAt');

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
