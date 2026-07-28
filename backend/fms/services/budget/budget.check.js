// backend/fms/services/budget/budget.check.js
//
// Budget Management integration checks. SRS M6.
//
//   cd /root/school-management-system/backend
//   node fms/services/budget/budget.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end.
//
// Section 1 is the P4.1 verification: set a budget, post expenses beyond it,
// confirm Budget vs Actual reflects the spend and the over-budget control fires.

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
    ok(name, !match || match.test(text), text.slice(0, 150));
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
  const { FmsBudget } = require('../../models/budget');
  const { FmsExpenseRequest } = require('../../models/expense');
  const svc = require('./budgetService');
  const expenseSvc = require('../expense/expenseService');
  const approvalSvc = require('../approval/approvalService');
  const paymentSvc = require('../payment/paymentService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const who = (email, role) => ({ user: { _id: new Types.ObjectId(), email }, fmsRole: role });
  const requester = who('req@test', 'deptHead');
  const accountant = who('acct@test', 'accountant');
  const deptHead = who('dept@test', 'deptHead');
  const principal = who('principal@test', 'principal');
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

  const mkG = (c, n, t, b) => M.FmsAccountGroup.create({ school, groupCode: c, groupName: n, accountType: t, normalBalance: b });
  const mkA = (c, n, g, t, b, extra = {}) => M.FmsAccount.create({
    school, accountCode: c, accountName: n, accountGroup: g._id, accountType: t, normalBalance: b, ...extra,
  });

  const gAsset = await mkG('1000', 'Assets', 'asset', 'debit');
  const gExp = await mkG('5000', 'Expenditure', 'expense', 'debit');
  const gInc = await mkG('4000', 'Income', 'income', 'credit');
  const bank = await mkA('1201', 'Bank', gAsset, 'asset', 'debit', { isBankAccount: true });
  const stationery = await mkA('5201', 'Printing & Stationery', gExp, 'expense', 'debit');
  const utilities = await mkA('5501', 'Electricity & Water', gExp, 'expense', 'debit');
  const income = await mkA('4101', 'Fee Income', gInc, 'income', 'credit');
  const headOnly = await mkA('5200', 'Admin (head)', gExp, 'expense', 'debit', { isPostable: false });

  const attachment = [{ fileName: 'inv.pdf', url: '/u/inv.pdf', kind: 'invoice' }];

  const raise = async (rupees, head = stationery, dept = 'Administration') => {
    const amt = money.toPaise(rupees);
    const e = await expenseSvc.create(school, {
      requestDate: new Date('2026-07-20'),
      department: { name: dept },
      category: 'Supplies', purpose: `₹${rupees} of supplies`,
      budgetHead: head._id,
      baseAmount: amt, totalAmount: amt,
      paymentMode: 'cheque', attachments: attachment,
    }, requester);
    return e;
  };

  /**
   * Walk the approval chain to completion, whatever tier the amount falls into.
   *
   * Hardcoding an approver here would silently break the moment a test used an
   * amount above ₹10,000 — which is exactly what happened the first time this
   * check ran. Resolve the required step instead.
   */
  const actorFor = { accounts: accountant, deptHead, principal, chairman: principal, trustee: principal };

  const approveAndPay = async (expenseId) => {
    for (let guard = 0; guard < 6; guard++) {
      const e = await FmsExpenseRequest.findById(expenseId);
      const pos = await approvalSvc.position(school, e);
      if (pos.next.done || !pos.next.step || pos.next.step === 'payment') break;

      const actor = actorFor[pos.next.step];
      // chairman/trustee steps need a role that may act there
      const asRole = ['chairman', 'trustee'].includes(pos.next.step)
        ? { user: actor.user, fmsRole: 'chairman' }
        : actor;

      await approvalSvc.act(school, expenseId,
        { action: pos.next.step === 'accounts' ? 'verify' : 'approve', step: pos.next.step }, asRole);
    }

    return paymentSvc.pay(school, expenseId, {
      paymentMode: 'cheque', instrumentNumber: `CHQ${Math.random().toString().slice(2, 8)}`,
    }, cashier);
  };

  // ── 1. THE P4.1 VERIFICATION ──────────────────────────────────────────────
  console.log('1. Set a budget, spend past it, watch the control fire');

  const budget = await svc.create(school, {
    financialYear: fy._id, account: stationery._id,
    budgetAmount: money.toPaise(20000),
  }, principal);
  ok('budget created as draft', budget.budgetStatus === 'draft');

  // A draft budget is not consulted — only a live one is.
  const e0 = await raise(5000);
  const sub0 = await expenseSvc.submit(school, e0._id, requester, {});
  ok('a DRAFT budget is not consulted',
    sub0.budgetCheck.checked === false, JSON.stringify(sub0.budgetCheck));

  await svc.activate(school, budget._id, principal);
  ok('activated', (await FmsBudget.findById(budget._id)).budgetStatus === 'active');

  // Now spend against it and watch actual roll up from real postings.
  const e1 = await raise(8000);
  await expenseSvc.submit(school, e1._id, requester, {});
  await approveAndPay(e1._id);

  const pos1 = await svc.position(await FmsBudget.findById(budget._id));
  ok('ACTUAL ROLLS UP FROM REAL POSTINGS',
    pos1.actual === money.toPaise(8000), String(pos1.actual));
  ok('actual counts the ledger entry', pos1.actualEntries === 1);
  ok('available reduced', pos1.available === money.toPaise(12000) - money.toPaise(5000),
    String(pos1.available));

  // e0 is still submitted-not-paid, so it is COMMITTED, not actual.
  ok('an unpaid approved request is COMMITTED, not actual',
    pos1.committed === money.toPaise(5000), String(pos1.committed));
  ok('consumed = actual + committed',
    pos1.consumed === money.toPaise(13000), String(pos1.consumed));

  // THE double-counting trap.
  ok('A PAID EXPENSE IS NOT COUNTED TWICE',
    pos1.consumed === pos1.actual + pos1.committed &&
    pos1.consumed === money.toPaise(13000));

  // Now go over.
  const e2 = await raise(10000);
  await throws('OVER-BUDGET SUBMISSION BLOCKED',
    () => expenseSvc.submit(school, e2._id, requester, {}), /Over budget/);

  const stillDraft = await FmsExpenseRequest.findById(e2._id);
  ok('and the request stays in draft', stillDraft.expenseStatus === 'draft');

  const forced = await expenseSvc.submit(school, e2._id, requester, { acknowledgeOverBudget: true });
  ok('acknowledgement lets it through', forced.expenseStatus === 'submitted');
  ok('recorded as exceeded', forced.budgetCheck.outcome === 'exceeded');

  const vsActual = await svc.budgetVsActual(school, fy._id);
  const line = vsActual.lines.find((l) => l.accountCode === '5201');
  ok('BUDGET VS ACTUAL REFLECTS THE SPEND',
    line.actual === money.toPaise(8000) && line.consumed === money.toPaise(23000),
    JSON.stringify({ actual: line.actual, consumed: line.consumed }));
  ok('and shows the head as over budget', line.isOverBudget === true);
  ok('totals count over-budget heads', vsActual.totals.overBudgetHeads === 1);

  // ── 2. Warning threshold ──────────────────────────────────────────────────
  console.log('\n2. Warning threshold');
  const utilBudget = await svc.create(school, {
    financialYear: fy._id, account: utilities._id,
    budgetAmount: money.toPaise(10000), warnThreshold: 0.9,
  }, principal);
  await svc.activate(school, utilBudget._id, principal);

  const w1 = await raise(8000, utilities);
  const warned = await expenseSvc.submit(school, w1._id, requester, {});
  ok('80% of budget does not warn', warned.budgetCheck.outcome === 'ok',
    JSON.stringify(warned.budgetCheck));

  const w2 = await raise(1500, utilities);
  const warned2 = await expenseSvc.submit(school, w2._id, requester, {});
  ok('95% of budget WARNS but does not block', warned2.budgetCheck.outcome === 'warning');
  ok('the request still goes through', warned2.expenseStatus === 'submitted');

  // ── 3. The 'warn' policy lets over-budget through ─────────────────────────
  console.log('\n3. Over-budget policy');
  const soft = await mkA('5299', 'Other Expenses', gExp, 'expense', 'debit');
  const softBudget = await svc.create(school, {
    financialYear: fy._id, account: soft._id,
    budgetAmount: money.toPaise(1000), overBudgetPolicy: 'warn',
  }, principal);
  await svc.activate(school, softBudget._id, principal);

  const s1 = await raise(5000, soft);
  const softSubmit = await expenseSvc.submit(school, s1._id, requester, {});
  ok("a 'warn' policy lets an over-budget request through WITHOUT acknowledgement",
    softSubmit.expenseStatus === 'submitted');
  ok('but it is still recorded as exceeded', softSubmit.budgetCheck.outcome === 'exceeded');
  ok('and the policy is on the record', softSubmit.budgetCheck.policy === 'warn');

  // ── 4. Revision (SCR-24) ──────────────────────────────────────────────────
  console.log('\n4. Revision');
  await throws('revision without a reason blocked',
    () => svc.revise(school, budget._id, { newAmount: money.toPaise(30000), reason: '' }, principal),
    /reason/);
  await throws('revising to the same amount blocked',
    () => svc.revise(school, budget._id, { newAmount: money.toPaise(20000), reason: 'x' }, principal),
    /same as the current/);

  const revised = await svc.revise(school, budget._id, {
    newAmount: money.toPaise(30000), reason: 'Additional allocation approved by the trust',
  }, principal);

  ok('revised', revised.budget.budgetStatus === 'revised');
  ok('THE ORIGINAL ALLOCATION IS PRESERVED',
    revised.budget.budgetAmount === money.toPaise(20000), String(revised.budget.budgetAmount));
  ok('the revision is what now applies', revised.budget.revisedBudget === money.toPaise(30000));
  ok('the revision is recorded with its reason',
    revised.budget.revisions[0].reason.includes('trust'));
  ok('and its delta', revised.budget.revisions[0].delta === money.toPaise(10000));

  const posAfter = await svc.position(await FmsBudget.findById(budget._id));
  ok('the effective budget is the revision', posAfter.effectiveBudget === money.toPaise(30000));
  ok('and the head is no longer over budget', posAfter.isOverBudget === false);

  // Revising BELOW what is already spent is allowed but flagged.
  const down = await svc.revise(school, budget._id, {
    newAmount: money.toPaise(5000), reason: 'Reallocated to salaries',
  }, principal);
  ok('revising below the consumed amount is allowed', !!down.budget);
  ok('but returns a WARNING', !!down.warning && /over budget/.test(down.warning), down.warning);
  ok('two revisions recorded', down.budget.revisions.length === 2);

  // ── 5. Budget head validation ─────────────────────────────────────────────
  console.log('\n5. Budget head validation');
  await throws('an income head cannot be budgeted',
    () => svc.create(school, { financialYear: fy._id, account: income._id, budgetAmount: 100 }, principal),
    /only expenditure is budgeted/);
  await throws('a non-postable head cannot be budgeted',
    () => svc.create(school, { financialYear: fy._id, account: headOnly._id, budgetAmount: 100 }, principal),
    /grouping head/);
  await throws('a duplicate budget is rejected',
    () => svc.create(school, { financialYear: fy._id, account: stationery._id, budgetAmount: 100 }, principal),
    /already exists/);
  await throws('float rupees rejected',
    () => svc.create(school, { financialYear: fy._id, account: soft._id, budgetAmount: 100.5 }, principal),
    /integer/);

  // ── 6. Status rules ───────────────────────────────────────────────────────
  console.log('\n6. Status rules');
  const draftB = await svc.create(school, {
    financialYear: fy._id, account: soft._id,
    budgetAmount: money.toPaise(500), department: { name: 'Science' },
  }, principal);

  const edited = await svc.update(school, draftB._id, { budgetAmount: money.toPaise(700) }, principal);
  ok('a draft can be edited', edited.budgetAmount === money.toPaise(700));

  await svc.activate(school, draftB._id, principal);
  await throws('a LIVE budget cannot be edited — it must be revised',
    () => svc.update(school, draftB._id, { budgetAmount: 100 }, principal), /cannot be edited/);
  await throws('cannot activate twice',
    () => svc.activate(school, draftB._id, principal), /Only a draft/);

  const closedB = await svc.close(school, draftB._id, principal);
  ok('closed', closedB.budgetStatus === 'closed');
  await throws('cannot revise a closed budget',
    () => svc.revise(school, draftB._id, { newAmount: 100, reason: 'x' }, principal), /Only a live/);
  await throws('budgets are never deleted',
    () => FmsBudget.deleteOne({ _id: draftB._id }), /never deleted/);

  // ── 7. Department-specific budgets ────────────────────────────────────────
  console.log('\n7. Department scope');
  const deptBudget = await svc.create(school, {
    financialYear: fy._id, account: utilities._id,
    budgetAmount: money.toPaise(3000), department: { name: 'Science' },
  }, principal);
  await svc.activate(school, deptBudget._id, principal);

  const deptCheck = await svc.checkAvailability(
    school, utilities._id, fy._id, money.toPaise(100), 'Science'
  );
  ok('a department budget takes precedence over the school-wide one',
    deptCheck.budgetAmount === money.toPaise(3000), String(deptCheck.budgetAmount));

  const generalCheck = await svc.checkAvailability(
    school, utilities._id, fy._id, money.toPaise(100), 'Administration'
  );
  ok('another department falls back to the school-wide budget',
    generalCheck.budgetAmount === money.toPaise(10000), String(generalCheck.budgetAmount));

  // ── 8. Unbudgeted heads ───────────────────────────────────────────────────
  console.log('\n8. Unbudgeted heads');
  const noBudget = await mkA('5301', 'Teaching Materials', gExp, 'expense', 'debit');
  const nb = await svc.checkAvailability(school, noBudget._id, fy._id, money.toPaise(1000));
  ok('an unbudgeted head reports checked:false, NOT ok', nb.checked === false && nb.outcome === 'notChecked');
  ok('and says why', /No active budget/.test(nb.reason));

  const nbExpense = await raise(1000, noBudget);
  const nbSub = await expenseSvc.submit(school, nbExpense._id, requester, {});
  ok('an unbudgeted request submits without being blocked',
    nbSub.expenseStatus === 'submitted');
  ok('but the record shows nobody looked', nbSub.budgetCheck.checked === false);

  // ── 9. A reversal releases budget ─────────────────────────────────────────
  console.log('\n9. Reversal releases budget');
  const relBudget = await svc.create(school, {
    financialYear: fy._id, account: noBudget._id, budgetAmount: money.toPaise(50000),
  }, principal);
  await svc.activate(school, relBudget._id, principal);

  const rel = await raise(20000, noBudget);
  await expenseSvc.submit(school, rel._id, requester, {});
  const relPay = await approveAndPay(rel._id);

  const beforeFail = await svc.position(await FmsBudget.findById(relBudget._id));
  ok('the payment consumed budget', beforeFail.actual === money.toPaise(20000));

  await paymentSvc.fail(school, relPay.payment._id, principal, 'Cheque bounced');

  const afterFail = await svc.position(await FmsBudget.findById(relBudget._id));
  ok('A REVERSED PAYMENT RELEASES THE BUDGET',
    afterFail.actual === 0, String(afterFail.actual));
  ok('but it returns as committed, since the expense is payable again',
    afterFail.committed === money.toPaise(20000), String(afterFail.committed));

  // ── 10. Nothing is double-stored ──────────────────────────────────────────
  console.log('\n10. Derived, not stored');
  const raw = await FmsBudget.findById(budget._id).lean();
  ok('no actualSpending field is stored', raw.actualSpending === undefined);
  ok('no availableBalance field is stored', raw.availableBalance === undefined);
  ok('only the allowance is stored',
    raw.budgetAmount !== undefined && raw.revisedBudget !== undefined);

  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_budgets' });
  ok('budget changes are audited', audits >= 5, `${audits} entries`);

  const revAudit = await M.FmsAuditTrail
    .findOne({ school, entity: 'fms_budgets', action: 'update' }).lean();
  ok('revisions audited with before/after', !!revAudit?.before && !!revAudit?.after);

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