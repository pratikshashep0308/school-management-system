// backend/fms/services/access/access.check.js
//
// Finance access control and step-up session checks.
//
//   node fms/services/access/access.check.js
//
// Separate database (<yourdb>_fmscheck<pid>), dropped at the end.
//
// The three that matter:
//
//   §3 — the last administrator cannot be removed. This screen is the ONLY way
//        to grant finance access, so demoting the last chairman would leave
//        nobody able to restore it and no way to recover except editing the
//        database by hand.
//   §5 — a school-system token cannot be replayed as a finance token. If the
//        purpose claim were ever dropped, every signed-in user would silently
//        hold an open finance session.
//   §6 — failed unlocks lock out. Without it the unlock endpoint is a password
//        oracle: unlimited guesses against a known account.

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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
  console.log(`\nDatabase: ${dbName}\n`);

  process.env.FMS_SESSION_SECRET = 'test-finance-secret';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-sms-secret';

  // The SMS User model, as the services expect to find it registered.
  require('../../../models/User');
  const User = mongoose.model('User');

  const access = require('./accessService');
  const session = require('../auth/financeSession');
  const { FmsRoleAssignment, FmsAuditTrail } = require('../../models/core');

  const school = new mongoose.Types.ObjectId();
  const PASSWORD = 'Correct#Horse9';
  const hash = await bcrypt.hash(PASSWORD, 10);

  const mkUser = async (name, email, role = 'schoolAdmin', isActive = true) => {
    const [u] = await User.collection.insertMany([{
      name, email, password: hash, role, school, isActive, createdAt: new Date(),
    }]).then((r) => Object.values(r.insertedIds).map((id) => ({ _id: id })));
    return { _id: u._id, name, email, school, isActive };
  };

  const chair = await mkUser('Vijay Borse', 'vijay@test.in', 'superAdmin');
  const principal = await mkUser('Pratiksha S', 'pratiksha@test.in', 'schoolAdmin');
  const clerk = await mkUser('A Clerk', 'clerk@test.in', 'accountant');
  const gone = await mkUser('Left Last Year', 'gone@test.in', 'accountant', false);

  const req = (user) => ({ user, fmsRole: 'chairman', ip: '10.0.0.1', get: () => 'check' });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('1. Everybody is listed, with or without access');
  // ───────────────────────────────────────────────────────────────────────────
  let list = await access.listUsers(school);
  ok('all four users listed', list.length === 4, `got ${list.length}`);
  ok('nobody has finance access yet', list.every((u) => u.financeRole === null));
  ok('the deactivated account is flagged',
    list.find((u) => u.email === 'gone@test.in').smsActive === false);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2. Granting, changing and withdrawing');
  // ───────────────────────────────────────────────────────────────────────────
  await access.assign(school, chair._id, 'chairman', {}, req(chair));
  await access.assign(school, clerk._id, 'accountant', {}, req(chair));

  list = await access.listUsers(school);
  ok('chairman granted', list.find((u) => u.email === 'vijay@test.in').financeRole === 'chairman');
  ok('accountant granted', list.find((u) => u.email === 'clerk@test.in').financeRole === 'accountant');

  await access.assign(school, clerk._id, 'accountsManager', {}, req(chair));
  list = await access.listUsers(school);
  ok('role changed in place', list.find((u) => u.email === 'clerk@test.in').financeRole === 'accountsManager');
  ok('still one assignment for that user',
    await FmsRoleAssignment.countDocuments({ school, smsUserId: clerk._id }) === 1);

  await access.revoke(school, clerk._id, req(chair));
  list = await access.listUsers(school);
  ok('access withdrawn', list.find((u) => u.email === 'clerk@test.in').financeRole === null);
  // Deactivated, not deleted — the row is the record that they once had access.
  const revoked = await FmsRoleAssignment.findOne({ school, smsUserId: clerk._id }).lean();
  ok('the record survives, deactivated', revoked && revoked.status === 'inactive');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3. THE LOCKOUT GUARD — the last administrator stays');
  // ───────────────────────────────────────────────────────────────────────────
  await throws('cannot withdraw the only administrator',
    () => access.revoke(school, chair._id, req(chair)), /only person who can grant/);

  await throws('cannot demote the only administrator either',
    () => access.assign(school, chair._id, 'accountant', {}, req(chair)),
    /only person who can grant/);

  const stillChair = await FmsRoleAssignment.findOne({ school, smsUserId: chair._id }).lean();
  ok('and the role is untouched', stillChair.financeRole === 'chairman' && stillChair.status === 'active');

  // With a second administrator, the first may go.
  await access.assign(school, principal._id, 'trustee', {}, req(chair));
  await access.assign(school, chair._id, 'accountsManager', {}, req(chair));
  ok('demotion allowed once somebody else can administer',
    (await FmsRoleAssignment.findOne({ school, smsUserId: chair._id }).lean()).financeRole
      === 'accountsManager');
  await access.assign(school, chair._id, 'chairman', {}, req(chair));   // restore

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4. Guards on granting');
  // ───────────────────────────────────────────────────────────────────────────
  await throws('a deactivated account cannot be granted access',
    () => access.assign(school, gone._id, 'accountant', {}, req(chair)), /deactivated/);

  await throws('an invented role is refused',
    () => access.assign(school, clerk._id, 'treasurer', {}, req(chair)), /not a finance role/);

  await throws('a user from another school is not found',
    () => access.assign(school, new mongoose.Types.ObjectId(), 'accountant', {}, req(chair)),
    /not found|Resource/i);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5. THE PURPOSE CLAIM — an SMS token is not a finance token');
  // ───────────────────────────────────────────────────────────────────────────
  const smsToken = jwt.sign({ id: String(chair._id) }, process.env.JWT_SECRET, { expiresIn: '30d' });
  ok('an SMS token is rejected', session.verify(smsToken, chair).ok === false);
  ok('and the reason names the cause',
    ['wrongPurpose', 'invalid'].includes(session.verify(smsToken, chair).reason));

  const good = await session.unlock(chair, PASSWORD, req(chair));
  ok('a correct password opens a session', !!good.token);
  ok('the session verifies', session.verify(good.token, chair).ok === true);
  ok('it expires in minutes, not days',
    good.expiresInSeconds <= 60 * 60, String(good.expiresInSeconds));

  // Somebody else's finance token does not work for you.
  ok('a token belonging to another user is rejected',
    session.verify(good.token, principal).ok === false);

  const expired = jwt.sign(
    { id: String(chair._id), purpose: 'fms' }, process.env.FMS_SESSION_SECRET, { expiresIn: -10 },
  );
  ok('an expired session is rejected', session.verify(expired, chair).ok === false);
  ok('and says so specifically', session.verify(expired, chair).reason === 'expired');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6. THE ORACLE GUARD — failed unlocks lock out');
  // ───────────────────────────────────────────────────────────────────────────
  session.clearFailures(principal._id);
  for (let i = 1; i < session.MAX_ATTEMPTS; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await session.unlock(principal, 'wrong', req(principal)).catch(() => {});
  }
  ok('not locked out before the limit', session.lockState(principal._id).locked === false);

  await session.unlock(principal, 'wrong', req(principal)).catch(() => {});
  ok('locked out at the limit', session.lockState(principal._id).locked === true);

  await throws('and the CORRECT password is refused while locked',
    () => session.unlock(principal, PASSWORD, req(principal)), /locked/i);

  session.clearFailures(principal._id);
  const after = await session.unlock(principal, PASSWORD, req(principal));
  ok('works again once the lockout clears', !!after.token);

  ok('a correct password clears the failure count',
    session.lockState(principal._id).failures === 0);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n7. Everything is on the audit trail');
  // ───────────────────────────────────────────────────────────────────────────
  // "Who gave the accountant approval rights, and when" is the question this
  // whole screen exists to be able to answer afterwards.
  const roleAudits = await FmsAuditTrail.countDocuments({ school, entity: 'fms_roleassignments' });
  ok('role changes audited', roleAudits >= 5, `${roleAudits} entries`);

  const sessionAudits = await FmsAuditTrail.find({
    school, entity: 'fms_financesession',
  }).lean();
  ok('unlocks audited', sessionAudits.some((a) => a.action === 'unlock'));
  ok('FAILED unlocks audited too', sessionAudits.some((a) => a.action === 'unlockFailed'));
  ok('lockouts audited', sessionAudits.some((a) => a.action === 'lockout'));
  ok('the actor is recorded', sessionAudits.every((a) => !!a.actor));

  // No audit entry may ever carry the password itself.
  const leaked = sessionAudits.some((a) => JSON.stringify(a).includes(PASSWORD));
  ok('NO password appears anywhere in the audit trail', leaked === false);

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
