// backend/fms/services/journal/jv.check.js
//
// Journal Voucher integration checks. SRS M12.
//
//   cd /root/school-management-system/backend
//   node fms/services/journal/jv.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end.
//
// Section 1 is the P2.3 verification: create an unbalanced JV (expect
// rejection), a balanced one (post), then reverse it and confirm the mirror
// entry and unchanged original.

const mongoose = require('mongoose');
require('dotenv').config();

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log(`  ✔ ${name}`); }
  else { fail += 1; failures.push(name); console.log(`  ✖ ${name}${detail ? '  — ' + detail : ''}`); }
}

async function throws(name, fn, match) {
  try { await fn(); ok(name, false, 'expected a throw'); }
  catch (e) {
    const text = [e.code || '', e.message || '', e.details ? JSON.stringify(e.details) : ''].join(' ');
    ok(name, !match || match.test(text), text.slice(0, 140));
  }
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set — run from backend/');

  const testUri = uri.replace(/\/([^/?]+)(\?|$)/, '/$1_fmscheck$2');
  const dbName = testUri.match(/\/([^/?]+)(\?|$)/)[1];
  if (!dbName.endsWith('_fmscheck')) {
    throw new Error(`Refusing to run: '${dbName}' is not a _fmscheck database`);
  }

  await mongoose.connect(testUri);
  const info = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!info.setName) throw new Error('Not a replica set');

  console.log(`\nDatabase: ${dbName}   replica set: ${info.setName}\n`);

  const M = require('../../models/core');
  const { FmsJournalVoucher } = require('../../models/journal');
  const svc = require('./journalService');
  const gl = require('../ledger/ledgerQueryService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();

  // Two distinct people. Separation of duties is meaningless with one.
  const accountant = { user: { _id: new Types.ObjectId(), email: 'acct@test' }, fmsRole: 'accountant' };
  const manager = { user: { _id: new Types.ObjectId(), email: 'mgr@test' }, fmsRole: 'accountsManager' };

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  const mkG = (c, n, t, b) => M.FmsAccountGroup.create({ school, groupCode: c, groupName: n, accountType: t, normalBalance: b });
  const mkA = (c, n, g, t, b, extra = {}) => M.FmsAccount.create({
    school, accountCode: c, accountName: n, accountGroup: g._id, accountType: t, normalBalance: b, ...extra,
  });

  const gAsset = await mkG('1000', 'Assets', 'asset', 'debit');
  const gExp = await mkG('5000', 'Expenditure', 'expense', 'debit');
  const cash = await mkA('1101', 'Cash in Hand', gAsset, 'asset', 'debit', { isCashAccount: true });
  const bank = await mkA('1201', 'Bank', gAsset, 'asset', 'debit', { isBankAccount: true });
  const misc = await mkA('5299', 'Other Expenses', gExp, 'expense', 'debit');
  const head = await mkA('5000', 'Expenditure (head)', gExp, 'expense', 'debit', { isPostable: false });

  const amt = money.toPaise(12000);
  const base = () => ({
    financialYear: fy._id,
    jvDate: new Date('2026-07-20'),
    narration: 'Cash transferred to bank',
  });
  const balanced = () => ([
    { account: bank._id, debit: amt, credit: 0 },
    { account: cash._id, debit: 0, credit: amt },
  ]);

  // ── 1. THE P2.3 VERIFICATION ──────────────────────────────────────────────
  console.log('1. Unbalanced rejected → balanced posted → reversed');

  await throws('unbalanced JV cannot even be SAVED',
    () => svc.create(school, { ...base(), lines: [
      { account: bank._id, debit: amt, credit: 0 },
      { account: cash._id, debit: 0, credit: amt - 1 },
    ] }, accountant),
    /does not balance/);

  ok('nothing was persisted', (await FmsJournalVoucher.countDocuments({ school })) === 0);

  const jv = await svc.create(school, { ...base(), lines: balanced() }, accountant);
  ok('balanced JV saved as draft', jv.jvStatus === 'draft');
  ok('totals computed', jv.totalDebit === amt && jv.totalCredit === amt);
  ok('account snapshots captured', jv.lines[0].accountCode === '1201');
  ok('no ledger entries yet — a draft is not a posting',
    (await gl.entries(school, {}, { skip: 0, limit: 10, sort: {} })).total === 0);

  await svc.submit(school, jv._id, accountant, 'Please review');
  const submitted = await FmsJournalVoucher.findById(jv._id);
  ok('submitted', submitted.jvStatus === 'submitted');

  const approved = await svc.approve(school, jv._id, manager, 'Verified');
  ok('posted', approved.jv.jvStatus === 'posted');
  ok('voucher number allocated',
    /^JV-2026-27-\d{5}$/.test(approved.voucher.voucherNumber), approved.voucher.voucherNumber);
  ok('two ledger entries written', approved.entries.length === 2);

  const afterPost = await gl.entries(school, {}, { skip: 0, limit: 10, sort: {} });
  ok('ledger now shows the posting', afterPost.total === 2);
  ok('and it balances', afterPost.summary.balanced);

  // Reverse
  const rev = await svc.reverse(school, jv._id, manager, 'Duplicate entry');
  ok('JV marked reversed', rev.jv.jvStatus === 'reversed');
  ok('reversal voucher created', !!rev.reversal.voucherNumber);

  const mirror = await gl.entries(school, { voucher: String(rev.reversal._id) }, { skip: 0, limit: 10, sort: {} });
  const origLines = approved.entries;
  const mirrorBank = mirror.items.find((e) => e.accountCode === '1201');
  const origBank = origLines.find((e) => e.accountCode === '1201');
  ok('mirror entry is equal and opposite',
    mirrorBank.credit === origBank.debit && mirrorBank.debit === 0);
  ok('mirror lines flagged as reversals', mirror.items.every((e) => e.isReversal));

  const origStill = await gl.entries(school, { voucher: String(approved.voucher._id) }, { skip: 0, limit: 10, sort: {} });
  ok('ORIGINAL ledger entries unchanged', origStill.total === 2);
  ok('original amounts untouched',
    origStill.items.find((e) => e.accountCode === '1201').debit === amt);

  const tb = await gl.trialBalance(school);
  ok('trial balance still balanced after reversal', tb.totals.balanced);
  ok('cash back to zero', tb.lines.find((l) => l.accountCode === '1101').balance === 0);

  // ── 2. A posted voucher is immutable ──────────────────────────────────────
  console.log('\n2. Immutability');
  await throws('cannot edit a reversed JV',
    () => svc.update(school, jv._id, { narration: 'changed' }, accountant), /cannot be edited/);
  await throws('cannot re-submit', () => svc.submit(school, jv._id, accountant), /Cannot submit/);
  await throws('cannot cancel after posting',
    () => svc.cancel(school, jv._id, accountant), /already reversed|cannot be cancelled/);
  await throws('cannot reverse twice',
    () => svc.reverse(school, jv._id, manager, 'again'), /Only a posted/);

  const jv2 = await svc.create(school, { ...base(), lines: balanced() }, accountant);
  await svc.submit(school, jv2._id, accountant);
  const posted2 = await svc.approve(school, jv2._id, manager);
  await throws('POSTED JV cannot be edited',
    () => svc.update(school, jv2._id, { narration: 'tamper' }, accountant), /cannot be edited/);

  const check2 = await FmsJournalVoucher.findById(jv2._id);
  ok('narration unchanged after the blocked edit', check2.narration === base().narration);

  // ── 3. Separation of duties ───────────────────────────────────────────────
  console.log('\n3. Separation of duties');
  const jv3 = await svc.create(school, { ...base(), lines: balanced() }, accountant);
  await svc.submit(school, jv3._id, accountant);

  await throws('creator cannot approve their own voucher',
    () => svc.approve(school, jv3._id, accountant), /Separation of duties/);
  await throws('submitter cannot reject their own voucher',
    () => svc.reject(school, jv3._id, accountant, 'no'), /Separation of duties/);

  const stillSubmitted = await FmsJournalVoucher.findById(jv3._id);
  ok('voucher remains submitted after the blocked approval',
    stillSubmitted.jvStatus === 'submitted');
  ok('a different approver succeeds',
    (await svc.approve(school, jv3._id, manager)).jv.jvStatus === 'posted');

  // ── 4. Reject and correct ─────────────────────────────────────────────────
  console.log('\n4. Reject and correct');
  const jv4 = await svc.create(school, { ...base(), lines: balanced() }, accountant);
  await svc.submit(school, jv4._id, accountant);

  await throws('rejection without a reason blocked',
    () => svc.reject(school, jv4._id, manager, ''), /reason/);

  const rejected = await svc.reject(school, jv4._id, manager, 'Wrong account');
  ok('rejected', rejected.jvStatus === 'rejected');
  ok('reason recorded', rejected.rejectionReason === 'Wrong account');
  ok('no ledger entries from a rejected voucher',
    (await gl.entries(school, {}, { skip: 0, limit: 50, sort: {} })).items
      .every((e) => String(e.voucher) !== String(jv4._id)));

  const corrected = await svc.update(school, jv4._id, { narration: 'Corrected transfer' }, accountant);
  ok('editing a rejected voucher returns it to DRAFT', corrected.jvStatus === 'draft');
  ok('so it cannot skip re-approval',
    corrected.workflow.some((w) => w.fromStatus === 'rejected' && w.toStatus === 'draft'));

  // ── 5. Validation ─────────────────────────────────────────────────────────
  console.log('\n5. Validation');
  await throws('fewer than two lines rejected',
    () => svc.create(school, { ...base(), lines: [{ account: cash._id, debit: 100, credit: 0 }] }, accountant),
    /at least two lines/);
  await throws('float rupees rejected',
    () => svc.create(school, { ...base(), lines: [
      { account: bank._id, debit: 120.50, credit: 0 }, { account: cash._id, debit: 0, credit: 120.50 },
    ] }, accountant), /integer paise/);
  await throws('both sides non-zero rejected',
    () => svc.create(school, { ...base(), lines: [
      { account: bank._id, debit: 100, credit: 100 }, { account: cash._id, debit: 0, credit: 100 },
    ] }, accountant), /exactly one/);
  await throws('non-postable account rejected at SAVE, not at post',
    () => svc.create(school, { ...base(), lines: [
      { account: head._id, debit: amt, credit: 0 }, { account: cash._id, debit: 0, credit: amt },
    ] }, accountant), /grouping head|not postable/);
  await throws('unknown account rejected',
    () => svc.create(school, { ...base(), lines: [
      { account: new Types.ObjectId(), debit: amt, credit: 0 }, { account: cash._id, debit: 0, credit: amt },
    ] }, accountant), /not found/);
  await throws('date outside the financial year rejected',
    () => svc.create(school, { ...base(), jvDate: new Date('2025-01-01'), lines: balanced() }, accountant),
    /must fall within/);

  // ── 6. Cancel ─────────────────────────────────────────────────────────────
  console.log('\n6. Cancel');
  const jv6 = await svc.create(school, { ...base(), lines: balanced() }, accountant);
  const cancelled = await svc.cancel(school, jv6._id, accountant, 'Raised in error');
  ok('draft cancelled', cancelled.jvStatus === 'cancelled');
  ok('but NOT deleted — the attempt stays on record',
    (await FmsJournalVoucher.countDocuments({ _id: jv6._id })) === 1);
  await throws('cannot cancel twice', () => svc.cancel(school, jv6._id, accountant), /already cancelled/);
  await throws('cannot submit a cancelled voucher',
    () => svc.submit(school, jv6._id, accountant), /Cannot submit/);

  // ── 7. Financial year lock ────────────────────────────────────────────────
  console.log('\n7. Financial year lock');
  const jv7 = await svc.create(school, { ...base(), lines: balanced() }, accountant);
  await svc.submit(school, jv7._id, accountant);
  await M.FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'locked' } });

  await throws('cannot approve into a locked FY',
    () => svc.approve(school, jv7._id, manager), /locked/);
  await throws('cannot create in a locked FY',
    () => svc.create(school, { ...base(), lines: balanced() }, accountant), /locked/);

  await M.FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'open' } });
  ok('approval succeeds once reopened',
    (await svc.approve(school, jv7._id, manager)).jv.jvStatus === 'posted');

  // ── 8. Workflow trail and audit ───────────────────────────────────────────
  console.log('\n8. Workflow trail');
  const trail = await FmsJournalVoucher.findById(jv4._id).lean();
  const actions = trail.workflow.map((w) => w.action);
  ok('every step recorded',
    ['create', 'submit', 'reject', 'update'].every((a) => actions.includes(a)), actions.join(','));
  ok('steps carry an actor', trail.workflow.every((w) => !!w.actor));
  ok('steps carry timestamps', trail.workflow.every((w) => !!w.at));

  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_journalvouchers' });
  ok('audit trail written', audits > 0, `${audits} entries`);

  const postAudit = await M.FmsAuditTrail
    .findOne({ school, entity: 'fms_journalvouchers', action: 'post' }).lean();
  ok('posting audited with before/after', !!postAudit?.before && !!postAudit?.after);

  // ── 9. Final ──────────────────────────────────────────────────────────────
  console.log('\n9. Final integrity');
  const finalTb = await gl.trialBalance(school);
  ok('FINAL: debits = credits across everything',
    finalTb.totals.balanced && finalTb.totals.difference === 0, JSON.stringify(finalTb.totals));

  const posted = await FmsJournalVoucher.countDocuments({ school, jvStatus: { $in: ['posted', 'reversed'] } });
  const vouchers = await M.FmsVoucher.countDocuments({ school, voucherType: 'journal', reversalOf: null });
  ok('one ledger voucher per posted JV', posted === vouchers, `JVs=${posted} vouchers=${vouchers}`);

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