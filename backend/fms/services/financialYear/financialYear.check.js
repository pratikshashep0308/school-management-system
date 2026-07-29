// backend/fms/services/financialYear/financialYear.check.js
//
// Financial year lifecycle. SRS M22 / FR-M22, screen SCR-67.
//
//   node fms/services/financialYear/financialYear.check.js
//
// Section 2 is the P7.1 verification: close and lock a year, confirm no posting
// succeeds against it, and that only an authorised role can reopen — with an
// audit record.

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
  const testUri = uri.replace(/\/([^/?]+)(\?|$)/, '/$1_fmscheck$2');
  const dbName = testUri.match(/\/([^/?]+)(\?|$)/)[1];
  if (!dbName.endsWith('_fmscheck')) throw new Error(`Refusing: '${dbName}'`);

  await mongoose.connect(testUri);
  const info = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!info.setName) throw new Error('Not a replica set');
  console.log(`\nDatabase: ${dbName}   replica set: ${info.setName}\n`);

  const M = require('../../models/core');
  const svc = require('./financialYearService');
  const posting = require('../ledger/LedgerPostingService');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const POSTER = new Types.ObjectId();
  const R = (r) => r * 100;

  const as = (role) => ({ user: { _id: new Types.ObjectId(), email: `${role}@test` }, fmsRole: role });
  const chairman = as('chairman');
  const principal = as('principal');
  const accountant = as('accountant');
  const cashier = as('cashier');

  // A year that has already ended, so closing raises no date warning.
  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2025-26',
    startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31'),
    fyStatus: 'open', isCurrent: false,
  });

  const mkG = (c, n, t, b) => M.FmsAccountGroup.create({
    school, groupCode: c, groupName: n, accountType: t, normalBalance: b });
  const mkA = (c, n, g, t, b, x = {}) => M.FmsAccount.create({
    school, accountCode: c, accountName: n, accountGroup: g._id,
    accountType: t, normalBalance: b, ...x });

  const gAsset = await mkG('1000', 'Assets', 'asset', 'debit');
  const gInc = await mkG('4000', 'Income', 'income', 'credit');
  const cash = await mkA('1101', 'Cash in Hand', gAsset, 'asset', 'debit', { isCashAccount: true });
  const tuition = await mkA('4101', 'Tuition Fee Income', gInc, 'income', 'credit');

  const post = (date) => posting.post({
    school, financialYear: fy._id, voucherType: 'receipt',
    voucherDate: new Date(date), postedBy: POSTER, source: 'manual',
    lines: [
      { account: cash._id, debit: R(1000), credit: 0 },
      { account: tuition._id, debit: 0, credit: R(1000) },
    ],
  });

  await post('2025-06-10');
  await post('2025-09-15');

  // ── 1. Readiness ─────────────────────────────────────────────────────────
  console.log('1. Readiness');

  const r1 = await svc.readiness(school, fy._id);
  ok('the year is balanced', r1.balanced === true);
  ok('it counts the entries', r1.entries === 4, String(r1.entries));
  ok('and can be closed', r1.canClose === true);
  ok('but not yet locked', r1.canLock === false);
  ok('nor reopened', r1.canReopen === false);

  // ── 2. THE P7.1 VERIFICATION ─────────────────────────────────────────────
  console.log('\n2. Close, then lock, then try to post');

  const closed = await svc.close(school, fy._id, principal, { reason: 'Year end' });
  ok('the year closed', closed.financialYear.fyStatus === 'closed');
  ok('the closer is recorded', !!closed.financialYear.closedBy);

  await throws('NO POSTING SUCCEEDS AGAINST A CLOSED YEAR',
    () => post('2025-10-01'), /closed|FY_LOCKED/i);

  const afterClose = await M.FmsLedgerEntry.countDocuments({ school });
  ok('and nothing was written', afterClose === 4, String(afterClose));

  // Reopen — role-restricted and reasoned.
  await throws('an accountant may NOT reopen',
    () => svc.reopen(school, fy._id, accountant, { reason: 'I would like to' }),
    /may not reopen/);
  await throws('a cashier may not either',
    () => svc.reopen(school, fy._id, cashier, { reason: 'Need to fix something' }),
    /may not reopen/);
  await throws('and a reason is required',
    () => svc.reopen(school, fy._id, principal, { reason: 'oops' }), /meaningful/);

  const reopened = await svc.reopen(school, fy._id, principal, {
    reason: 'A June receipt was never entered and the auditor has asked for it',
  });
  ok('AN AUTHORISED ROLE CAN REOPEN', reopened.fyStatus === 'reopened');
  ok('the reason is recorded', /auditor/.test(reopened.reopenReason));
  ok('and the count incremented', reopened.reopenCount === 1);

  const reopenAudit = await M.FmsAuditTrail.findOne({
    school, entity: 'fms_financialyears', action: 'reopen',
  }).lean();
  ok('THE REOPEN IS AUDITED', !!reopenAudit);
  ok('naming who did it', reopenAudit.actorRole === 'principal');
  ok('with before and after', !!reopenAudit.before && !!reopenAudit.after);
  ok('and the status change visible',
    reopenAudit.before.fyStatus === 'closed' && reopenAudit.after.fyStatus === 'reopened');

  const afterReopen = await post('2025-10-01');
  ok('POSTING WORKS AGAIN once reopened', !!afterReopen.voucher.voucherNumber);

  // Close again, then LOCK.
  await svc.close(school, fy._id, principal, { reason: 'Corrected and closed' });

  await throws('locking requires the year code typed back',
    () => svc.lock(school, fy._id, chairman, {}), /type '2025-26' to confirm/);
  await throws('and the wrong code is refused',
    () => svc.lock(school, fy._id, chairman, { confirmYearCode: '2026-27' }), /to confirm/);

  const locked = await svc.lock(school, fy._id, chairman, { confirmYearCode: '2025-26' });
  ok('the year LOCKED', locked.fyStatus === 'locked');
  ok('the locker is recorded', !!locked.lockedBy);

  await throws('NO POSTING SUCCEEDS AGAINST A LOCKED YEAR',
    () => post('2025-11-01'), /locked|FY_LOCKED/i);

  // ── 3. Locked is irreversible ────────────────────────────────────────────
  console.log('\n3. Locked cannot be reopened');

  await throws('EVEN A CHAIRMAN CANNOT REOPEN A LOCKED YEAR',
    () => svc.reopen(school, fy._id, chairman, {
      reason: 'The auditor has asked for one more correction',
    }), /LOCKED and cannot be reopened/);

  await throws('and the message says what to do instead',
    () => svc.reopen(school, fy._id, chairman, { reason: 'A perfectly good reason here' }),
    /post.*current year/i);

  const stillLocked = await M.FmsFinancialYear.findById(fy._id);
  ok('the year is still locked', stillLocked.fyStatus === 'locked');
  ok('and was never reopened a second time', stillLocked.reopenCount === 1);

  await throws('a locked year cannot be closed again either',
    () => svc.close(school, fy._id, principal, {}), /cannot be closed/);

  // ── 4. An unbalanced year cannot be closed ───────────────────────────────
  console.log('\n4. An unbalanced year is not closeable');

  const bad = await M.FmsFinancialYear.create({
    school, yearCode: '2024-25',
    startDate: new Date('2024-04-01'), endDate: new Date('2025-03-31'),
    fyStatus: 'open', isCurrent: false,
  });

  // Write an unbalanced entry directly — the posting service would refuse it,
  // which is the point: this simulates data that predates the FMS.
  await M.FmsLedgerEntry.create({
    school, financialYear: bad._id, voucher: new Types.ObjectId(),
    voucherNumber: 'LEGACY-1', voucherType: 'journal',
    account: cash._id, accountCode: '1101', accountName: 'Cash in Hand',
    debit: R(500), credit: 0, entryDate: new Date('2024-06-01'),
    postedBy: POSTER, status: 'posted',
  });

  const badState = await svc.readiness(school, bad._id);
  ok('the imbalance is detected', badState.balanced === false);
  ok('and reported as a BLOCKER, not a warning', badState.blockers.length === 1);
  ok('naming the difference', badState.blockers[0].difference === R(500));
  ok('so it cannot be closed', badState.canClose === false);

  await throws('CLOSING AN UNBALANCED YEAR IS REFUSED',
    () => svc.close(school, bad._id, principal, { acknowledgeWarnings: true }),
    /cannot be closed/);
  await throws('and the reason explains why it matters',
    () => svc.close(school, bad._id, principal, {}), /freezes the error in place/);

  // ── 5. Warnings can be acknowledged, blockers cannot ─────────────────────
  console.log('\n5. Warnings versus blockers');

  const future = await M.FmsFinancialYear.create({
    school, yearCode: '2027-28',
    startDate: new Date('2027-04-01'), endDate: new Date('2028-03-31'),
    fyStatus: 'open', isCurrent: false,
  });

  const futureState = await svc.readiness(school, future._id);
  ok('a year that has not ended raises a WARNING',
    futureState.warnings.some((w) => w.type === 'yearNotEnded'));
  ok('but no blocker', futureState.blockers.length === 0);

  await throws('closing it unacknowledged is refused',
    () => svc.close(school, future._id, principal, {}), /warning/);

  const forced = await svc.close(school, future._id, principal, {
    acknowledgeWarnings: true, reason: 'Closing early deliberately',
  });
  ok('ACKNOWLEDGING LETS IT THROUGH', forced.financialYear.fyStatus === 'closed');
  ok('and the acknowledgement is returned', forced.acknowledgedWarnings.length === 1);

  const ackAudit = await M.FmsAuditTrail.findOne({
    school, entity: 'fms_financialyears', entityId: future._id,
  }).lean();
  ok('the acknowledgement is in the audit note', /acknowledged warning/.test(ackAudit.notes || ''));

  // ── 6. Integrity ─────────────────────────────────────────────────────────
  console.log('\n6. Integrity');

  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_financialyears' });
  ok('every transition is audited', audits >= 5, `${audits} entries`);

  await throws('financial years are never deleted',
    () => M.FmsFinancialYear.deleteOne({ _id: fy._id }), /never deleted/);

  const roles = svc.MAY_REOPEN;
  ok('the reopen list is short', roles.length <= 3, roles.join(','));
  ok('and excludes operational roles',
    !roles.includes('accountant') && !roles.includes('cashier'));

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