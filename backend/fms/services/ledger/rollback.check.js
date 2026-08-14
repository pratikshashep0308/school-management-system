// backend/fms/services/ledger/rollback.check.js
//
// Rollback safety.
//
//   node fms/services/ledger/rollback.check.js
//
// Separate database (<yourdb>_fmscheck<pid>), dropped at the end.
//
// ─── WHY THIS IS WORTH ITS OWN FILE ──────────────────────────────────────────
// Every posting runs inside session.withTransaction, so in principle a failure
// part-way leaves nothing behind. In principle. Nothing asserted it.
//
// That matters more here than in most systems, because of what a partial write
// would look like: a voucher with one of its two ledger entries, which is a
// trial balance that does not balance and no obvious culprit. Or an ingest-state
// row claiming a receipt was posted when the voucher never survived — which
// permanently blocks that receipt from ever being posted, since the idempotency
// key is taken and the next cycle reads it as "already done".
//
// The second one is the quiet disaster: money that can never be brought into
// the books, with a database row asserting it already has been.
//
// The failures below are induced by making a write throw mid-transaction. That
// is artificial, but a disconnect, a stepdown or a write concern timeout at the
// same moment produces the same shape, and those are not artificial at all.

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
  if (!info.setName) throw new Error('Not a replica set — transactions are the thing under test');
  console.log(`\nDatabase: ${dbName}   replica set: ${info.setName}\n`);

  const posting = require('./LedgerPostingService');
  const {
    FmsAccount, FmsAccountGroup, FmsFinancialYear,
    FmsVoucher, FmsLedgerEntry, FmsIngestState,
  } = require('../../models/core');

  const school = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();

  const [assets] = await FmsAccountGroup.create([{
    school, groupCode: '1100', groupName: 'Current Assets', accountType: 'asset',
    normalBalance: 'debit', createdBy: user,
  }]);
  const [income] = await FmsAccountGroup.create([{
    school, groupCode: '4100', groupName: 'Fee Income', accountType: 'income',
    normalBalance: 'credit', createdBy: user,
  }]);
  const [cash] = await FmsAccount.create([{
    school, accountCode: '1101', accountName: 'Cash in Hand', accountGroup: assets._id,
    accountType: 'asset', normalBalance: 'debit', isCashAccount: true, createdBy: user,
  }]);
  const [fees] = await FmsAccount.create([{
    school, accountCode: '4101', accountName: 'Tuition Fee Income', accountGroup: income._id,
    accountType: 'income', normalBalance: 'credit', createdBy: user,
  }]);
  const [fy] = await FmsFinancialYear.create([{
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', createdBy: user,
  }]);

  const payload = (sourceId, paise = 50000) => ({
    school, financialYear: fy._id, voucherType: 'income',
    voucherDate: new Date('2026-06-01'),
    narration: `Fee received — ${sourceId}`,
    referenceNumber: sourceId,
    source: 'fee', sourceId, postedBy: user,
    lines: [
      { account: cash._id, debit: paise, credit: 0, narration: 'cash' },
      { account: fees._id, debit: 0, credit: paise, narration: 'tuition' },
    ],
  });

  const counts = async () => ({
    vouchers: await FmsVoucher.countDocuments({ school }),
    entries: await FmsLedgerEntry.countDocuments({ school }),
    claims: await FmsIngestState.countDocuments({ school }),
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. Baseline — a good posting writes all three');
  // ───────────────────────────────────────────────────────────────────────────
  await posting.post(payload('RCP-GOOD-1'));
  let c = await counts();
  ok('voucher written', c.vouchers === 1, JSON.stringify(c));
  ok('both ledger entries written', c.entries === 2, JSON.stringify(c));
  ok('ingest claim written', c.claims === 1, JSON.stringify(c));

  const before = await counts();

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2. THE TEST — a write failing mid-transaction leaves nothing');
  // ───────────────────────────────────────────────────────────────────────────
  // The voucher and the ingest claim are already written by the time the ledger
  // entries go in. If the transaction did not hold, both would survive.
  const realCreate = FmsLedgerEntry.create.bind(FmsLedgerEntry);
  FmsLedgerEntry.create = async () => {
    throw new Error('induced failure: write concern timeout');
  };

  let raised = null;
  try {
    await posting.post(payload('RCP-DOOMED-1'));
  } catch (e) { raised = e; }

  FmsLedgerEntry.create = realCreate;

  ok('the failure reached the caller', !!raised, 'a silent failure would be worse');

  c = await counts();
  ok('NO orphan voucher survived', c.vouchers === before.vouchers,
    `${before.vouchers} → ${c.vouchers}`);
  ok('NO orphan ledger entry survived', c.entries === before.entries,
    `${before.entries} → ${c.entries}`);
  // The one that would be permanent: a claim with no voucher behind it blocks
  // that receipt forever, because the next cycle reads the key as already used.
  ok('NO orphan ingest claim survived', c.claims === before.claims,
    `${before.claims} → ${c.claims}`);

  const doomed = await FmsIngestState.findOne({ school, sourceId: 'RCP-DOOMED-1' }).lean();
  ok('the failed receipt holds no idempotency key', doomed === null);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3. And the receipt can still be posted afterwards');
  // ───────────────────────────────────────────────────────────────────────────
  // If the rollback had left a claim behind, this would be rejected as a
  // duplicate and the money would never reach the books.
  await posting.post(payload('RCP-DOOMED-1'));
  c = await counts();
  ok('the retry succeeded', c.vouchers === before.vouchers + 1, JSON.stringify(c));
  ok('and produced a balanced pair', c.entries === before.entries + 2, JSON.stringify(c));

  const recovered = await FmsIngestState.findOne({ school, sourceId: 'RCP-DOOMED-1' }).lean();
  ok('now claimed', recovered?.ingestStatus === 'posted', recovered?.ingestStatus);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4. Every voucher in the database balances');
  // ───────────────────────────────────────────────────────────────────────────
  // The invariant a partial write would break, checked directly rather than
  // inferred from the counts above.
  const grouped = await FmsLedgerEntry.aggregate([
    { $match: { school } },
    { $group: { _id: '$voucher', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);
  const unbalanced = grouped.filter((g) => g.debit !== g.credit);
  ok('no unbalanced voucher exists', unbalanced.length === 0,
    JSON.stringify(unbalanced));

  const orphanEntries = await FmsLedgerEntry.aggregate([
    { $match: { school } },
    { $lookup: { from: 'fms_vouchers', localField: 'voucher', foreignField: '_id', as: 'v' } },
    { $match: { v: { $size: 0 } } },
  ]);
  ok('no ledger entry points at a missing voucher', orphanEntries.length === 0);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5. A duplicate is refused without disturbing the original');
  // ───────────────────────────────────────────────────────────────────────────
  const beforeDup = await counts();
  let dupErr = null;
  try {
    await posting.post(payload('RCP-GOOD-1'));
  } catch (e) { dupErr = e; }

  const after = await counts();
  ok('the replay did not post again',
    after.vouchers === beforeDup.vouchers && after.entries === beforeDup.entries,
    JSON.stringify(after));
  ok('either refused or reported as already present',
    dupErr !== null || after.vouchers === beforeDup.vouchers);

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
