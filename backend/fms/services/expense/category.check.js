// backend/fms/services/expense/category.check.js
//
// Expense category master checks.
//
//   node fms/services/expense/category.check.js
//
// Separate database (<yourdb>_fmscheck<pid>), dropped at the end.
//
// What is worth proving here is not that the CRUD works — it is that each
// refusal actually refuses. This collection decides which account an expense
// lands in, and every one of these guards exists because the alternative is a
// posting nobody can explain later.

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
    ok(name, !match || match.test(text), text.slice(0, 180));
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

  const svc = require('./categoryService');
  const { FmsExpenseCategory } = require('../../models/expense/category');
  const { FmsAccount, FmsAccountGroup, FmsAuditTrail } = require('../../models/core');

  const school = new mongoose.Types.ObjectId();
  const otherSchool = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();
  const req = { user: { _id: user, email: 'accounts@test.in' }, fmsRole: 'accountsManager' };

  // The unique index on (school, code) is the whole point of §7 below. Mongoose
  // builds indexes in the background, so a fresh database races the build —
  // init() resolves once it is in place.
  await FmsExpenseCategory.init();

  // ── Chart ─────────────────────────────────────────────────────────────────
  const [grp] = await FmsAccountGroup.create([{
    school, groupCode: '5100', groupName: 'Operating Expenses', accountType: 'expense',
    normalBalance: 'debit', createdBy: user,
  }]);
  const mk = (code, name, extra = {}) => FmsAccount.create({
    school, accountCode: code, accountName: name, accountGroup: grp._id,
    accountType: 'expense', normalBalance: 'debit', createdBy: user, ...extra,
  });
  const stationery = await mk('5104', 'Stationery & Printing');
  const electricity = await mk('5106', 'Electricity');
  const header = await mk('5199', 'Expense Header', { isPostable: false });
  const closed = await mk('5198', 'Retired Head', { status: 'inactive' });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. A category carries its account');
  // ───────────────────────────────────────────────────────────────────────────
  const stat = await svc.create(school, {
    code: 'stat', name: 'Stationery', account: stationery._id, requiresInvoice: true,
  }, req);

  ok('created', !!stat._id);
  ok('code upper-cased', stat.code === 'STAT', stat.code);
  ok('account stored', String(stat.account) === String(stationery._id));
  ok('account code denormalised for display', stat.accountCode === '5104', stat.accountCode);
  ok('audited', (await FmsAuditTrail.countDocuments({
    school, entity: 'fms_expensecategories', action: 'create',
  })) === 1);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2. THE ACCOUNT GUARD — a reference alone proves nothing');
  // ───────────────────────────────────────────────────────────────────────────
  // An account can exist, be a group header, or be deactivated. All three fail
  // at POSTING time — long after whoever chose it has moved on.
  await throws('a group header is refused',
    () => svc.create(school, { code: 'HDR', name: 'Bad', account: header._id }, req),
    /group header|cannot receive/i);

  await throws('a deactivated account is refused',
    () => svc.create(school, { code: 'OLD', name: 'Bad', account: closed._id }, req),
    /deactivated/i);

  await throws('an account from another school is not found',
    () => svc.create(school, {
      code: 'FOREIGN', name: 'Bad', account: new mongoose.Types.ObjectId(),
    }, req),
    /not found|Account/i);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3. Nesting stops at two levels');
  // ───────────────────────────────────────────────────────────────────────────
  const utilities = await svc.create(school, {
    code: 'UTIL', name: 'Utilities', account: electricity._id,
  }, req);
  const power = await svc.create(school, {
    code: 'ELEC', name: 'Electricity', account: electricity._id, parent: utilities._id,
  }, req);
  ok('a child is allowed', String(power.parent) === String(utilities._id));

  await throws('a THIRD level is refused',
    () => svc.create(school, {
      code: 'ELEC2', name: 'Meter 2', account: electricity._id, parent: power._id,
    }, req),
    /two levels/i);

  await throws('a category cannot be its own parent',
    () => svc.update(school, power._id, { parent: power._id }, req),
    /its own parent/i);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4. NO HARD DELETES');
  // ───────────────────────────────────────────────────────────────────────────
  await throws('deleteMany throws',
    () => FmsExpenseCategory.deleteMany({ school }), /never deleted/i);
  await throws('deleteOne throws',
    () => FmsExpenseCategory.deleteOne({ _id: stat._id }), /never deleted/i);
  await throws('findOneAndDelete throws',
    () => FmsExpenseCategory.findOneAndDelete({ _id: stat._id }), /never deleted/i);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5. Deactivation NAMES what is blocking it');
  // ───────────────────────────────────────────────────────────────────────────
  // A bare "in use" leaves somebody hunting through screens for a reference the
  // system already knows about.
  await throws('a parent with an active child is blocked',
    () => svc.deactivate(school, utilities._id, req), /still in use/i);

  try {
    await svc.deactivate(school, utilities._id, req);
  } catch (e) {
    const blockers = e.details?.blockers || [];
    ok('and lists the blocker', blockers.length === 1, JSON.stringify(blockers));
    ok('naming the child by code',
      blockers[0]?.type === 'childCategory' && blockers[0]?.ref === 'ELEC',
      JSON.stringify(blockers[0]));
  }

  // Deactivate the child first, then the parent goes.
  await svc.deactivate(school, power._id, req);
  const gone = await svc.deactivate(school, utilities._id, req);
  ok('deactivates once nothing references it', gone.status === 'inactive');
  ok('the document survives', !!(await FmsExpenseCategory.findById(utilities._id)));
  ok('deactivation audited as cancel', (await FmsAuditTrail.countDocuments({
    school, entity: 'fms_expensecategories', action: 'cancel',
  })) === 2);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6. The account may change — until something has posted');
  // ───────────────────────────────────────────────────────────────────────────
  const moved = await svc.update(school, stat._id, { account: electricity._id }, req);
  ok('changed while unused', moved.accountCode === '5106', moved.accountCode);
  await svc.update(school, stat._id, { account: stationery._id }, req);   // restore

  // Simulate a posting. `expenseCategory` on the ledger entry arrives with P2.1;
  // written through the raw driver so this test does not depend on that stage.
  await mongoose.connection.db.collection('fms_ledgerentries').insertOne({
    school, expenseCategory: stat._id, accountCode: '5104',
    debit: 50000, credit: 0, entryDate: new Date(),
  });

  await throws('REFUSED once postings exist',
    () => svc.update(school, stat._id, { account: electricity._id }, req),
    /already has postings|split its history/i);

  const unchanged = await FmsExpenseCategory.findById(stat._id).lean();
  ok('and the account is untouched', unchanged.accountCode === '5104', unchanged.accountCode);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n7. Codes are unique PER SCHOOL, not globally');
  // ───────────────────────────────────────────────────────────────────────────
  await throws('a duplicate code in the same school is refused',
    () => svc.create(school, { code: 'STAT', name: 'Dupe', account: stationery._id }, req),
    /duplicate|E11000/i);

  // Every FMS document is school-scoped. Two schools both having a 'STAT' code
  // is correct, and a global unique index would be a real bug the day this runs
  // for a second branch.
  const [otherGrp] = await FmsAccountGroup.create([{
    school: otherSchool, groupCode: '5100', groupName: 'Operating Expenses',
    accountType: 'expense', normalBalance: 'debit', createdBy: user,
  }]);
  const otherAcct = await FmsAccount.create({
    school: otherSchool, accountCode: '5104', accountName: 'Stationery',
    accountGroup: otherGrp._id, accountType: 'expense', normalBalance: 'debit', createdBy: user,
  });
  const elsewhere = await svc.create(otherSchool, {
    code: 'STAT', name: 'Stationery', account: otherAcct._id,
  }, req);
  ok('THE SAME CODE IN ANOTHER SCHOOL IS FINE', !!elsewhere._id);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n8. Listing and the picker tree');
  // ───────────────────────────────────────────────────────────────────────────
  const all = await svc.list(school);
  ok('list is scoped to one school', all.every((c) => String(c.school) === String(school)));
  ok('and returns everything, unpaginated', all.length === 3, String(all.length));

  const activeOnly = await svc.list(school, { status: 'active' });
  ok('filterable by status', activeOnly.length === 1, String(activeOnly.length));

  const t = await svc.tree(school);
  ok('the tree shows active roots only', t.length === 1 && t[0].code === 'STAT',
    JSON.stringify(t.map((x) => x.code)));

  const detail = await svc.get(school, stat._id);
  ok('detail carries children', Array.isArray(detail.children));

  await throws('a category from another school is not found',
    () => svc.get(school, elsewhere._id), /not found|Expense category/i);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n9. Deactivation sees an expense request holding the category');
  // ───────────────────────────────────────────────────────────────────────────
  // Regression guard. This originally queried `category.ref`, following the
  // {name, ref} shape department and vendor use. But `category` on the expense
  // request is a REQUIRED String with live data — it cannot become an object
  // without failing to cast on every existing record, so the reference lives in
  // a flat `categoryRef` field instead.
  //
  // The mismatch was silent: the query simply matched nothing, so deactivation
  // succeeded while requests still pointed at the category. A guard that
  // quietly never fires is worse than no guard.
  const live = await svc.create(school, {
    code: 'LIVE', name: 'In use', account: stationery._id,
  }, req);

  await mongoose.connection.db.collection('fms_expenserequests').insertOne({
    school,
    expenseNumber: 'EXP-LIVE-1',
    categoryRef: live._id,
    category: 'In use',
    expenseStatus: 'submitted',
  });

  await throws('an open request BLOCKS deactivation',
    () => svc.deactivate(school, live._id, req), /still in use/i);

  try {
    await svc.deactivate(school, live._id, req);
  } catch (e) {
    const b = (e.details?.blockers || [])[0];
    ok('and names the expense by number',
      b?.type === 'expenseRequest' && b?.ref === 'EXP-LIVE-1', JSON.stringify(b));
  }

  // A completed request is history, not a live reference.
  await mongoose.connection.db.collection('fms_expenserequests')
    .updateOne({ expenseNumber: 'EXP-LIVE-1' }, { $set: { expenseStatus: 'closed' } });

  const freed = await svc.deactivate(school, live._id, req);
  ok('a CLOSED request does not block it', freed.status === 'inactive');

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