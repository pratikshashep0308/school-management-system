// backend/fms/services/ledger/integration.check.js
//
// Transactional integration checks for LedgerPostingService.
//
// These need a real replica set, so they cannot run in a plain unit-test
// environment. Run on staging:
//
//   cd /root/school-management-system/backend
//   node fms/services/ledger/integration.check.js
//
// ─── SAFETY ──────────────────────────────────────────────────────────────────
// Runs against a SEPARATE DATABASE (<yourdb>_fmscheck) on the same replica set,
// creates its own fixtures, and DROPS that database at the end. It never reads
// or writes school_management.
//
// A separate database rather than cleanup-in-place is deliberate:
// fms_ledgerentries is append-only and rejects deleteMany, so tearing down
// test postings inside the real database would mean either bypassing the model
// layer or leaving junk in the ledger. Neither is acceptable.

const mongoose = require('mongoose');
require('dotenv').config();

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  ✔ ${name}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  ✖ ${name}${detail ? '  — ' + detail : ''}`);
  }
}

async function throws(name, fn, expectedCode) {
  try {
    await fn();
    ok(name, false, 'expected a throw, got none');
  } catch (e) {
    ok(name, !expectedCode || e.code === expectedCode, `code=${e.code} msg=${e.message}`);
  }
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set — run from backend/');

  // Redirect to a throwaway database on the same replica set.
  const testUri = uri.replace(/\/([^/?]+)(\?|$)/, '/$1_fmscheck$2');
  const dbName = testUri.match(/\/([^/?]+)(\?|$)/)[1];

  if (!dbName.endsWith('_fmscheck')) {
    throw new Error(`Refusing to run: resolved database '${dbName}' is not a _fmscheck database`);
  }

  await mongoose.connect(testUri);

  const info = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!info.setName) throw new Error('Not a replica set — transactions unavailable');

  console.log(`\nDatabase: ${dbName}   replica set: ${info.setName}\n`);

  const M = require('../../models/core');
  const svc = require('./LedgerPostingService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  // ── Fixtures ──────────────────────────────────────────────────────────────
  const school = new Types.ObjectId();
  const user = new Types.ObjectId();

  const fy = await M.FmsFinancialYear.create({
    school,
    yearCode: '2026-27',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'),
    fyStatus: 'open',
    isCurrent: true,
  });

  const group = await M.FmsAccountGroup.create({
    school, groupCode: 'T', groupName: 'Test', accountType: 'asset', normalBalance: 'debit',
  });

  const cash = await M.FmsAccount.create({
    school, accountCode: '1101', accountName: 'Cash in Hand', accountGroup: group._id,
    accountType: 'asset', normalBalance: 'debit', isCashAccount: true,
  });
  const income = await M.FmsAccount.create({
    school, accountCode: '4101', accountName: 'Tuition Fee Income', accountGroup: group._id,
    accountType: 'income', normalBalance: 'credit',
  });
  const groupHead = await M.FmsAccount.create({
    school, accountCode: '4100', accountName: 'Fee Income (group)', accountGroup: group._id,
    accountType: 'income', normalBalance: 'credit', isPostable: false,
  });

  const amt = money.toPaise(2500);
  const base = {
    school, financialYear: fy._id, voucherType: 'income',
    voucherDate: new Date('2026-07-27'), postedBy: user,
  };
  const legs = (a) => [
    { account: cash._id, debit: a, credit: 0 },
    { account: income._id, debit: 0, credit: a },
  ];

  // ── 1. Basic posting ──────────────────────────────────────────────────────
  console.log('1. Posting');
  const r1 = await svc.post({ ...base, narration: 'Fee receipt', lines: legs(amt) });
  ok('voucher created', !!r1.voucher);
  ok('voucher number allocated', /^INC-2026-27-\d{5}$/.test(r1.voucher.voucherNumber),
    r1.voucher.voucherNumber);
  ok('two ledger entries written', r1.entries.length === 2);
  ok('voucher total = 250000 paise', r1.voucher.totalAmount === 250000);
  ok('account snapshot denormalised', r1.entries[0].accountCode === '1101');

  const cash1 = await M.FmsAccount.findById(cash._id);
  const inc1 = await M.FmsAccount.findById(income._id);
  ok('cash balance +250000', cash1.currentBalance === 250000, String(cash1.currentBalance));
  ok('income balance -250000', inc1.currentBalance === -250000, String(inc1.currentBalance));

  const tb1 = await svc.trialBalance(school);
  ok('trial balance is zero', tb1.balanced && tb1.difference === 0, JSON.stringify(tb1));

  // ── 2. Rejections write nothing ───────────────────────────────────────────
  console.log('\n2. Rejections');
  const before = await M.FmsVoucher.countDocuments({ school });

  await throws('unbalanced rejected',
    () => svc.post({ ...base, lines: [
      { account: cash._id, debit: amt, credit: 0 },
      { account: income._id, debit: 0, credit: amt - 1 },
    ] }), 'UNBALANCED');

  await throws('non-postable account rejected',
    () => svc.post({ ...base, lines: [
      { account: cash._id, debit: amt, credit: 0 },
      { account: groupHead._id, debit: 0, credit: amt },
    ] }), 'ACCOUNT_NOT_POSTABLE');

  await throws('unknown account rejected',
    () => svc.post({ ...base, lines: [
      { account: cash._id, debit: amt, credit: 0 },
      { account: new Types.ObjectId(), debit: 0, credit: amt },
    ] }), 'ACCOUNT_NOT_FOUND');

  await throws('date outside FY rejected',
    () => svc.post({ ...base, voucherDate: new Date('2025-01-01'), lines: legs(amt) }),
    'DATE_OUTSIDE_FY');

  const after = await M.FmsVoucher.countDocuments({ school });
  ok('no voucher written by any rejection', before === after, `${before} → ${after}`);

  // ── 3. Idempotency ────────────────────────────────────────────────────────
  console.log('\n3. Idempotency');
  const receipt = 'RCPT-TEST-0001';
  const ingest = { ...base, source: 'fee', sourceId: receipt, sourceAmount: 2500, lines: legs(amt) };

  const i1 = await svc.post(ingest);
  ok('first ingest posts', !i1.alreadyPosted);

  const i2 = await svc.post(ingest);
  ok('second ingest is a no-op', i2.alreadyPosted === true);
  ok('same voucher returned', String(i2.voucher._id) === String(i1.voucher._id));

  const feeVouchers = await M.FmsVoucher.countDocuments({ school, source: 'fee', sourceKey: receipt });
  ok('exactly one voucher for this receipt', feeVouchers === 1, String(feeVouchers));

  // Concurrency — the real test of the unique-index guard.
  const receipt2 = 'RCPT-TEST-0002';
  const conc = { ...base, source: 'fee', sourceId: receipt2, lines: legs(amt) };
  const settled = await Promise.allSettled([
    svc.post(conc), svc.post(conc), svc.post(conc), svc.post(conc), svc.post(conc),
  ]);
  const posted = settled.filter((s) => s.status === 'fulfilled' && !s.value.alreadyPosted).length;
  const v2 = await M.FmsVoucher.countDocuments({ school, source: 'fee', sourceKey: receipt2 });
  ok('5 concurrent posts produce exactly 1 voucher', v2 === 1,
    `vouchers=${v2} fulfilled-as-new=${posted}`);

  // ── 4. Append-only ────────────────────────────────────────────────────────
  console.log('\n4. Append-only');
  await throws('updateOne on ledger blocked',
    () => M.FmsLedgerEntry.updateOne({ _id: r1.entries[0]._id }, { $set: { debit: 1 } }));
  await throws('deleteOne on ledger blocked',
    () => M.FmsLedgerEntry.deleteOne({ _id: r1.entries[0]._id }));
  await throws('deleteMany on ledger blocked',
    () => M.FmsLedgerEntry.deleteMany({ school }));

  // ── 5. Reversal ───────────────────────────────────────────────────────────
  console.log('\n5. Reversal');
  const cashBefore = (await M.FmsAccount.findById(cash._id)).currentBalance;
  const rev = await svc.reverse(r1.voucher._id, user, 'test reversal');
  ok('reversal voucher created', !!rev.reversal);
  ok('reversal narration references original',
    rev.reversal.narration.includes(r1.voucher.voucherNumber));
  ok('reversal lines flipped',
    rev.entries[0].credit === r1.entries[0].debit &&
    rev.entries[0].debit === r1.entries[0].credit);
  ok('reversal lines flagged', rev.entries.every((e) => e.isReversal === true));

  const orig = await M.FmsVoucher.findById(r1.voucher._id);
  ok('original marked reversed', orig.voucherStatus === 'reversed');
  ok('original ledger lines untouched',
    (await M.FmsLedgerEntry.countDocuments({ voucher: r1.voucher._id })) === 2);

  const cashAfter = (await M.FmsAccount.findById(cash._id)).currentBalance;
  ok('balance restored', cashAfter === cashBefore - 250000,
    `${cashBefore} → ${cashAfter}`);

  await throws('double reversal blocked',
    () => svc.reverse(r1.voucher._id, user), 'ALREADY_REVERSED');

  const tb2 = await svc.trialBalance(school);
  ok('trial balance still zero after reversal', tb2.balanced, JSON.stringify(tb2));

  // ── 6. Financial-year lock ────────────────────────────────────────────────
  console.log('\n6. Period lock');
  await M.FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'locked' } });
  await throws('posting into a locked FY rejected',
    () => svc.post({ ...base, lines: legs(amt) }), 'FY_LOCKED');
  await M.FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'open' } });

  // ── 7. Numbering ──────────────────────────────────────────────────────────
  console.log('\n7. Voucher numbering');
  const a = await svc.post({ ...base, lines: legs(100) });
  const b = await svc.post({ ...base, lines: legs(100) });
  const na = Number(a.voucher.voucherNumber.split('-').pop());
  const nb = Number(b.voucher.voucherNumber.split('-').pop());
  ok('numbers increment', nb === na + 1, `${na} → ${nb}`);

  const all = await M.FmsVoucher.find({ school }).select('voucherNumber').lean();
  ok('all voucher numbers unique',
    new Set(all.map((v) => v.voucherNumber)).size === all.length);

  // ── 8. Balance cache integrity ────────────────────────────────────────────
  console.log('\n8. Balance cache');
  for (const id of [cash._id, income._id]) {
    const v = await svc.verifyAccountBalance(id);
    ok(`${v.accountCode} cache matches ledger`, v.drift === 0, JSON.stringify(v));
  }

  // ── Teardown ──────────────────────────────────────────────────────────────
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('Failures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
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