// backend/fms/services/reporting/chartCoverage.check.js
//
// A3 / chart coverage checks.
//
//   node fms/services/reporting/chartCoverage.check.js
//
// Separate database (<yourdb>_fmscheck<pid>), dropped at the end.
//
// What this proves is narrow and specific: that an account nothing can post to
// is reported as such, rather than blending into the majority of accounts that
// legitimately only ever receive journal vouchers. Getting that distinction
// wrong in either direction makes the report useless — cry wolf on every
// balance sheet account, or stay quiet about a stranded income head.

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

  const clientPath = require.resolve('../../client/smsClient');
  let FEE_TYPES = [];
  let smsUp = true;
  require.cache[clientPath] = {
    id: clientPath, filename: clientPath, loaded: true,
    exports: {
      async get(path) {
        if (!smsUp) throw new Error('connect ECONNREFUSED 127.0.0.1:5000');
        if (path === '/fees/types') return FEE_TYPES;
        throw new Error(`stub: unexpected path '${path}'`);
      },
    },
  };

  const svc = require('./chartCoverageReport');
  const {
    FmsAccount, FmsAccountGroup, FmsLedgerEntry, FmsFinancialYear,
  } = require('../../models/core');

  const school = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();

  const [incomeGrp] = await FmsAccountGroup.create([{
    school, groupCode: '4100', groupName: 'Fee Income', accountType: 'income',
    normalBalance: 'credit', createdBy: user,
  }]);
  const [assetGrp] = await FmsAccountGroup.create([{
    school, groupCode: '1100', groupName: 'Current Assets', accountType: 'asset',
    normalBalance: 'debit', createdBy: user,
  }]);

  const mk = (code, name, group, type, bal) => ({
    school, accountCode: code, accountName: name, accountGroup: group,
    accountType: type, normalBalance: bal, createdBy: user,
  });

  await FmsAccount.create([
    mk('1101', 'Cash in Hand', assetGrp._id, 'asset', 'debit'),
    mk('4101', 'Tuition Fee Income', incomeGrp._id, 'income', 'credit'),
    mk('4105', 'Library Fee Income', incomeGrp._id, 'income', 'credit'),
    mk('4108', 'Late Fee Income', incomeGrp._id, 'income', 'credit'),
    mk('1501', 'Furniture & Fixtures', assetGrp._id, 'asset', 'debit'),
  ]);

  // Only tuition exists as a fee type. Library does not — so 4105 has no route
  // in even from the fee module.
  FEE_TYPES = [{ name: 'Tuition Fee', category: 'tuition', isActive: true }];

  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. Accounts with a live feed are recognised');
  // ───────────────────────────────────────────────────────────────────────────
  let r = await svc.build(school);
  const byCode = (c) => r.accounts.find((a) => a.accountCode === c);

  ok('read the fee types', r.feeTypesReadable === true && r.feeTypeCount === 1);
  ok('cash is fed', byCode('1101').automaticFeeds.length > 0);
  ok('tuition is fed — a fee type of that category exists',
    byCode('4101').automaticFeeds.length > 0);
  ok('tuition awaits its first posting', byCode('4101').verdict === 'awaiting');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2. THE POINT — stranded income heads are called out');
  // ───────────────────────────────────────────────────────────────────────────
  ok('4108 late fee is blocked', byCode('4108').verdict === 'blocked');
  ok('and says why', /isLateFee/.test(byCode('4108').reason || ''));
  ok('and says what to do', !!byCode('4108').remedy);
  ok('4105 library is blocked', byCode('4105').verdict === 'blocked');
  ok('both appear in the blocked list', r.blocked.length === 2, `got ${r.blocked.length}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3. Journal-voucher accounts are NOT flagged as a defect');
  // ───────────────────────────────────────────────────────────────────────────
  // Most balance sheet accounts are only ever touched by hand. Reporting those
  // as problems would bury the two that matter.
  ok('furniture is unreachable, not blocked', byCode('1501').verdict === 'unreachable');
  ok('unreachable is a separate list from blocked',
    r.unreachable.some((a) => a.accountCode === '1501')
    && !r.blocked.some((a) => a.accountCode === '1501'));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4. A posted account reads as active');
  // ───────────────────────────────────────────────────────────────────────────
  const [fy] = await FmsFinancialYear.create([{
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', createdBy: user,
  }]);
  const tuition = await FmsAccount.findOne({ school, accountCode: '4101' }).lean();
  await FmsLedgerEntry.create([{
    school, financialYear: fy._id, voucher: new mongoose.Types.ObjectId(),
    voucherNumber: 'IV/1', voucherType: 'income',
    account: tuition._id, accountCode: '4101', debit: 0, credit: 50000,
    entryDate: new Date('2026-05-01'), postedBy: user, createdBy: user,
  }]);

  r = await svc.build(school);
  ok('tuition now active', r.accounts.find((a) => a.accountCode === '4101').verdict === 'active');
  ok('entry counted', r.accounts.find((a) => a.accountCode === '4101').entries === 1);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5. A library fee type would unblock 4105 with no code change');
  // ───────────────────────────────────────────────────────────────────────────
  // The remedy the report suggests has to actually work, or it is advice that
  // wastes somebody's afternoon.
  FEE_TYPES = [
    { name: 'Tuition Fee', category: 'tuition', isActive: true },
    { name: 'Library Fee', category: 'library', isActive: true },
  ];
  r = await svc.build(school);
  ok('4105 is no longer blocked',
    r.accounts.find((a) => a.accountCode === '4105').verdict !== 'blocked');
  ok('4108 is still blocked — a fee type cannot fix it',
    r.accounts.find((a) => a.accountCode === '4108').verdict === 'blocked');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6. An inactive fee type does not count as coverage');
  // ───────────────────────────────────────────────────────────────────────────
  FEE_TYPES = [{ name: 'Library Fee', category: 'library', isActive: false }];
  r = await svc.build(school);
  ok('deactivated fee type gives no coverage',
    r.accounts.find((a) => a.accountCode === '4105').verdict === 'blocked');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n7. An unreachable SMS degrades to "unknown", not "all broken"');
  // ───────────────────────────────────────────────────────────────────────────
  // Reporting every fee income account as stranded because the SMS was briefly
  // down would be the same false-positive trap as the deleted-receipt check.
  smsUp = false;
  r = await svc.build(school);
  ok('report still returns', !!r);
  ok('says the fee types could not be read', r.feeTypesReadable === false);
  ok('and carries the reason', !!r.feeTypeReadError);
  smsUp = true;

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n8. The library finding is stated, and nothing is changed');
  // ───────────────────────────────────────────────────────────────────────────
  r = await svc.build(school);
  ok('library finding present', !!r.libraryFines?.finding);
  ok('flags the mislabelled stats key', /lateFeeCollected/.test(r.libraryFines.separateIssue));
  ok('declares itself read-only', r.readOnly === true);

  const stillActive = await FmsAccount.countDocuments({ school, status: 'active' });
  ok('no account was deactivated', stillActive === 5, `got ${stillActive}`);

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
