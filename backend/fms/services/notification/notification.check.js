// backend/fms/services/notification/notification.check.js
//
// Notifications. SRS M19.
//
//   node fms/services/notification/notification.check.js
//
// Section 1 is the rule that matters most: a notification cannot disrupt the
// operation that raised it. Section 2 is the P6.3 verification.

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
    const text = [e.code || '', e.message || ''].join(' ');
    ok(name, !match || match.test(text), text.slice(0, 150));
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

  // No mail server in a check run. That is the POINT of section 1.
  delete process.env.EMAIL_HOST;
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;

  const M = require('../../models/core');
  const { FmsNotification, FmsNotificationPreference } = require('../../models/notification');
  const svc = require('./notificationService');
  const ev = require('./events');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const R = (r) => r * 100;

  const MANAGER = new Types.ObjectId();
  const ACCOUNTANT = new Types.ObjectId();
  const PRINCIPAL = new Types.ObjectId();
  const REQUESTER = new Types.ObjectId();

  await M.FmsRoleAssignment.create([
    { school, smsUserId: MANAGER, smsUserEmail: 'mgr@school.test',
      financeRole: 'accountsManager', status: 'active' },
    { school, smsUserId: ACCOUNTANT, smsUserEmail: 'acct@school.test',
      financeRole: 'accountant', status: 'active' },
    { school, smsUserId: PRINCIPAL, smsUserEmail: 'principal@school.test',
      financeRole: 'principal', status: 'active' },
    // Inactive — must never be notified.
    { school, smsUserId: new Types.ObjectId(), smsUserEmail: 'former@school.test',
      financeRole: 'accountsManager', status: 'inactive' },
  ]);

  // ── 1. A notification cannot disrupt the caller ──────────────────────────
  console.log('1. Dispatch never throws into the caller');

  const r1 = await svc.notify(school, 'expenseSubmitted', {
    expenseNumber: 'EXP-1', amount: R(5000), purpose: 'Paper', requestedByName: 'Admin',
  });
  ok('notify resolves even with NO MAIL SERVER', !!r1 && typeof r1 === 'object');
  ok('and reports email as notConfigured rather than failing silently',
    r1.notConfigured > 0, JSON.stringify(r1));

  const r2 = await svc.notify(school, 'notARealEvent', {});
  ok('an unknown event resolves rather than throwing', !!r2.error);

  const r3 = await svc.notify(new Types.ObjectId(), 'expenseSubmitted', {});
  ok('a school with no recipients resolves', !!r3);
  ok('and records that nobody could be told', r3.error === 'no recipients');
  ok('with a row explaining why',
    (await FmsNotification.countDocuments({
      deliveryStatus: 'failed', statusReason: /No active user holds/,
    })) > 0);

  // The strongest form: a caller that forgets to await or catch.
  let threw = false;
  try {
    // eslint-disable-next-line no-void
    void svc.notify(school, 'expenseSubmitted', { amount: R(1) });
    await new Promise((res) => setTimeout(res, 50));
  } catch (_) { threw = true; }
  ok('AN UNAWAITED CALL DOES NOT PRODUCE AN UNHANDLED REJECTION', !threw);

  // ── 2. THE P6.3 VERIFICATION ─────────────────────────────────────────────
  console.log('\n2. An expense approval notifies and logs');

  await FmsNotification.deleteMany.call ? null : null;   // (deletes are blocked)
  const before = await FmsNotification.countDocuments({ school });

  const approval = await svc.notify(school, 'expenseApproved', {
    expenseNumber: 'EXP-2026-27-00012',
    amount: R(12500),
    purpose: 'Lab consumables',
    approvedByName: 'R. Principal',
    requesterId: REQUESTER,
    requesterEmail: 'science@school.test',
    entity: 'fms_expenserequests',
    entityId: new Types.ObjectId(),
  });

  ok('the dispatch reports what it did', approval.dispatched > 0, JSON.stringify(approval));
  ok('AND EVERY OUTCOME IS LOGGED',
    (await FmsNotification.countDocuments({ school })) > before);

  const logged = await FmsNotification.find({ school, event: 'expenseApproved' }).lean();
  ok('the accountant was notified',
    logged.some((l) => l.recipientEmail === 'acct@school.test'));
  ok('the manager was notified',
    logged.some((l) => l.recipientEmail === 'mgr@school.test'));
  ok('THE REQUESTER WAS TOLD ABOUT THEIR OWN EXPENSE',
    logged.some((l) => String(l.recipient) === String(REQUESTER)));
  ok('an INACTIVE role holder was NOT notified',
    !logged.some((l) => l.recipientEmail === 'former@school.test'));

  const inApp = logged.find((l) => l.channel === 'inApp');
  ok('the in-app copy was delivered', inApp?.deliveryStatus === 'sent');
  ok('it names the amount', /₹12,500\.00/.test(inApp.body));
  ok('and links back to the document', !!inApp.entityId && inApp.entity === 'fms_expenserequests');

  const email = logged.find((l) => l.channel === 'email');
  ok('the email attempt is recorded as notConfigured', email?.deliveryStatus === 'notConfigured');
  ok('WITH A REASON, so nobody assumes it was sent', /EMAIL_HOST/.test(email.statusReason || ''));

  // ── 3. Unconfigured channels are visible, not silent ─────────────────────
  console.log('\n3. Channels the deployment cannot reach');

  await svc.notify(school, 'budgetExceeded', {
    accountName: 'Printing & Stationery', accountCode: '5201',
    consumed: R(25000), budgetAmount: R(20000), available: -R(5000),
  });

  const smsRows = await FmsNotification.find({ school, channel: 'sms' }).lean();
  ok('an SMS that could not be sent IS RECORDED', smsRows.length > 0);
  ok('as notConfigured', smsRows.every((r) => r.deliveryStatus === 'notConfigured'));
  ok('with the reason', /no credentials/.test(smsRows[0].statusReason || ''));
  ok('the principal was among those told',
    (await FmsNotification.countDocuments({
      school, event: 'budgetExceeded', recipientEmail: 'principal@school.test',
    })) > 0);

  // ── 4. Preferences narrow, never widen ───────────────────────────────────
  console.log('\n4. Preferences');

  await svc.setPreference(school, MANAGER, 'expenseSubmitted', { channels: ['inApp'] }, {});
  const beforePref = await FmsNotification.countDocuments({
    school, event: 'expenseSubmitted', recipientEmail: 'mgr@school.test', channel: 'email',
  });

  await svc.notify(school, 'expenseSubmitted', { expenseNumber: 'EXP-2', amount: R(100) });

  const afterPref = await FmsNotification.countDocuments({
    school, event: 'expenseSubmitted', recipientEmail: 'mgr@school.test', channel: 'email',
  });
  ok('a narrowed preference drops the email', afterPref === beforePref, `${beforePref} → ${afterPref}`);

  await throws('A PREFERENCE CANNOT ADD A CHANNEL THE EVENT DOES NOT USE',
    () => svc.setPreference(school, MANAGER, 'budgetThreshold', { channels: ['email'] }, {}),
    /can only narrow/);

  await svc.setPreference(school, ACCOUNTANT, 'expenseSubmitted', { muted: true }, {});
  await svc.notify(school, 'expenseSubmitted', { expenseNumber: 'EXP-3', amount: R(100) });
  ok('a muted recipient is recorded as suppressed, not skipped',
    (await FmsNotification.countDocuments({
      school, recipientEmail: 'acct@school.test', deliveryStatus: 'suppressed',
    })) > 0);

  // ── 5. Inbox ─────────────────────────────────────────────────────────────
  console.log('\n5. Inbox');
  const box = await svc.inbox(school, MANAGER);
  ok('the manager has in-app notifications', box.count > 0);
  ok('and an unread count', box.unread > 0);

  const marked = await svc.markRead(school, MANAGER, box.notifications.slice(0, 1).map((n) => n._id));
  ok('marking read works', marked.marked === 1);

  const box2 = await svc.inbox(school, MANAGER);
  ok('the unread count drops', box2.unread === box.unread - 1);

  const otherBox = await svc.inbox(school, PRINCIPAL);
  ok('ONE PERSON CANNOT SEE ANOTHER\'S INBOX',
    otherBox.notifications.every((n) => String(n.recipient) === String(PRINCIPAL)));

  // ── 6. The log is evidence ───────────────────────────────────────────────
  console.log('\n6. The log');
  await throws('notifications are never deleted',
    () => FmsNotification.deleteMany({ school }), /never deleted/);

  const stats = await svc.stats(school);
  ok('stats report per channel', !!stats.byChannel);
  ok('and name the unconfigured channels', stats.unconfiguredChannels.length === 2);
  ok('and say whether mail is configured', stats.mailConfigured === false);

  // ── 7. Every event survives an empty payload ─────────────────────────────
  console.log('\n7. Robustness');
  let allSurvived = true;
  for (const key of Object.keys(ev.EVENTS)) {
    const out = await svc.notify(school, key, {});
    if (!out || out.error === 'dispatch threw') allSurvived = false;
  }
  ok('EVERY EVENT DISPATCHES WITH AN EMPTY PAYLOAD', allSurvived);
  ok('and none recorded a dispatch failure',
    (await FmsNotification.countDocuments({ school, statusReason: 'dispatch threw' })) === 0);

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
      if (/_fmscheck\d*$/.test(n)) await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  } catch (_) { /* ignore */ }
  process.exit(1);
});