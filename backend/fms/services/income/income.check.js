// backend/fms/services/income/income.check.js
//
// Income Management integration checks. SRS M3.
//
//   cd /root/school-management-system/backend
//   node fms/services/income/income.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end.
//
// Section 1 is the P3.1 verification: record an income voucher; confirm the
// receipt output, that the GL posting balances, and that cancelling posts a
// reversal.

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
  const { FmsIncomeVoucher } = require('../../models/income');
  const svc = require('./incomeService');
  const gl = require('../ledger/ledgerQueryService');
  const bookSvc = require('../cashBankBook/bookService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const cashier = { user: { _id: new Types.ObjectId(), email: 'cashier@test' }, fmsRole: 'cashier' };
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
  const gInc = await mkG('4000', 'Income', 'income', 'credit');
  const gExp = await mkG('5000', 'Expenditure', 'expense', 'debit');

  const cash = await mkA('1101', 'Cash in Hand', gAsset, 'asset', 'debit', { isCashAccount: true });
  const bank = await mkA('1201', 'Bank — Current', gAsset, 'asset', 'debit', { isBankAccount: true });
  const clearing = await mkA('1202', 'Bank — Online Collections', gAsset, 'asset', 'debit');
  const tuition = await mkA('4101', 'Tuition Fee Income', gInc, 'income', 'credit');
  const donation = await mkA('4201', 'Donations', gInc, 'income', 'credit');
  const salary = await mkA('5101', 'Salary Expense', gExp, 'expense', 'debit');
  const headOnly = await mkA('4100', 'Fee Income (head)', gInc, 'income', 'credit', { isPostable: false });

  const amt = money.toPaise(12500);
  const base = () => ({
    receiptDate: new Date('2026-07-15'),
    category: 'studentFee',
    amount: amt,
    paymentMode: 'cash',
    creditAccount: tuition._id,
    payerName: 'Aarav Sharma',
    payerType: 'student',
    admissionNumber: 'ADM-2026-0042',
    className: '4th Standard',
  });

  // ── 1. THE P3.1 VERIFICATION ──────────────────────────────────────────────
  console.log('1. Record → receipt → GL → cancel reverses');

  const r = await svc.record(school, base(), cashier);
  ok('receipt created', !!r.income);
  ok('receipt number allocated',
    /^INC-2026-27-\d{5}$/.test(r.income.receiptNumber), r.income.receiptNumber);
  ok('ONE number — receipt number IS the voucher number',
    r.income.receiptNumber === r.voucher.voucherNumber);
  ok('status posted, no draft state', r.income.incomeStatus === 'posted');
  ok('two ledger entries', r.entries.length === 2);

  const posted = await gl.voucherDetail(school, r.voucher._id);
  ok('GL POSTING BALANCES', posted.totals.balanced, JSON.stringify(posted.totals));
  ok('Dr cash', posted.lines.find((l) => l.accountCode === '1101')?.debit === amt);
  ok('Cr tuition income', posted.lines.find((l) => l.accountCode === '4101')?.credit === amt);
  ok('payer name on the ledger lines',
    posted.lines.every((l) => l.partyName === 'Aarav Sharma'));

  // Receipt output
  const html = svc.renderReceipt(r.income.toObject(), { name: 'The Future Step School' });
  ok('RECEIPT RENDERS', html.includes(r.income.receiptNumber));
  ok('receipt shows the amount', html.includes('12,500.00'));
  ok('receipt shows the amount in words',
    html.includes('Twelve Thousand Five Hundred Rupees Only'));
  ok('receipt shows the payer', html.includes('Aarav Sharma'));
  ok('receipt is printable (print CSS)', html.includes('@media print'));
  ok('no CANCELLED watermark while posted', !html.includes('class="void"'));

  // Cancel → reverses
  const before = await gl.trialBalance(school);
  const c = await svc.cancel(school, r.income._id, manager, 'Paid twice by mistake');

  ok('status cancelled', c.income.incomeStatus === 'cancelled');
  ok('CANCEL POSTED A REVERSAL', !!c.reversal.voucherNumber, c.reversal.voucherNumber);
  ok('reason recorded', c.income.cancellationReason === 'Paid twice by mistake');

  const after = await gl.trialBalance(school);
  ok('trial balance still balances', after.totals.balanced);
  ok('reversal ADDS entries, never removes',
    after.totals.totalDebit > before.totals.totalDebit);
  ok('cash back to zero',
    after.lines.find((l) => l.accountCode === '1101').balance === 0);

  const origLines = await gl.entries(school, { voucher: String(r.voucher._id) }, { skip: 0, limit: 10, sort: {} });
  ok('ORIGINAL ledger entries untouched', origLines.total === 2);

  const cancelledHtml = svc.renderReceipt(
    (await FmsIncomeVoucher.findById(r.income._id)).toObject(), {}
  );
  ok('cancelled receipt shows a CANCELLED watermark', cancelledHtml.includes('CANCELLED'));
  ok('and explains why', cancelledHtml.includes('Paid twice by mistake'));

  // ── 2. Receipts are never deleted or edited ───────────────────────────────
  console.log('\n2. Immutability');
  await throws('cannot cancel twice',
    () => svc.cancel(school, r.income._id, manager, 'again'), /already cancelled/);
  await throws('deleteOne blocked',
    () => FmsIncomeVoucher.deleteOne({ _id: r.income._id }), /never deleted/);
  await throws('deleteMany blocked',
    () => FmsIncomeVoucher.deleteMany({ school }), /never deleted/);
  await throws('bulk edit of the amount blocked',
    () => FmsIncomeVoucher.updateOne({ _id: r.income._id }, { $set: { amount: 1 } }),
    /cannot be edited/);
  ok('the record survives everything',
    (await FmsIncomeVoucher.countDocuments({ _id: r.income._id })) === 1);

  // ── 3. Account validation ─────────────────────────────────────────────────
  console.log('\n3. Account validation');
  await throws('crediting an expense head rejected',
    () => svc.record(school, { ...base(), creditAccount: salary._id }, cashier),
    /income must be credited to an income head/);
  await throws('crediting an asset rejected',
    () => svc.record(school, { ...base(), creditAccount: cash._id }, cashier),
    /income must be credited/);
  await throws('non-postable head rejected',
    () => svc.record(school, { ...base(), creditAccount: headOnly._id }, cashier),
    /grouping head/);
  await throws('unknown account rejected',
    () => svc.record(school, { ...base(), creditAccount: new Types.ObjectId() }, cashier),
    /not found/);

  // ── 4. Payment mode routing ───────────────────────────────────────────────
  console.log('\n4. Payment mode');
  const cashR = await svc.record(school, base(), cashier);
  ok('cash infers the cash account', String(cashR.income.debitAccount) === String(cash._id));

  const chq = await svc.record(school, {
    ...base(), paymentMode: 'cheque', instrumentNumber: '004521', bankName: 'SBI',
  }, cashier);
  ok('cheque infers the bank account', String(chq.income.debitAccount) === String(bank._id));

  await throws('cheque without an instrument number rejected',
    () => svc.record(school, { ...base(), paymentMode: 'cheque' }, cashier),
    /instrumentNumber/);

  // The important one: online/UPI must not silently land in the main bank head.
  await throws('ONLINE requires an explicit account',
    () => svc.record(school, { ...base(), paymentMode: 'online' }, cashier),
    /must name the account|debitAccount/);
  await throws('UPI requires an explicit account',
    () => svc.record(school, { ...base(), paymentMode: 'upi' }, cashier),
    /must name the account|debitAccount/);

  const upi = await svc.record(school, {
    ...base(), paymentMode: 'upi', debitAccount: clearing._id, instrumentNumber: 'UPI123',
  }, cashier);
  ok('UPI posts to the clearing head when named',
    String(upi.income.debitAccount) === String(clearing._id));

  // ── 5. Amount and date validation ─────────────────────────────────────────
  console.log('\n5. Amount and date');
  await throws('float rupees rejected',
    () => svc.record(school, { ...base(), amount: 125.50 }, cashier), /integer.*paise/i);
  await throws('zero rejected', () => svc.record(school, { ...base(), amount: 0 }, cashier), /positive/);
  await throws('negative rejected', () => svc.record(school, { ...base(), amount: -100 }, cashier), /positive/);
  await throws('a future receipt date rejected',
    () => svc.record(school, { ...base(), receiptDate: new Date('2099-01-01') }, cashier),
    /future|no financial year/);
  await throws('a date outside any financial year rejected',
    () => svc.record(school, { ...base(), receiptDate: new Date('2020-01-01') }, cashier),
    /no financial year/);
  await throws('unknown category rejected',
    () => svc.record(school, { ...base(), category: 'lottery' }, cashier), /must be one of/);

  // ── 6. Categories ─────────────────────────────────────────────────────────
  console.log('\n6. Categories');
  const don = await svc.record(school, {
    receiptDate: new Date('2026-07-16'), category: 'donation',
    amount: money.toPaise(50000), paymentMode: 'cheque', instrumentNumber: '9981',
    creditAccount: donation._id, payerName: 'Rotary Club', payerType: 'organisation',
  }, cashier);
  ok('donation recorded', don.income.category === 'donation');
  ok('organisation payer', don.income.payerType === 'organisation');
  ok('receipt numbers are sequential',
    Number(don.income.receiptNumber.split('-').pop()) >
    Number(cashR.income.receiptNumber.split('-').pop()));

  // ── 7. Totals exclude cancellations ───────────────────────────────────────
  console.log('\n7. Totals');
  const all = await FmsIncomeVoucher.countDocuments({ school });
  const live = await FmsIncomeVoucher.aggregate([
    { $match: { school, incomeStatus: 'posted' } },
    { $group: { _id: null, amount: { $sum: '$amount' }, n: { $sum: 1 } } },
  ]);
  ok('cancelled receipt still counted in the record set', all === 5, String(all));
  ok('but EXCLUDED from the collections total', live[0].n === 4, String(live[0].n));

  const expected = amt + amt + amt + money.toPaise(50000);   // cash, cheque, upi, donation
  ok('posted total correct', live[0].amount === expected,
    `${live[0].amount} vs ${expected}`);

  // ── 8. The cash book agrees ───────────────────────────────────────────────
  console.log('\n8. Cash book agreement');
  const cashBook = await bookSvc.book(school, {
    bookType: 'cash', from: '2026-07-01', to: '2026-07-31',
  });
  const tb = await gl.trialBalance(school);
  const cashTb = tb.lines.find((l) => l.accountCode === '1101');
  ok('CASH BOOK = TRIAL BALANCE FOR CASH',
    cashBook.closingBalance === cashTb.balance,
    `book=${cashBook.closingBalance} tb=${cashTb.balance}`);
  ok('cash book is continuous', cashBook.continuous);

  const incomeTb = tb.lines.find((l) => l.accountCode === '4101');
  ok('tuition income shown as Cr', incomeTb.drCr === 'Cr');

  // ── 9. Financial year lock ────────────────────────────────────────────────
  console.log('\n9. Financial year lock');
  await M.FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'locked' } });
  await throws('cannot record into a locked year',
    () => svc.record(school, base(), cashier), /locked/);
  await throws('cannot cancel into a locked year',
    () => svc.cancel(school, cashR.income._id, manager, 'test'), /locked/);
  await M.FmsFinancialYear.updateOne({ _id: fy._id }, { $set: { fyStatus: 'open' } });

  // ── 10. Audit and integrity ───────────────────────────────────────────────
  console.log('\n10. Audit and integrity');
  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_incomevouchers' });
  ok('receipts are audited', audits >= 5, `${audits} entries`);

  const cancelAudit = await M.FmsAuditTrail
    .findOne({ school, entity: 'fms_incomevouchers', action: 'cancel' }).lean();
  ok('cancellation audited with before/after', !!cancelAudit?.before && !!cancelAudit?.after);

  const final = await gl.trialBalance(school);
  ok('FINAL: debits = credits', final.totals.balanced, JSON.stringify(final.totals));

  const numbers = (await FmsIncomeVoucher.find({ school }).select('receiptNumber').lean())
    .map((d) => Number(d.receiptNumber.split('-').pop())).sort((a, b) => a - b);
  const gapless = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  ok('RECEIPT NUMBERS ARE GAPLESS', gapless, numbers.join(','));

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