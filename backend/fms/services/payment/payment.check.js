// backend/fms/services/payment/payment.check.js
//
// Payment processing integration checks. BPMN WF3.
//
//   cd /root/school-management-system/backend
//   node fms/services/payment/payment.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end.
//
// Section 1 is the P3.4 verification: pay an approved expense; confirm the GL
// posting, status CLOSED, and that a second pay attempt is rejected.

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
  const { FmsExpenseRequest } = require('../../models/expense');
  const { FmsPaymentVoucher } = require('../../models/payment');
  const expenseSvc = require('../expense/expenseService');
  const approvalSvc = require('../approval/approvalService');
  const svc = require('./paymentService');
  const gl = require('../ledger/ledgerQueryService');
  const bookSvc = require('../cashBankBook/bookService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const who = (email, role) => ({ user: { _id: new Types.ObjectId(), email }, fmsRole: role });
  const requester = who('req@test', 'deptHead');
  const accountant = who('acct@test', 'accountant');
  const deptHead = who('dept@test', 'deptHead');
  const cashier = who('cashier@test', 'cashier');
  const manager = who('mgr@test', 'accountsManager');

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
  const cash = await mkA('1101', 'Cash in Hand', gAsset, 'asset', 'debit', { isCashAccount: true });
  const bank = await mkA('1201', 'Bank — Current', gAsset, 'asset', 'debit', { isBankAccount: true });
  const stationery = await mkA('5201', 'Printing & Stationery', gExp, 'expense', 'debit');

  const attachment = [{ fileName: 'inv.pdf', url: '/u/inv.pdf', kind: 'invoice' }];

  /** Raise an expense and push it all the way to paymentPending. */
  async function approved(rupees) {
    const amt = money.toPaise(rupees);
    const e = await expenseSvc.create(school, {
      requestDate: new Date('2026-07-20'),
      department: { name: 'Administration' },
      vendor: { name: 'Sharma Stationers' },
      category: 'Stationery',
      purpose: `Supplies worth ₹${rupees}`,
      budgetHead: stationery._id,
      baseAmount: amt, totalAmount: amt,
      paymentMode: 'cheque',
      attachments: attachment,
    }, requester);
    await expenseSvc.submit(school, e._id, requester, {});
    await approvalSvc.act(school, e._id, { action: 'verify', step: 'accounts' }, accountant);
    await approvalSvc.act(school, e._id, { action: 'approve', step: 'deptHead' }, deptHead);
    return FmsExpenseRequest.findById(e._id);
  }

  // ── 1. THE P3.4 VERIFICATION ──────────────────────────────────────────────
  console.log('1. Pay an approved expense');

  const e1 = await approved(9000);
  ok('expense is at paymentPending', e1.expenseStatus === 'paymentPending');
  ok('no ledger entries before payment',
    (await M.FmsLedgerEntry.countDocuments({ school })) === 0);

  const p1 = await svc.pay(school, e1._id, {
    paymentMode: 'cheque', instrumentNumber: '004521', bankName: 'SBI',
  }, cashier);

  ok('payment voucher created', !!p1.payment);
  ok('payment number allocated',
    /^PMT-2026-27-\d{5}$/.test(p1.payment.paymentNumber), p1.payment.paymentNumber);
  ok('ONE number — payment number IS the voucher number',
    p1.payment.paymentNumber === p1.voucher.voucherNumber);
  ok('status paid', p1.payment.paymentStatus === 'paid');
  ok('EXPENSE MOVES TO paymentCompleted', p1.expense.expenseStatus === 'paymentCompleted');

  const posted = await gl.voucherDetail(school, p1.voucher._id);
  ok('GL POSTING BALANCES', posted.totals.balanced, JSON.stringify(posted.totals));
  ok('Dr the expense head',
    posted.lines.find((l) => l.accountCode === '5201')?.debit === money.toPaise(9000));
  ok('Cr the bank', posted.lines.find((l) => l.accountCode === '1201')?.credit === money.toPaise(9000));
  ok('payee recorded on the ledger lines',
    posted.lines.every((l) => l.partyName === 'Sharma Stationers'));

  // The core requirement: paying twice must be impossible.
  await throws('SECOND PAYMENT ATTEMPT REJECTED',
    () => svc.pay(school, e1._id, { paymentMode: 'cash' }, cashier),
    /already been paid|already has a live payment|fully approved/);

  ok('still exactly one payment for this expense',
    (await FmsPaymentVoucher.countDocuments({ school, expenseRequest: e1._id })) === 1);
  ok('and one ledger voucher',
    (await M.FmsVoucher.countDocuments({ school, voucherType: 'payment' })) === 1);

  const closed = await svc.close(school, e1._id, manager);
  ok('EXPENSE REACHES closed', closed.expenseStatus === 'closed');
  await throws('cannot close twice', () => svc.close(school, e1._id, manager), /Only a paid/);

  // ── 2. The database enforces it, not just the status check ────────────────
  console.log('\n2. Idempotency is a database property');
  const e2 = await approved(5000);

  // Fire five concurrent payments. Exactly one must survive.
  const settled = await Promise.allSettled([
    svc.pay(school, e2._id, { paymentMode: 'cash' }, cashier),
    svc.pay(school, e2._id, { paymentMode: 'cash' }, cashier),
    svc.pay(school, e2._id, { paymentMode: 'cash' }, cashier),
    svc.pay(school, e2._id, { paymentMode: 'cash' }, cashier),
    svc.pay(school, e2._id, { paymentMode: 'cash' }, cashier),
  ]);
  const succeeded = settled.filter((s) => s.status === 'fulfilled').length;

  const live = await FmsPaymentVoucher.countDocuments({ school, expenseRequest: e2._id, isLive: true });
  ok('5 CONCURRENT PAYMENTS PRODUCE EXACTLY 1', live === 1,
    `live=${live} fulfilled=${succeeded}`);

  const paidVouchers = await M.FmsVoucher.countDocuments({
    school, voucherType: 'payment', reversalOf: null,
  });
  ok('and only one payment voucher hit the ledger', paidVouchers === 2, String(paidVouchers));

  // ── 3. Cannot pay an unapproved expense ───────────────────────────────────
  console.log('\n3. Approval is required');
  const draft = await expenseSvc.create(school, {
    requestDate: new Date('2026-07-20'),
    department: { name: 'Admin' }, category: 'Misc', purpose: 'Unapproved',
    budgetHead: stationery._id,
    baseAmount: money.toPaise(1000), totalAmount: money.toPaise(1000),
    paymentMode: 'cash', attachments: attachment,
  }, requester);

  await throws('a DRAFT cannot be paid',
    () => svc.pay(school, draft._id, { paymentMode: 'cash' }, cashier), /fully approved/);

  await expenseSvc.submit(school, draft._id, requester, {});
  await throws('a SUBMITTED but unapproved expense cannot be paid',
    () => svc.pay(school, draft._id, { paymentMode: 'cash' }, cashier), /fully approved/);

  await approvalSvc.act(school, draft._id, { action: 'verify', step: 'accounts' }, accountant);
  await throws('verified but not approved cannot be paid',
    () => svc.pay(school, draft._id, { paymentMode: 'cash' }, cashier), /fully approved/);

  ok('no ledger entries from any blocked attempt',
    (await M.FmsVoucher.countDocuments({ school, voucherType: 'payment' })) === 2);

  // ── 4. Instruments ────────────────────────────────────────────────────────
  console.log('\n4. Instruments');
  const e4 = await approved(7000);
  await throws('a cheque without an instrument number rejected',
    () => svc.pay(school, e4._id, { paymentMode: 'cheque' }, cashier), /instrumentNumber/);

  const chq = await svc.pay(school, e4._id, {
    paymentMode: 'cheque', instrumentNumber: '004522', bankName: 'SBI',
  }, cashier);
  ok('cheque payment recorded', chq.payment.instrumentNumber === '004522');
  ok('cheque draws from the bank', chq.payment.creditAccountCode === '1201');

  const e4b = await approved(500);
  const cashPay = await svc.pay(school, e4b._id, { paymentMode: 'cash' }, cashier);
  ok('cash payment draws from cash', cashPay.payment.creditAccountCode === '1101');

  // ── 5. Cheque printing (SCR-40) ───────────────────────────────────────────
  console.log('\n5. Cheque printing');
  const html = svc.renderCheque(chq.payment.toObject());
  ok('CHEQUE OUTPUT PRODUCED', html.includes('<html'));
  ok('shows the payee', html.includes('Sharma Stationers'));
  ok('shows the amount in figures', html.includes('7,000.00'));
  ok('shows the amount in words', html.includes('Seven Thousand Rupees Only'));
  ok('marked A/C payee', html.includes('A/C PAYEE ONLY'));
  ok('sized for a cheque leaf', html.includes('202mm'));
  ok('date rendered as separated digits', /\d{8}/.test(html));

  const escaped = svc.renderCheque({
    ...chq.payment.toObject(), payeeName: '<script>alert(1)</script>',
  });
  ok('payee name is escaped', !escaped.includes('<script>alert(1)</script>'));

  // ── 6. Failed payment ─────────────────────────────────────────────────────
  console.log('\n6. Failed payment (bounced cheque)');
  const beforeFail = await gl.trialBalance(school);

  await throws('failing without a reason blocked',
    () => svc.fail(school, chq.payment._id, manager, ''), /reason/);

  const failed = await svc.fail(school, chq.payment._id, manager, 'Cheque returned — insufficient funds');
  ok('marked failed', failed.payment.paymentStatus === 'failed');
  ok('REVERSAL POSTED', !!failed.reversal.voucherNumber);
  ok('reason recorded', /insufficient funds/.test(failed.payment.failureReason));
  ok('expense returns to paymentPending', failed.expense.expenseStatus === 'paymentPending');

  const afterFail = await gl.trialBalance(school);
  ok('trial balance still balances', afterFail.totals.balanced);
  ok('reversal ADDS entries, never removes',
    afterFail.totals.totalDebit > beforeFail.totals.totalDebit);

  // The failed payment frees the expense for a retry.
  const retry = await svc.pay(school, e4._id, {
    paymentMode: 'neft', bankReference: 'NEFT99881',
  }, cashier);
  ok('THE EXPENSE CAN BE PAID AGAIN after a failure',
    retry.payment.paymentStatus === 'paid');
  ok('the failed voucher stays on record',
    (await FmsPaymentVoucher.countDocuments({ school, expenseRequest: e4._id })) === 2);
  ok('but only one is live',
    (await FmsPaymentVoucher.countDocuments({ school, expenseRequest: e4._id, isLive: true })) === 1);

  await throws('cannot fail the same payment twice',
    () => svc.fail(school, chq.payment._id, manager, 'again'), /already marked failed/);

  // ── 7. Payment queue (SCR-53) ─────────────────────────────────────────────
  console.log('\n7. Payment queue');
  const waiting = await approved(3000);
  const q = await svc.queue(school);
  ok('the approved expense is in the queue',
    q.items.some((i) => String(i._id) === String(waiting._id)));
  ok('a paid expense is not', !q.items.some((i) => String(i._id) === String(e1._id)));
  ok('the queue reports a total', q.totalAmount >= money.toPaise(3000));

  // ── 8. Books agree ────────────────────────────────────────────────────────
  console.log('\n8. Books agree');
  const tb = await gl.trialBalance(school);
  const cashTb = tb.lines.find((l) => l.accountCode === '1101');
  const cashBook = await bookSvc.book(school, {
    bookType: 'cash', from: '2026-04-01', to: '2027-03-31',
  });
  ok('CASH BOOK = TRIAL BALANCE FOR CASH',
    cashBook.closingBalance === cashTb.balance,
    `book=${cashBook.closingBalance} tb=${cashTb.balance}`);

  const expTb = tb.lines.find((l) => l.accountCode === '5201');
  ok('expense head shows as Dr', expTb.drCr === 'Dr');
  ok('FINAL: debits = credits', tb.totals.balanced, JSON.stringify(tb.totals));

  // ── 9. Guards and audit ───────────────────────────────────────────────────
  console.log('\n9. Guards and audit');
  await throws('a future payment date rejected',
    () => svc.pay(school, waiting._id, { paymentMode: 'cash', paymentDate: new Date('2099-01-01') }, cashier),
    /future|no financial year/);

  await M.FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'locked' } });
  await throws('cannot pay into a locked year',
    () => svc.pay(school, waiting._id, { paymentMode: 'cash' }, cashier), /locked/);
  await M.FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'open' } });

  await throws('payments are never deleted',
    () => FmsPaymentVoucher.deleteOne({ _id: p1.payment._id }), /never deleted/);

  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_paymentvouchers' });
  ok('payments are audited', audits >= 3, `${audits} entries`);

  const failAudit = await M.FmsAuditTrail
    .findOne({ school, entity: 'fms_paymentvouchers', action: 'reverse' }).lean();
  ok('failure audited with before/after', !!failAudit?.before && !!failAudit?.after);

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