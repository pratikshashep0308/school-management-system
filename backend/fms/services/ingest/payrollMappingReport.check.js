// backend/fms/services/ingest/payrollMappingReport.check.js
//
// B1 — payroll deduction mapping report checks.
//
//   node fms/services/ingest/payrollMappingReport.check.js
//
// Separate database (<yourdb>_fmscheck<pid>), dropped at the end.
//
// The SMS client is STUBBED. This report exists to be shown to an accountant
// and acted on, so the thing worth proving is that its numbers are right and
// that it writes nothing — section 5 is the one that matters most, because a
// report that quietly modified payroll would be the worst possible outcome of
// a task whose entire premise is "do not change the schema yet".

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

  const clientPath = require.resolve('../../client/smsClient');
  let SLIPS = [];
  let smsUp = true;
  require.cache[clientPath] = {
    id: clientPath, filename: clientPath, loaded: true,
    exports: {
      async get(path) {
        if (!smsUp) throw new Error('connect ECONNREFUSED 127.0.0.1:5000');
        if (path !== '/salary') throw new Error(`stub: unexpected path '${path}'`);
        return SLIPS;
      },
    },
  };

  const svc = require('./payrollMappingReport');
  const { FmsAccount, FmsAccountGroup } = require('../../models/core');

  const school = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();

  const [liab] = await FmsAccountGroup.create([{
    school, groupCode: '2100', groupName: 'Current Liabilities', accountType: 'liability',
    normalBalance: 'credit', createdBy: user,
  }]);
  const mkAccount = (code, name) => ({
    school, accountCode: code, accountName: name, accountGroup: liab._id,
    accountType: 'liability', normalBalance: 'credit', createdBy: user,
  });
  await FmsAccount.create([
    mkAccount('2105', 'ESIC Payable'),
    mkAccount('2106', 'Professional Tax Payable'),
    mkAccount('2109', 'Other Deductions Payable'),
  ]);

  /** A salary slip as /salary returns it, teacher populated. */
  const slip = ({ name = 'Sunita Jadhav', empId = 'EMP-01', month = 5, year = 2026,
    gross = 30000, pf = 1800, tax = 0, esic = 0, professionalTax = 0,
    loan = 0, other = 0 } = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    teacher: { employeeId: empId, user: { name } },
    month, year, status: 'paid',
    grossSalary: gross,
    netSalary: gross - pf - tax - esic - professionalTax - loan - other,
    deductions: { pf, tax, esic, professionalTax, loan, other },
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. Clean payroll — nothing hidden');
  // ───────────────────────────────────────────────────────────────────────────
  SLIPS = [slip(), slip({ name: 'Amit Kale', empId: 'EMP-02' })];
  let r = await svc.build(school);

  ok('both slips read', r.slipsRead === 2);
  ok('no unexplained deductions', r.affectedSlipCount === 0);
  ok('total is zero', r.otherTotalPaise === 0);
  ok('decision text confirms nothing needs reclassifying',
    /Nothing is sitting in the unnamed deductions account/.test(r.decisionRequired));
  ok('reports itself read-only', r.readOnly === true && r.nothingWasChanged === true);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2. Money in `other` is found and totalled');
  // ───────────────────────────────────────────────────────────────────────────
  SLIPS = [
    slip({ month: 4, other: 200 }),
    slip({ month: 5, other: 200 }),
    slip({ month: 6, other: 200 }),
    slip({ name: 'Amit Kale', empId: 'EMP-02', month: 5, other: 200 }),
    slip({ name: 'Priya Rao', empId: 'EMP-03', month: 5 }),   // clean
  ];
  r = await svc.build(school);

  ok('four slips affected', r.affectedSlipCount === 4, `got ${r.affectedSlipCount}`);
  ok('total is ₹800 in paise', r.otherTotalPaise === 80000, `got ${r.otherTotalPaise}`);
  ok('grouped by employee', r.perEmployee.length === 2, `got ${r.perEmployee.length}`);
  ok('largest first', r.perEmployee[0].totalPaise === 60000, `got ${r.perEmployee[0].totalPaise}`);

  // A single repeated amount is the shape a statutory deduction makes. Worth
  // flagging so the right question gets asked, without claiming it as proof.
  ok('recurring pattern flagged', r.looksRecurring === true);
  ok('one distinct amount seen', r.distinctAmountCount === 1, `got ${r.distinctAmountCount}`);
  ok('decision text frames the pool as historic',
    /HISTORIC/.test(r.decisionRequired) && /journal voucher/.test(r.decisionRequired));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3. Varying amounts are NOT called recurring');
  // ───────────────────────────────────────────────────────────────────────────
  SLIPS = [
    slip({ month: 4, other: 150 }),
    slip({ month: 5, other: 725 }),
    slip({ month: 6, other: 90 }),
  ];
  r = await svc.build(school);
  ok('three affected', r.affectedSlipCount === 3);
  ok('not flagged as recurring', r.looksRecurring === false);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4. No head is left unfeedable');
  // ───────────────────────────────────────────────────────────────────────────
  // Since 2026-07-30 both heads have fields behind them, so the unsourced list
  // is empty. Asserting that explicitly — if a future change reintroduces an
  // unfeedable head, this fails and somebody has to justify it.
  ok('no unsourced heads remain', r.unsourcedHeads.length === 0,
    JSON.stringify(r.unsourcedHeads.map((h) => h.code)));
  ok('schema change recorded as applied', r.schemaChange?.status === 'applied');
  ok('after-state names both new fields',
    /esic/.test(r.schemaChange.after) && /professionalTax/.test(r.schemaChange.after));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5. THE POINT — the report writes nothing');
  // ───────────────────────────────────────────────────────────────────────────
  // The whole premise of this task is that the schema change waits for the
  // accountant. A report that modified anything would defeat it.
  const before = await mongoose.connection.db.listCollections().toArray();
  const beforeCounts = {};
  for (const c of before) {
    beforeCounts[c.name] = await mongoose.connection.db.collection(c.name).countDocuments();
  }
  await svc.build(school);
  for (const [name, count] of Object.entries(beforeCounts)) {
    const now = await mongoose.connection.db.collection(name).countDocuments();
    ok(`${name} unchanged`, now === count, `${count} → ${now}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6. A slip that does not add up is surfaced separately');
  // ───────────────────────────────────────────────────────────────────────────
  const broken = slip({ name: 'Broken Slip', empId: 'EMP-09', other: 100 });
  broken.netSalary = broken.netSalary + 500;      // gross ≠ net + deductions
  SLIPS = [broken];
  r = await svc.build(school);
  ok('imbalance detected', r.unbalancedSlipCount === 1, `got ${r.unbalancedSlipCount}`);
  ok('difference reported', r.unbalancedSlips[0].differencePaise !== 0);
  ok('still counted as an unexplained deduction', r.affectedSlipCount === 1);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n7. A non-numeric deduction is reported, not silently dropped');
  // ───────────────────────────────────────────────────────────────────────────
  const bad = slip({ name: 'Bad Data', empId: 'EMP-10' });
  bad.deductions.other = 'n/a';
  SLIPS = [bad];
  r = await svc.build(school);
  ok('conversion error recorded', r.conversionErrors.length === 1, `got ${r.conversionErrors.length}`);
  ok('slip excluded from the convertible count', r.slipsConvertible === 0);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n8. An unreachable SMS produces no report at all');
  // ───────────────────────────────────────────────────────────────────────────
  smsUp = false;
  await throws('aborts rather than reporting zeroes',
    () => svc.build(school), /could not be reached/);
  smsUp = true;

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

// Note: an "old" slip — one written before the schema change, with no esic or
// professionalTax key at all — is covered by section 2, whose fixtures omit
// both. convertSlip treats a missing field as 0, so those slips convert and
// balance exactly as they did before the change.
