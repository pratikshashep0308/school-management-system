// backend/fms/services/accounts/integration.check.js
//
// Chart of Accounts integration checks.
//
//   cd /root/school-management-system/backend
//   node fms/services/accounts/integration.check.js
//
// Runs against a SEPARATE database (<yourdb>_fmscheck) on the same replica set
// and drops it at the end. Never touches school_management.
//
// Covers the P2.1 verification explicitly: create a nested group and account,
// post to the account, then confirm deletion is blocked.

const mongoose = require('mongoose');
require('dotenv').config();

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log(`  ✔ ${name}`); }
  else { fail += 1; failures.push(name); console.log(`  ✖ ${name}${detail ? '  — ' + detail : ''}`); }
}

/**
 * `errors.validation()` puts generic text in `message` and the specific reason
 * in `details.fields`. Searching only code+message would miss it — which it did
 * on the first run, reporting three false failures against working guards.
 */
async function throws(name, fn, match) {
  try {
    await fn();
    ok(name, false, 'expected a throw, got none');
  } catch (e) {
    const text = [
      e.code || '',
      e.message || '',
      e.details ? JSON.stringify(e.details) : '',
    ].join(' ');
    ok(name, !match || match.test(text), text);
  }
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set — run from backend/');

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
  const svc = require('./accountService');
  const posting = require('../ledger/LedgerPostingService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const req = { user: { _id: new Types.ObjectId(), email: 'check@test' }, fmsRole: 'accountsManager' };

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  // ── 1. Nested groups ──────────────────────────────────────────────────────
  console.log('1. Account groups');
  const root = await svc.createGroup(school, {
    groupCode: '4000', groupName: 'Income', accountType: 'income',
  }, req);
  ok('root group created at level 1', root.level === 1);
  ok('normalBalance defaulted by type', root.normalBalance === 'credit');

  const child = await svc.createGroup(school, {
    groupCode: '4100', groupName: 'Fee Income', accountType: 'income', parent: root._id,
  }, req);
  ok('child group at level 2', child.level === 2);

  const grandchild = await svc.createGroup(school, {
    groupCode: '4110', groupName: 'Tuition', accountType: 'income', parent: child._id,
  }, req);
  ok('grandchild at level 3', grandchild.level === 3);

  await throws('duplicate group code rejected',
    () => svc.createGroup(school, { groupCode: '4100', groupName: 'Dup', accountType: 'income' }, req),
    /already exists/);

  await throws('child type must match parent',
    () => svc.createGroup(school, {
      groupCode: '4200', groupName: 'Wrong', accountType: 'expense', parent: root._id,
    }, req),
    /must match the parent/);

  await throws('cycle rejected',
    () => svc.updateGroup(school, root._id, { parent: grandchild._id }, req),
    /cycle/);

  const tree = await svc.groupTree(school);
  ok('tree has one root', tree.length === 1);
  ok('tree nests three deep',
    tree[0].children?.[0]?.children?.[0]?.groupCode === '4110');

  // ── 2. Accounts ───────────────────────────────────────────────────────────
  console.log('\n2. Accounts');
  const tuition = await svc.createAccount(school, {
    accountCode: '4101', accountName: 'Tuition Fee Income', accountGroup: grandchild._id,
  }, req);
  ok('account created', !!tuition);
  ok('type inherited from group', tuition.accountType === 'income');
  ok('normalBalance inherited', tuition.normalBalance === 'credit');
  ok('postable by default', tuition.isPostable === true);

  // Type/normalBalance must be ignored if a client sends them.
  const sneaky = await svc.createAccount(school, {
    accountCode: '4102', accountName: 'Exam Fee', accountGroup: grandchild._id,
    accountType: 'expense', normalBalance: 'debit',
  }, req);
  ok('client-supplied accountType ignored', sneaky.accountType === 'income');
  ok('client-supplied normalBalance ignored', sneaky.normalBalance === 'credit');

  await throws('duplicate account code rejected',
    () => svc.createAccount(school, {
      accountCode: '4101', accountName: 'Dup', accountGroup: grandchild._id,
    }, req),
    /already exists/);

  await throws('unknown group rejected',
    () => svc.createAccount(school, {
      accountCode: '9999', accountName: 'Orphan', accountGroup: new Types.ObjectId(),
    }, req),
    /group not found/);

  // ── 3. Delete an unused account ───────────────────────────────────────────
  console.log('\n3. Delete guard');
  const throwaway = await svc.createAccount(school, {
    accountCode: '4199', accountName: 'Throwaway', accountGroup: grandchild._id,
  }, req);
  const del = await svc.removeAccount(school, throwaway._id, req);
  ok('unused account can be deleted', del.deleted === true);
  ok('and is really gone',
    (await M.FmsAccount.countDocuments({ _id: throwaway._id })) === 0);

  // ── 4. THE P2.1 VERIFICATION ──────────────────────────────────────────────
  console.log('\n4. Delete after posting — the P2.1 verification');

  const assetGroup = await svc.createGroup(school, {
    groupCode: '1000', groupName: 'Assets', accountType: 'asset',
  }, req);
  const cash = await svc.createAccount(school, {
    accountCode: '1101', accountName: 'Cash in Hand', accountGroup: assetGroup._id,
    isCashAccount: true,
  }, req);

  const amt = money.toPaise(5000);
  await posting.post({
    school, financialYear: fy._id, voucherType: 'income',
    voucherDate: new Date('2026-07-28'), narration: 'Fee receipt',
    postedBy: req.user._id,
    lines: [
      { account: cash._id, debit: amt, credit: 0 },
      { account: tuition._id, debit: 0, credit: amt },
    ],
  });

  ok('posting count is 1', (await svc.postingCount(tuition._id)) === 1);

  await throws('DELETE blocked after posting',
    () => svc.removeAccount(school, tuition._id, req),
    /cannot be deleted/);

  await throws('and for the cash side too',
    () => svc.removeAccount(school, cash._id, req),
    /cannot be deleted/);

  ok('account still exists after the blocked delete',
    (await M.FmsAccount.countDocuments({ _id: tuition._id })) === 1);

  // ── 5. Deactivate is the sanctioned alternative ───────────────────────────
  console.log('\n5. Deactivate instead');
  const deactivated = await svc.updateAccount(school, tuition._id, { status: 'inactive' }, req);
  ok('account deactivated', deactivated.status === 'inactive');

  await throws('posting to an inactive account rejected',
    () => posting.post({
      school, financialYear: fy._id, voucherType: 'income',
      voucherDate: new Date('2026-07-28'), postedBy: req.user._id,
      lines: [
        { account: cash._id, debit: 100, credit: 0 },
        { account: tuition._id, debit: 0, credit: 100 },
      ],
    }),
    /ACCOUNT_INACTIVE|inactive/);

  ok('history survives deactivation',
    (await M.FmsLedgerEntry.countDocuments({ account: tuition._id })) === 1);

  await svc.updateAccount(school, tuition._id, { status: 'active' }, req);

  // ── 6. Frozen fields ──────────────────────────────────────────────────────
  console.log('\n6. Immutability after posting');
  await throws('accountCode frozen',
    () => svc.updateAccount(school, tuition._id, { accountCode: '9101' }, req),
    /Cannot change/);
  await throws('accountGroup frozen',
    () => svc.updateAccount(school, tuition._id, { accountGroup: assetGroup._id }, req),
    /Cannot change/);
  await throws('openingBalance frozen',
    () => svc.updateAccount(school, tuition._id, { openingBalance: 500 }, req),
    /Cannot change/);

  const renamed = await svc.updateAccount(school, tuition._id, {
    accountName: 'Tuition Fee Income (renamed)',
  }, req);
  ok('accountName still editable', renamed.accountName.includes('renamed'));

  ok('ledger snapshot keeps the ORIGINAL name',
    (await M.FmsLedgerEntry.findOne({ account: tuition._id }).lean()).accountName
      === 'Tuition Fee Income');

  // ── 7. Non-postable heads ─────────────────────────────────────────────────
  console.log('\n7. Non-postable heads');
  const head = await svc.createAccount(school, {
    accountCode: '4900', accountName: 'Income (grouping head)',
    accountGroup: grandchild._id, isPostable: false,
  }, req);

  await throws('posting to a non-postable head rejected',
    () => posting.post({
      school, financialYear: fy._id, voucherType: 'income',
      voucherDate: new Date('2026-07-28'), postedBy: req.user._id,
      lines: [
        { account: cash._id, debit: 100, credit: 0 },
        { account: head._id, debit: 0, credit: 100 },
      ],
    }),
    /NOT_POSTABLE|not postable/);

  // ── 8. Group delete guards ────────────────────────────────────────────────
  console.log('\n8. Group delete guards');
  await throws('group with accounts cannot be deleted',
    () => svc.deleteGroup(school, grandchild._id, req), /not empty/);
  await throws('group with child groups cannot be deleted',
    () => svc.deleteGroup(school, root._id, req), /not empty/);

  const empty = await svc.createGroup(school, {
    groupCode: '7000', groupName: 'Empty', accountType: 'expense',
  }, req);
  ok('empty group can be deleted',
    (await svc.deleteGroup(school, empty._id, req)).deleted === true);

  // ── 9. Balance ────────────────────────────────────────────────────────────
  console.log('\n9. Balance');
  const bal = await svc.balance(school, cash._id);
  ok('debit total correct', bal.totalDebit === amt, String(bal.totalDebit));
  ok('cache matches ledger (drift 0)', bal.drift === 0, JSON.stringify(bal));
  ok('opening balance excluded from currentBalance',
    bal.openingBalancePosted === false && bal.currentBalance === amt);

  // ── 10. Audit trail ───────────────────────────────────────────────────────
  console.log('\n10. Audit trail');
  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_accounts' });
  ok('account changes are audited', audits > 0, `${audits} entries`);

  const upd = await M.FmsAuditTrail
    .findOne({ school, entity: 'fms_accounts', action: 'update' }).lean();
  ok('update audit captures before and after', !!upd?.before && !!upd?.after);

  // ── Teardown ──────────────────────────────────────────────────────────────
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