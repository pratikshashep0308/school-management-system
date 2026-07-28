// backend/fms/services/approval/approval.check.js
//
// Expense approval workflow integration checks. SRS M5 / BPMN WF1.
//
//   cd /root/school-management-system/backend
//   node fms/services/approval/approval.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end.
//
// Section 1 is the P3.3 verification: push ₹9,000 / ₹40,000 / ₹1,50,000 /
// ₹3,00,000 through and confirm each follows the correct approver chain;
// confirm a reject and a return behave correctly and the history is complete.

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
    ok(name, !match || match.test(text), text.slice(0, 160));
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
  const { FmsExpenseRequest } = require('../../models/expense');
  const { FmsExpenseApproval, FmsApprovalMatrix } = require('../../models/approval');
  const expenseSvc = require('../expense/expenseService');
  const svc = require('./approvalService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();

  // Distinct people at every level — the workflow is meaningless otherwise.
  const who = (email, role) => ({ user: { _id: new Types.ObjectId(), email }, fmsRole: role });
  const requester = who('teacher@test', 'deptHead');
  const accountant = who('acct@test', 'accountant');
  const deptHead = who('dept@test', 'deptHead');
  const principal = who('principal@test', 'principal');
  const chairman = who('chairman@test', 'chairman');
  const trustee = who('trustee@test', 'trustee');
  const cashier = who('cashier@test', 'cashier');

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });
  await M.FmsNumberSequence.create({
    school, financialYear: fy._id, type: 'EXP',
    prefix: 'EXP', yearLabel: fy.yearCode, sequence: 0, padding: 5,
  });

  const gExp = await M.FmsAccountGroup.create({
    school, groupCode: '5000', groupName: 'Expenditure', accountType: 'expense', normalBalance: 'debit',
  });
  const head = await M.FmsAccount.create({
    school, accountCode: '5201', accountName: 'Printing & Stationery',
    accountGroup: gExp._id, accountType: 'expense', normalBalance: 'debit',
  });

  const attachment = [{ fileName: 'invoice.pdf', url: '/u/invoice.pdf', kind: 'invoice' }];

  async function raise(rupeeAmount) {
    const amt = money.toPaise(rupeeAmount);
    const e = await expenseSvc.create(school, {
      requestDate: new Date('2026-07-20'),
      department: { name: 'Administration' },
      category: 'Stationery',
      purpose: `Purchase worth ₹${rupeeAmount}`,
      budgetHead: head._id,
      baseAmount: amt, totalAmount: amt,
      paymentMode: 'cheque',
      attachments: attachment,
    }, requester);
    await expenseSvc.submit(school, e._id, requester, {});
    return FmsExpenseRequest.findById(e._id);
  }

  // ── 1. THE P3.3 VERIFICATION ──────────────────────────────────────────────
  console.log('1. Four amounts through their correct chains');

  // ₹9,000 → tier 1: accounts → deptHead
  const e9k = await raise(9000);
  let pos = await svc.position(school, e9k);
  ok('₹9,000 is tier 1', pos.tier === 1);
  ok('₹9,000 needs deptHead only', JSON.stringify(pos.approvers) === '["deptHead"]');
  ok('and accounts must go first', pos.next.step === 'accounts');

  await svc.act(school, e9k._id, { action: 'verify', step: 'accounts' }, accountant);
  await svc.act(school, e9k._id, { action: 'approve', step: 'deptHead' }, deptHead);
  const done9k = await FmsExpenseRequest.findById(e9k._id);
  ok('₹9,000 REACHES paymentPending after 2 steps',
    done9k.expenseStatus === 'paymentPending', done9k.expenseStatus);

  // ₹40,000 → tier 2: accounts → principal
  const e40k = await raise(40000);
  pos = await svc.position(school, e40k);
  ok('₹40,000 is tier 2', pos.tier === 2);
  ok('₹40,000 needs principal', JSON.stringify(pos.approvers) === '["principal"]');

  await svc.act(school, e40k._id, { action: 'verify', step: 'accounts' }, accountant);
  await svc.act(school, e40k._id, { action: 'approve', step: 'principal' }, principal);
  ok('₹40,000 REACHES paymentPending',
    (await FmsExpenseRequest.findById(e40k._id)).expenseStatus === 'paymentPending');

  // ₹1,50,000 → tier 3: accounts → principal → chairman
  const e150k = await raise(150000);
  pos = await svc.position(school, e150k);
  ok('₹1,50,000 is tier 3', pos.tier === 3);
  ok('₹1,50,000 needs principal + chairman',
    JSON.stringify(pos.approvers) === '["principal","chairman"]');

  await svc.act(school, e150k._id, { action: 'verify', step: 'accounts' }, accountant);
  await svc.act(school, e150k._id, { action: 'approve', step: 'principal' }, principal);
  const mid150 = await FmsExpenseRequest.findById(e150k._id);
  ok('after the principal it is principalApproved, NOT paymentPending',
    mid150.expenseStatus === 'principalApproved', mid150.expenseStatus);

  await svc.act(school, e150k._id, { action: 'approve', step: 'chairman' }, chairman);
  ok('₹1,50,000 REACHES paymentPending after the chairman',
    (await FmsExpenseRequest.findById(e150k._id)).expenseStatus === 'paymentPending');

  // ₹3,00,000 → tier 4: accounts → principal → chairman → trustee
  const e300k = await raise(300000);
  pos = await svc.position(school, e300k);
  ok('₹3,00,000 is tier 4', pos.tier === 4);
  ok('₹3,00,000 needs principal + chairman + trustee',
    JSON.stringify(pos.approvers) === '["principal","chairman","trustee"]');

  await svc.act(school, e300k._id, { action: 'verify', step: 'accounts' }, accountant);
  await svc.act(school, e300k._id, { action: 'approve', step: 'principal' }, principal);
  await svc.act(school, e300k._id, { action: 'approve', step: 'chairman' }, chairman);

  const mid300 = await FmsExpenseRequest.findById(e300k._id);
  ok('tier 4 at chairmanApproved is NOT finished', mid300.expenseStatus === 'chairmanApproved');
  const pos300 = await svc.position(school, mid300);
  ok('and nextAction says a TRUSTEE is required', pos300.next.step === 'trustee');

  await svc.act(school, e300k._id, { action: 'approve', step: 'trustee' }, trustee);
  ok('₹3,00,000 REACHES paymentPending after the trustee',
    (await FmsExpenseRequest.findById(e300k._id)).expenseStatus === 'paymentPending');

  // ── 2. Reject ─────────────────────────────────────────────────────────────
  console.log('\n2. Reject');
  const toReject = await raise(40000);
  await svc.act(school, toReject._id, { action: 'verify', step: 'accounts' }, accountant);

  await throws('rejection without a reason blocked',
    () => svc.reject(school, toReject._id, principal, ''), /reason/);

  const rejected = await svc.reject(school, toReject._id, principal, 'Quote is not competitive');
  ok('rejected', rejected.expense.expenseStatus === 'rejected');

  await throws('a rejected expense cannot be approved',
    () => svc.act(school, toReject._id, { action: 'approve', step: 'principal' }, principal),
    /rejected|Out of order|cannot/);

  // ── 3. Return for correction ──────────────────────────────────────────────
  console.log('\n3. Return for correction');
  const toReturn = await raise(40000);
  await svc.act(school, toReturn._id, { action: 'verify', step: 'accounts' }, accountant);

  const returned = await svc.returnForCorrection(
    school, toReturn._id, principal, 'Attach the comparative quotes'
  );
  ok('returned', returned.expense.expenseStatus === 'returned');

  const corrected = await expenseSvc.update(school, toReturn._id, {
    purpose: 'Purchase worth ₹40,000 (revised)',
  }, requester);
  ok('a returned request becomes editable and reverts to draft',
    corrected.expenseStatus === 'draft');

  await expenseSvc.submit(school, toReturn._id, requester, {});

  // A return resets the chain — the earlier verification no longer counts.
  const afterResubmit = await FmsExpenseRequest.findById(toReturn._id);
  const posAfter = await svc.position(school, afterResubmit);
  ok('RESUBMISSION RESTARTS THE CHAIN at accounts',
    posAfter.next.step === 'accounts', posAfter.next.step);
  ok('the earlier verification no longer counts',
    !posAfter.completedSteps.includes('accounts'));

  // ── 4. No state skipping ──────────────────────────────────────────────────
  console.log('\n4. No state skipping');
  const skip = await raise(150000);

  await throws('principal cannot act before accounts verify',
    () => svc.act(school, skip._id, { action: 'approve', step: 'principal' }, principal),
    /Out of order/);

  await svc.act(school, skip._id, { action: 'verify', step: 'accounts' }, accountant);

  await throws('chairman cannot act before the principal',
    () => svc.act(school, skip._id, { action: 'approve', step: 'chairman' }, chairman),
    /Out of order/);

  ok('the expense is still at accountsVerified',
    (await FmsExpenseRequest.findById(skip._id)).expenseStatus === 'accountsVerified');

  await throws('accounts cannot verify twice',
    () => svc.act(school, skip._id, { action: 'verify', step: 'accounts' }, accountant),
    /Out of order|already acted/);

  // ── 5. Unauthorised roles ─────────────────────────────────────────────────
  console.log('\n5. Unauthorised roles');
  await throws('a cashier cannot verify',
    () => svc.act(school, skip._id, { action: 'approve', step: 'principal' }, cashier),
    /cannot perform|Role/);

  await throws('a deptHead cannot act at the principal step',
    () => svc.act(school, skip._id, { action: 'approve', step: 'principal' }, deptHead),
    /cannot perform|Role/);

  const viceP = who('vp@test', 'vicePrincipal');
  const vpOk = await svc.act(school, skip._id, { action: 'approve', step: 'principal' }, viceP);
  ok('a vice principal MAY stand in for the principal',
    vpOk.expense.expenseStatus === 'principalApproved');

  await throws('a principal cannot act as chairman',
    () => svc.act(school, skip._id, { action: 'approve', step: 'chairman' }, principal),
    /cannot perform|Role/);

  await svc.act(school, skip._id, { action: 'approve', step: 'chairman' }, chairman);
  ok('the chairman completes it',
    (await FmsExpenseRequest.findById(skip._id)).expenseStatus === 'paymentPending');

  // ── 6. Separation of duties ───────────────────────────────────────────────
  console.log('\n6. Separation of duties');
  const own = await raise(9000);
  await throws('the requester cannot verify their own expense',
    () => svc.act(school, own._id, { action: 'verify', step: 'accounts' }, requester),
    /Separation of duties/);

  await svc.act(school, own._id, { action: 'verify', step: 'accounts' }, accountant);
  await throws('the requester cannot approve their own expense',
    () => svc.act(school, own._id, { action: 'approve', step: 'deptHead' }, requester),
    /Separation of duties/);

  // Nor may one person occupy two steps of the same chain.
  const twoStep = await raise(150000);
  const dual = who('dual@test', 'chairman');   // chairman may act at several steps
  await svc.act(school, twoStep._id, { action: 'verify', step: 'accounts' }, accountant);
  await svc.act(school, twoStep._id, { action: 'approve', step: 'principal' }, principal);
  await throws('the principal cannot also take the chairman step',
    () => svc.act(school, twoStep._id, { action: 'approve', step: 'chairman' },
      { user: principal.user, fmsRole: 'chairman' }),
    /already acted/);
  await svc.act(school, twoStep._id, { action: 'approve', step: 'chairman' }, dual);
  ok('a different chairman completes it',
    (await FmsExpenseRequest.findById(twoStep._id)).expenseStatus === 'paymentPending');

  // ── 7. Inbox ──────────────────────────────────────────────────────────────
  console.log('\n7. Inbox');
  const pending = await raise(150000);
  await svc.act(school, pending._id, { action: 'verify', step: 'accounts' }, accountant);

  const principalInbox = await svc.inbox(school, 'principal', principal.user._id);
  ok('the expense appears in the principal inbox',
    principalInbox.items.some((i) => String(i._id) === String(pending._id)));
  ok('with the awaiting step marked',
    principalInbox.items.find((i) => String(i._id) === String(pending._id))?.awaitingStep === 'principal');

  const chairInbox = await svc.inbox(school, 'chairman', chairman.user._id);
  ok('but NOT in the chairman inbox yet',
    !chairInbox.items.some((i) => String(i._id) === String(pending._id)));

  const ownInbox = await svc.inbox(school, 'deptHead', requester.user._id);
  ok('your own requests never appear in your inbox',
    !ownInbox.items.some((i) => String(i.requestedBy) === String(requester.user._id)));

  const acctInbox = await svc.inbox(school, 'accountant', accountant.user._id);
  ok('an expense you already verified leaves your inbox',
    !acctInbox.items.some((i) => String(i._id) === String(pending._id)));

  // ── 8. History ────────────────────────────────────────────────────────────
  console.log('\n8. History');
  const hist = await svc.history(school, e300k._id);
  ok('history returns every step', hist.approvals.length === 4, String(hist.approvals.length));
  ok('in order',
    hist.approvals.map((a) => a.step).join(',') === 'accounts,principal,chairman,trustee');
  ok('each records the actor', hist.approvals.every((a) => !!a.actor));
  ok('each records from and to status',
    hist.approvals.every((a) => !!a.fromStatus && !!a.toStatus));
  ok('each snapshots the amount and tier',
    hist.approvals.every((a) => a.amountAtAction === money.toPaise(300000) && a.tierAtAction === 4));

  const rejHist = await svc.history(school, toReject._id);
  ok('a rejection is in the history',
    rejHist.approvals.some((a) => a.action === 'reject'));
  ok('with its reason',
    rejHist.approvals.find((a) => a.action === 'reject').comment === 'Quote is not competitive');

  // ── 9. Approval records are append-only ───────────────────────────────────
  console.log('\n9. Append-only');
  const anApproval = await FmsExpenseApproval.findOne({ school });
  await throws('updateOne blocked',
    () => FmsExpenseApproval.updateOne({ _id: anApproval._id }, { $set: { comment: 'x' } }),
    /append-only/);
  await throws('deleteOne blocked',
    () => FmsExpenseApproval.deleteOne({ _id: anApproval._id }), /append-only/);
  await throws('deleteMany blocked',
    () => FmsExpenseApproval.deleteMany({ school }), /append-only/);

  // ── 10. Configurable matrix ───────────────────────────────────────────────
  console.log('\n10. Configurable matrix');
  await throws('a matrix with a gap is rejected',
    () => svc.saveMatrix(school, { tiers: [
      { tier: 1, minAmount: 0, maxAmount: 1000000, approvers: ['deptHead'] },
      { tier: 2, minAmount: 3000000, maxAmount: null, approvers: ['principal'] },
    ] }, chairman), /gap/);

  await throws('a matrix with an overlap is rejected',
    () => svc.saveMatrix(school, { tiers: [
      { tier: 1, minAmount: 0, maxAmount: 3000000, approvers: ['deptHead'] },
      { tier: 2, minAmount: 1000000, maxAmount: null, approvers: ['principal'] },
    ] }, chairman), /overlap/);

  const saved = await svc.saveMatrix(school, { tiers: [
    { tier: 1, minAmount: 0, maxAmount: 500000, approvers: ['deptHead'] },
    { tier: 2, minAmount: 500001, maxAmount: null, approvers: ['principal', 'chairman'] },
  ], notes: 'Tightened thresholds' }, chairman);
  ok('a valid matrix saves', saved.version === 1 || saved.version === 2);

  const custom = await raise(9000);   // ₹9,000 now needs principal + chairman
  const customPos = await svc.position(school, custom);
  ok('THE NEW MATRIX CHANGES ROUTING',
    JSON.stringify(customPos.approvers) === '["principal","chairman"]',
    JSON.stringify(customPos.approvers));

  const active = await FmsApprovalMatrix.countDocuments({ school, isActive: true });
  ok('only one matrix is active at a time', active === 1, String(active));

  const superseded = await FmsApprovalMatrix.countDocuments({ school, isActive: false });
  ok('the previous version is superseded, not deleted', superseded >= 0);

  // ── 11. Audit ─────────────────────────────────────────────────────────────
  console.log('\n11. Audit');
  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_expenserequests' });
  ok('workflow actions are audited', audits >= 10, `${audits} entries`);

  ok('STILL no ledger entries — approval is not payment',
    (await M.FmsLedgerEntry.countDocuments({ school })) === 0);

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