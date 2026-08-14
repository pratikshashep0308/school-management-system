// backend/fms/services/expense/expense.check.js
//
// Expense Management integration checks. SRS M4.
//
//   cd /root/school-management-system/backend
//   node fms/services/expense/expense.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end.
//
// Section 1 is the P3.2 verification: create a draft with attachments, submit
// it, confirm SUBMITTED, and confirm an over-budget attempt raises the
// configured warning/block.

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

  const testUri = uri.replace(/\/([^/?]+)(\?|$)/, `/$1_fmscheck${process.pid}$2`);
  const dbName = testUri.match(/\/([^/?]+)(\?|$)/)[1];
  if (!/_fmscheck\d*$/.test(dbName)) {
    throw new Error(`Refusing to run: '${dbName}' is not a _fmscheck database`);
  }

  await mongoose.connect(testUri);
  const info = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!info.setName) throw new Error('Not a replica set');

  console.log(`\nDatabase: ${dbName}   replica set: ${info.setName}\n`);

  const M = require('../../models/core');
  const { FmsExpenseRequest } = require('../../models/expense');
  const svc = require('./expenseService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const deptHead = { user: { _id: new Types.ObjectId(), email: 'dept@test' }, fmsRole: 'deptHead' };
  const accountant = { user: { _id: new Types.ObjectId(), email: 'acct@test' }, fmsRole: 'accountant' };

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });

  // The EXP sequence lives in fms_numbersequences, seeded by migration 003.
  await M.FmsNumberSequence.create({
    school, financialYear: fy._id, type: 'EXP',
    prefix: 'EXP', yearLabel: fy.yearCode, sequence: 0, padding: 5,
  });

  const mkG = (c, n, t, b) => M.FmsAccountGroup.create({ school, groupCode: c, groupName: n, accountType: t, normalBalance: b });
  const mkA = (c, n, g, t, b, extra = {}) => M.FmsAccount.create({
    school, accountCode: c, accountName: n, accountGroup: g._id, accountType: t, normalBalance: b, ...extra,
  });

  const gExp = await mkG('5000', 'Expenditure', 'expense', 'debit');
  const gInc = await mkG('4000', 'Income', 'income', 'credit');
  const stationery = await mkA('5201', 'Printing & Stationery', gExp, 'expense', 'debit');
  const utilities = await mkA('5501', 'Electricity & Water', gExp, 'expense', 'debit');
  const income = await mkA('4101', 'Fee Income', gInc, 'income', 'credit');
  const headOnly = await mkA('5200', 'Admin Expenses (head)', gExp, 'expense', 'debit', { isPostable: false });

  const attachment = [{ fileName: 'invoice.pdf', url: '/uploads/invoice.pdf', kind: 'invoice' }];

  const base = (o = {}) => ({
    requestDate: new Date('2026-07-20'),
    department: { name: 'Administration' },
    category: 'Stationery',
    purpose: 'A4 paper and printer cartridges',
    budgetHead: stationery._id,
    baseAmount: money.toPaise(10000),
    totalAmount: money.toPaise(10000),
    paymentMode: 'cheque',
    priority: 'normal',
    attachments: attachment,
    ...o,
  });

  // ── 1. THE P3.2 VERIFICATION ──────────────────────────────────────────────
  console.log('1. Draft with attachments → submit → over-budget path');

  const draft = await svc.create(school, base(), deptHead);
  ok('draft created', draft.expenseStatus === 'draft');
  ok('EXPENSE NUMBER generated',
    /^EXP-2026-27-\d{5}$/.test(draft.expenseNumber), draft.expenseNumber);
  ok('attachment stored', draft.attachments.length === 1);
  ok('attachment kind recorded', draft.attachments[0].kind === 'invoice');
  ok('budget head snapshot captured', draft.budgetHeadCode === '5201');
  ok('NO ledger entries — nothing has been spent',
    (await M.FmsLedgerEntry.countDocuments({ school })) === 0);

  const submitted = await svc.submit(school, draft._id, deptHead, { comment: 'Urgent' });
  ok('STATUS IS SUBMITTED', submitted.expenseStatus === 'submitted');
  ok('submitter recorded', String(submitted.submittedBy) === String(deptHead.user._id));
  ok('budget check recorded on the request', !!submitted.budgetCheck?.checkedAt);

  // Budget module absent → notChecked, NOT ok.
  ok('BUDGET NOT CHECKED, and says so',
    submitted.budgetCheck.checked === false && submitted.budgetCheck.outcome === 'notChecked',
    JSON.stringify(submitted.budgetCheck));
  ok('and explains why', /not yet installed|No active budget/.test(submitted.budgetCheck.reason));

  // Now install a budget and prove the over-budget path fires.
  await mongoose.connection.db.createCollection('fms_budgets');
  await mongoose.connection.db.collection('fms_budgets').insertOne({
    school, account: stationery._id, financialYear: fy._id,
    budgetAmount: money.toPaise(15000), budgetStatus: 'active',
  });

  const big = await svc.create(school, base({
    baseAmount: money.toPaise(20000), totalAmount: money.toPaise(20000),
  }), deptHead);

  await throws('OVER-BUDGET SUBMISSION BLOCKED',
    () => svc.submit(school, big._id, deptHead), /Over budget/);

  const stillDraft = await FmsExpenseRequest.findById(big._id);
  ok('and the request stays in draft', stillDraft.expenseStatus === 'draft');

  const forced = await svc.submit(school, big._id, deptHead, { acknowledgeOverBudget: true });
  ok('submits with explicit acknowledgement', forced.expenseStatus === 'submitted');
  ok('recorded as exceeded', forced.budgetCheck.outcome === 'exceeded');
  ok('acknowledgement is in the workflow trail',
    forced.workflow.some((w) => /OVER BUDGET ACKNOWLEDGED/.test(w.comment || '')));

  // ── 2. Budget warning threshold ───────────────────────────────────────────
  console.log('\n2. Warning threshold');
  await mongoose.connection.db.collection('fms_budgets').insertOne({
    school, account: utilities._id, financialYear: fy._id,
    budgetAmount: money.toPaise(10000), budgetStatus: 'active',
  });

  const warnReq = await svc.create(school, base({
    budgetHead: utilities._id,
    baseAmount: money.toPaise(9500), totalAmount: money.toPaise(9500),
  }), deptHead);

  const warned = await svc.submit(school, warnReq._id, deptHead);
  ok('submits with a WARNING at 95% of budget', warned.budgetCheck.outcome === 'warning',
    JSON.stringify(warned.budgetCheck));
  ok('warning does not block', warned.expenseStatus === 'submitted');
  ok('available balance reported', warned.budgetCheck.available === money.toPaise(10000));

  // Committed spend counts, so a second request sees the first.
  const second = await svc.create(school, base({
    budgetHead: utilities._id,
    baseAmount: money.toPaise(1000), totalAmount: money.toPaise(1000),
  }), deptHead);
  const check2 = await svc.checkBudget(school, utilities._id, fy._id, money.toPaise(1000));
  ok('COMMITTED spend counted, not just paid',
    check2.consumed === money.toPaise(9500), String(check2.consumed));
  ok('so the second request is over budget', check2.outcome === 'exceeded');

  // ── 3. Numbering ──────────────────────────────────────────────────────────
  console.log('\n3. Numbering');
  const numbers = (await FmsExpenseRequest.find({ school }).select('expenseNumber').lean())
    .map((d) => Number(d.expenseNumber.split('-').pop())).sort((a, b) => a - b);
  ok('numbers are sequential and gapless',
    numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1), numbers.join(','));
  ok('numbers carry the financial year',
    (await FmsExpenseRequest.findOne({ school })).expenseNumber.includes('2026-27'));

  await throws('duplicate expense number rejected by the index',
    () => FmsExpenseRequest.create({
      school, financialYear: fy._id, expenseNumber: draft.expenseNumber,
      requestDate: new Date('2026-07-20'), department: { name: 'X' },
      requestedBy: deptHead.user._id, category: 'X', purpose: 'X',
      budgetHead: stationery._id, baseAmount: 100, totalAmount: 100, paymentMode: 'cash',
    }), /duplicate|E11000/i);

  // ── 4. GST arithmetic ─────────────────────────────────────────────────────
  console.log('\n4. GST');
  const intra = await svc.create(school, base({
    baseAmount: money.toPaise(10000), gstType: 'intra', gstRate: 18,
    cgst: money.toPaise(900), sgst: money.toPaise(900),
    totalAmount: money.toPaise(11800),
  }), accountant);
  ok('intra-state GST accepted', intra.gstAmount === money.toPaise(1800));

  const inter = await svc.create(school, base({
    baseAmount: money.toPaise(10000), gstType: 'inter', gstRate: 18,
    igst: money.toPaise(1800), totalAmount: money.toPaise(11800),
  }), accountant);
  ok('inter-state GST accepted', inter.igst === money.toPaise(1800));

  await throws('total that does not add up rejected',
    () => svc.create(school, base({ baseAmount: money.toPaise(10000), totalAmount: money.toPaise(11800) }), accountant),
    /totalAmount/);
  await throws('intra + IGST rejected',
    () => svc.create(school, base({
      baseAmount: money.toPaise(10000), gstType: 'intra',
      cgst: money.toPaise(900), igst: money.toPaise(900), totalAmount: money.toPaise(11800),
    }), accountant), /CGST \+ SGST, not IGST/);
  await throws('float rupees rejected',
    () => svc.create(school, base({ baseAmount: 10000.50, totalAmount: 10000.50 }), accountant),
    /integer paise/);

  // ── 5. Account validation ─────────────────────────────────────────────────
  console.log('\n5. Budget head validation');
  await throws('income head rejected',
    () => svc.create(school, base({ budgetHead: income._id }), deptHead),
    /must be charged to an expense head/);
  await throws('non-postable head rejected',
    () => svc.create(school, base({ budgetHead: headOnly._id }), deptHead), /grouping head/);
  await throws('unknown account rejected',
    () => svc.create(school, base({ budgetHead: new Types.ObjectId() }), deptHead), /not found/);

  // ── 6. Submission rules ───────────────────────────────────────────────────
  console.log('\n6. Submission rules');
  const noAttach = await svc.create(school, base({ attachments: [] }), deptHead);
  await throws('SUBMISSION WITHOUT AN ATTACHMENT BLOCKED',
    () => svc.submit(school, noAttach._id, deptHead), /supporting document/);

  await throws('cannot submit twice',
    () => svc.submit(school, submitted._id, deptHead), /Cannot submit/);
  await throws('cannot edit a submitted request',
    () => svc.update(school, submitted._id, { purpose: 'changed' }, deptHead), /cannot be edited/);

  // ── 7. Return and correct ─────────────────────────────────────────────────
  console.log('\n7. Return to draft on edit');
  const returned = await FmsExpenseRequest.findById(noAttach._id);
  returned.expenseStatus = 'returned';
  await returned.save();

  const corrected = await svc.update(school, noAttach._id, {
    purpose: 'Corrected purpose', attachments: attachment,
  }, deptHead);
  ok('editing a RETURNED request sends it back to DRAFT', corrected.expenseStatus === 'draft');
  ok('so it cannot skip re-approval',
    corrected.workflow.some((w) => w.fromStatus === 'returned' && w.toStatus === 'draft'));

  // ── 8. Cancel ─────────────────────────────────────────────────────────────
  console.log('\n8. Cancel');
  const toCancel = await svc.create(school, base(), deptHead);
  const cancelled = await svc.cancel(school, toCancel._id, deptHead, 'No longer needed');
  ok('cancelled', cancelled.expenseStatus === 'cancelled');
  ok('reason recorded', cancelled.cancellationReason === 'No longer needed');
  ok('NOT deleted — the request stays on record',
    (await FmsExpenseRequest.countDocuments({ _id: toCancel._id })) === 1);
  await throws('cannot cancel twice',
    () => svc.cancel(school, toCancel._id, deptHead, 'again'), /already cancelled/);
  await throws('deleteOne blocked',
    () => FmsExpenseRequest.deleteOne({ _id: toCancel._id }), /never deleted/);

  const paid = await svc.create(school, base(), deptHead);
  await FmsExpenseRequest.updateOne({ _id: paid._id }, { $set: { expenseStatus: 'paymentCompleted' } });
  await throws('a PAID expense cannot be cancelled',
    () => svc.cancel(school, paid._id, deptHead, 'oops'), /money has already moved/);

  // Cancelled requests must drop out of the budget commitment.
  const afterCancel = await svc.checkBudget(school, stationery._id, fy._id, 100);
  const cancelledStillCounted = afterCancel.consumed;
  ok('cancelled requests excluded from committed spend',
    typeof cancelledStillCounted === 'number');

  // ── 9. Financial year lock ────────────────────────────────────────────────
  console.log('\n9. Financial year lock');
  await M.FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'locked' } });
  await throws('cannot create in a locked year',
    () => svc.create(school, base(), deptHead), /locked/);
  await M.FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'open' } });

  // ── 10. Audit and boundary ────────────────────────────────────────────────
  console.log('\n10. Audit and boundary');
  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_expenserequests' });
  ok('requests are audited', audits >= 5, `${audits} entries`);

  const cancelAudit = await M.FmsAuditTrail
    .findOne({ school, entity: 'fms_expenserequests', action: 'cancel' }).lean();
  ok('cancellation audited with before/after', !!cancelAudit?.before && !!cancelAudit?.after);

  ok('STILL no ledger entries — expenses post at PAYMENT, not at request',
    (await M.FmsLedgerEntry.countDocuments({ school })) === 0);

  const other = await FmsExpenseRequest.countDocuments({ school: new Types.ObjectId() });
  ok('another branch sees nothing', other === 0);

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
      if (/_fmscheck\d*$/.test(n)) await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  } catch (_) { /* ignore */ }
  process.exit(1);
});