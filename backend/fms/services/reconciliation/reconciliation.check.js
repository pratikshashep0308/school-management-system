// backend/fms/services/reconciliation/reconciliation.check.js
//
// D1 — deleted-receipt reconciliation checks.
//
//   node fms/services/reconciliation/reconciliation.check.js
//
// Separate database (<yourdb>_fmscheck<pid>), dropped at the end. The pid suffix
// is deliberate: two check files sharing a database name raced each other and
// dropped the other's collections mid-run.
//
// The SMS client is STUBBED. The whole point of this service is what it does
// when the SMS answers oddly, and the only way to test that is to make the SMS
// answer oddly on demand.
//
// What is actually being proved here is not "it finds orphans" — that part is a
// set difference and hard to get wrong. It is that the service REFUSES to
// report orphans when it cannot tell deletion from a bad fetch. Sections 3 and 4
// are the ones that matter.

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
  let SMS = { studentFees: [], assignments: [] };
  let smsUp = true;
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
        if (!smsUp) throw new Error('connect ECONNREFUSED 127.0.0.1:5000');
        if (typeof path !== 'string' || path.startsWith('/api/')) {
          throw new Error(`stub: unexpected path '${path}'`);
        }
        if (path === '/fees/students') return SMS.studentFees;
        if (path === '/fees/assignments') return SMS.assignments;
        throw new Error(`stub: unexpected path '${path}'`);
      },
    },
  };

  const recon = require('./receiptReconciliationService');
  const { FmsIngestState, FmsVoucher } = require('../../models/core');
  const { FmsIncomeVoucher } = require('../../models/income');

  const school = new mongoose.Types.ObjectId();
  const fy = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();

  /** A fee payment as /fees/students returns it. */
  const smsLedger = (receipt, amount, name) => ({
    _id: new mongoose.Types.ObjectId(),
    student: { _id: new mongoose.Types.ObjectId(), name },
    paymentHistory: [{
      _id: new mongoose.Types.ObjectId(),
      receiptNumber: receipt, amount, paidOn: new Date('2026-06-10'), method: 'cash',
    }],
  });

  /** A posted receipt: voucher + income voucher + the ingest claim. */
  async function postReceipt(receipt, paise, name) {
    const [v] = await FmsVoucher.create([{
      school, financialYear: fy, voucherNumber: `IV/${receipt}`, voucherType: 'income',
      voucherDate: new Date('2026-06-10'), totalAmount: paise, voucherStatus: 'posted',
      source: 'fee', sourceKey: receipt, createdBy: user,
    }]);
    await FmsIncomeVoucher.create([{
      school, financialYear: fy, receiptNumber: receipt, receiptDate: new Date('2026-06-10'),
      category: 'studentFee', amount: paise, paymentMode: 'cash',
      debitAccount: new mongoose.Types.ObjectId(), creditAccount: new mongoose.Types.ObjectId(),
      payerType: 'student', payerName: name, className: 'V',
      voucher: v._id, postedBy: user, createdBy: user,
    }]);
    await FmsIngestState.create([{
      school, source: 'fee', sourceId: receipt, ingestStatus: 'posted',
      voucher: v._id, postedAt: new Date(),
    }]);
    return v;
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. Agreement — nothing to report');
  // ───────────────────────────────────────────────────────────────────────────
  await postReceipt('RCP-1001-AAAAA', 500000, 'Aarti Patil');
  await postReceipt('RCP-1002-BBBBB', 250000, 'Rahul Shinde');
  SMS.studentFees = [
    smsLedger('RCP-1001-AAAAA', 5000, 'Aarti Patil'),
    smsLedger('RCP-1002-BBBBB', 2500, 'Rahul Shinde'),
  ];
  SMS.assignments = [];

  let r = await recon.reconcileFees(school);
  ok('both receipts seen on both sides', r.smsReceipts === 2 && r.postedClaims === 2);
  ok('no orphans reported', r.orphanCount === 0);
  ok('not flagged suspect', r.suspect === false);
  ok('declares itself read-only', r.readOnly === true);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2. One receipt deleted in the SMS');
  // ───────────────────────────────────────────────────────────────────────────
  // Exactly what feeController.deletePayment does: the payment simply stops
  // being in the response. Nothing tells the FMS.
  SMS.studentFees = [smsLedger('RCP-1001-AAAAA', 5000, 'Aarti Patil')];

  r = await recon.reconcileFees(school);
  ok('one orphan found', r.orphanCount === 1, `got ${r.orphanCount}`);
  ok('it is the deleted receipt', r.exceptions[0]?.receiptNumber === 'RCP-1002-BBBBB');
  ok('counted as outstanding', r.outstandingCount === 1);
  ok('amount carried through', r.outstandingPaise === 250000, `got ${r.outstandingPaise}`);
  ok('evidence survives the deletion',
    r.exceptions[0]?.evidence?.payerName === 'Rahul Shinde'
    && r.exceptions[0]?.evidence?.evidenceMissing === false);
  ok('voucher identified for reversal', !!r.exceptions[0]?.posting?.voucherNumber);
  // NOT suspect, deliberately. The service requires more than one orphan before
  // it doubts the fetch, and a single deleted receipt is entirely plausible —
  // half of two is a ratio, not evidence. Without that guard every small school
  // would get a red warning the first time anybody deleted anything.
  ok('a single orphan is not treated as a suspect fetch', r.suspect === false);

  // ── Nothing was written ────────────────────────────────────────────────────
  const claimsAfter = await FmsIngestState.countDocuments({ school, source: 'fee' });
  const vouchersAfter = await FmsVoucher.countDocuments({ school, voucherStatus: 'posted' });
  ok('ingest state untouched', claimsAfter === 2, `got ${claimsAfter}`);
  ok('vouchers untouched', vouchersAfter === 2, `got ${vouchersAfter}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3. THE GUARD — an empty SMS response is not 100% deletion');
  // ───────────────────────────────────────────────────────────────────────────
  // A permissions change on the service user, a controller regression, or a
  // filter that silently matches nothing all look like this. Reporting every
  // posted receipt as deleted would be a catastrophic false positive.
  SMS.studentFees = [];
  SMS.assignments = [];
  await throws('refuses to report when the SMS returns nothing',
    () => recon.reconcileFees(school), /returned no fee payments/);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4. THE GUARD — an unreachable SMS reports nothing at all');
  // ───────────────────────────────────────────────────────────────────────────
  smsUp = false;
  await throws('aborts when the SMS cannot be reached',
    () => recon.reconcileFees(school), /could not be reached/);
  smsUp = true;

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5. An already-reversed voucher is history, not an open item');
  // ───────────────────────────────────────────────────────────────────────────
  await FmsVoucher.updateOne(
    { school, sourceKey: 'RCP-1002-BBBBB' },
    { $set: { voucherStatus: 'reversed' } }
  );
  SMS.studentFees = [smsLedger('RCP-1001-AAAAA', 5000, 'Aarti Patil')];

  r = await recon.reconcileFees(school);
  ok('still surfaced as an orphan', r.orphanCount === 1);
  ok('but not outstanding', r.outstandingCount === 0, `got ${r.outstandingCount}`);
  ok('counted as already reversed', r.alreadyReversedCount === 1);
  ok('nothing left to reverse', r.outstandingPaise === 0);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6. Receipts the SMS has that the books do not');
  // ───────────────────────────────────────────────────────────────────────────
  // Not a divergence — just unposted work. Reported so the two figures on the
  // screen account for each other.
  SMS.studentFees = [
    smsLedger('RCP-1001-AAAAA', 5000, 'Aarti Patil'),
    smsLedger('RCP-1002-BBBBB', 2500, 'Rahul Shinde'),
    smsLedger('RCP-1003-CCCCC', 1200, 'Sneha More'),
  ];
  r = await recon.reconcileFees(school);
  ok('pending ingest counted', r.pendingIngest === 1, `got ${r.pendingIngest}`);
  ok('pending is not an orphan', r.orphanCount === 0);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n7. A failed claim never asserted a posting, so it cannot orphan');
  // ───────────────────────────────────────────────────────────────────────────
  await FmsIngestState.create([{
    school, source: 'fee', sourceId: 'RCP-9999-FAILED', ingestStatus: 'failed',
    lastError: 'no mapping for fee type',
  }]);
  r = await recon.reconcileFees(school);
  ok('failed claims excluded from the comparison', r.orphanCount === 0, `got ${r.orphanCount}`);
  ok('and from the claim count', r.postedClaims === 2, `got ${r.postedClaims}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n8. A blank receipt number cannot be keyed on either side');
  // ───────────────────────────────────────────────────────────────────────────
  SMS.studentFees.push(smsLedger('', 800, 'No Receipt'));
  r = await recon.reconcileFees(school);
  ok('blank receipt surfaced as a source anomaly', r.sourceAnomalies >= 1);
  ok('and did not become a phantom orphan', r.orphanCount === 0);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n9. Several orphans at once DOES look like a bad fetch');
  // ───────────────────────────────────────────────────────────────────────────
  // The other half of the guard. One missing receipt is a deletion; a quarter of
  // the book going missing at once is far more likely to be the SMS answering
  // wrongly, and acting on that list would mean reversing live postings.
  await postReceipt('RCP-2001-DDDDD', 100000, 'Kiran Wagh');
  await postReceipt('RCP-2002-EEEEE', 100000, 'Meena Joshi');
  SMS.studentFees = [
    smsLedger('RCP-1001-AAAAA', 5000, 'Aarti Patil'),
    smsLedger('RCP-1002-BBBBB', 2500, 'Rahul Shinde'),
  ];

  r = await recon.reconcileFees(school);
  ok('two orphans found', r.orphanCount === 2, `got ${r.orphanCount}`);
  ok('flagged suspect', r.suspect === true);
  ok('and says why in plain terms', /more likely to be an incomplete fetch/.test(r.suspectReason || ''));
  // The list is still returned — the flag warns, it does not withhold.
  ok('the exceptions are still listed', r.exceptions.length === 2);

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
