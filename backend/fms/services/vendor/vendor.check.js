// backend/fms/services/vendor/vendor.check.js
//
// Vendor Management integration checks. SRS M7.
//
//   node fms/services/vendor/vendor.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end.
//
// Section 1 is the P4.2 verification: create a vendor with documents; confirm
// invalid GST/PAN is rejected and the history view aggregates its transactions.

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

  const M = require('../../models/core');
  const { FmsVendor, FmsVendorDocument } = require('../../models/vendor');
  const { FmsExpenseRequest } = require('../../models/expense');
  const svc = require('./vendorService');
  const expenseSvc = require('../expense/expenseService');
  const approvalSvc = require('../approval/approvalService');
  const paymentSvc = require('../payment/paymentService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const who = (e, r) => ({ user: { _id: new Types.ObjectId(), email: e }, fmsRole: r });
  const purchaseOfficer = who('po@test', 'purchaseOfficer');
  const manager = who('mgr@test', 'accountsManager');
  const requester = who('req@test', 'deptHead');
  const accountant = who('acct@test', 'accountant');
  const deptHead = who('dept@test', 'deptHead');
  const principal = who('principal@test', 'principal');
  const cashier = who('cash@test', 'cashier');

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });
  for (const t of [['VEN','VEN'], ['EXP','EXP']]) {
    await M.FmsNumberSequence.create({
      school, financialYear: fy._id, type: t[0],
      prefix: t[1], yearLabel: fy.yearCode, sequence: 0, padding: 5,
    });
  }

  const gAsset = await M.FmsAccountGroup.create({ school, groupCode: '1000', groupName: 'Assets', accountType: 'asset', normalBalance: 'debit' });
  const gExp = await M.FmsAccountGroup.create({ school, groupCode: '5000', groupName: 'Expenditure', accountType: 'expense', normalBalance: 'debit' });
  const bank = await M.FmsAccount.create({ school, accountCode: '1201', accountName: 'Bank', accountGroup: gAsset._id, accountType: 'asset', normalBalance: 'debit', isBankAccount: true });
  const head = await M.FmsAccount.create({ school, accountCode: '5201', accountName: 'Stationery', accountGroup: gExp._id, accountType: 'expense', normalBalance: 'debit' });

  const bankDetails = { accountName: 'Sharma Stationers', accountNumber: '00112233445566', ifsc: 'SBIN0001234', bankName: 'SBI' };

  // ── 1. THE P4.2 VERIFICATION ──────────────────────────────────────────────
  console.log('1. Create a vendor with documents; reject bad GST/PAN; aggregate history');

  await throws('an invalid GSTIN checksum is REJECTED',
    () => svc.create(school, { vendorName: 'Bad Co', gstin: '27AAPFU0939F1ZW' }, purchaseOfficer),
    /check character/);

  await throws('a malformed PAN is REJECTED',
    () => svc.create(school, { vendorName: 'Bad Co', pan: '12PFU0939F' }, purchaseOfficer),
    /format/);

  await throws('a GSTIN and PAN that disagree are REJECTED',
    () => svc.create(school, { vendorName: 'Bad Co', gstin: '27AAPFU0939F1ZV', pan: 'AAGCB7383J' }, purchaseOfficer),
    /does not match/);

  ok('nothing was persisted by the rejections',
    (await FmsVendor.countDocuments({ school })) === 0);

  const vendor = await svc.create(school, {
    vendorName: 'Sharma Stationers',
    legalName: 'Sharma Stationers LLP',
    vendorType: 'goods',
    gstin: '27AAPFU0939F1ZV',
    contactPerson: 'R. Sharma',
    phone: '9876543210',
    email: 'sales@sharma.example',
    bank: bankDetails,
    creditDays: 30,
    rating: 4,
  }, purchaseOfficer);

  ok('vendor created', !!vendor);
  ok('vendor code allocated', /^VEN-2026-27-\d{5}$/.test(vendor.vendorCode), vendor.vendorCode);
  ok('created as draft', vendor.vendorStatus === 'draft');
  ok('PAN DERIVED FROM THE GSTIN', vendor.pan === 'AAPFU0939F', vendor.pan);
  ok('state derived from the GSTIN', vendor.address.stateName || vendor.address.state === 'Maharashtra',
    vendor.address.state);
  ok('marked GST registered', vendor.isGstRegistered === true);

  const doc1 = await svc.addDocument(school, vendor._id, {
    docType: 'gstCertificate', docNumber: '27AAPFU0939F1ZV',
    fileName: 'gst.pdf', url: '/u/gst.pdf',
    expiryDate: new Date('2027-03-31'),
  }, purchaseOfficer);
  await svc.addDocument(school, vendor._id, {
    docType: 'cancelledCheque', fileName: 'chq.pdf', url: '/u/chq.pdf',
  }, purchaseOfficer);

  ok('documents attached', (await FmsVendorDocument.countDocuments({ school, vendor: vendor._id })) === 2);

  await throws('the uploader cannot verify their own document',
    () => svc.verifyDocument(school, doc1._id, purchaseOfficer), /Separation of duties/);
  const verified = await svc.verifyDocument(school, doc1._id, manager, 'Checked against the portal');
  ok('a different person can verify', verified.verified === true);

  await svc.setStatus(school, vendor._id, { vendorStatus: 'active' }, manager);
  ok('activated', (await FmsVendor.findById(vendor._id)).vendorStatus === 'active');

  // Transact, then aggregate.
  const amt = money.toPaise(12000);
  const e1 = await expenseSvc.create(school, {
    requestDate: new Date('2026-07-20'),
    department: { name: 'Admin' },
    vendor: { name: vendor.vendorName, ref: vendor._id },
    category: 'Stationery', purpose: 'Paper and toner',
    budgetHead: head._id, baseAmount: amt, totalAmount: amt,
    paymentMode: 'cheque',
    attachments: [{ fileName: 'inv.pdf', url: '/u/inv.pdf', kind: 'invoice' }],
  }, requester);
  await expenseSvc.submit(school, e1._id, requester, {});

  // Walk the chain rather than naming an approver. ₹12,000 is tier 2, so it
  // needs a principal — hardcoding deptHead here worked only for amounts under
  // ₹10,000, which is the same trap that caught budget.check.js.
  const actorFor = { accounts: accountant, deptHead, principal, chairman: principal, trustee: principal };
  for (let guard = 0; guard < 6; guard++) {
    const cur = await FmsExpenseRequest.findById(e1._id);
    const pos = await approvalSvc.position(school, cur);
    if (pos.next.done || !pos.next.step || pos.next.step === 'payment') break;
    const base = actorFor[pos.next.step];
    const asRole = ['chairman', 'trustee'].includes(pos.next.step)
      ? { user: base.user, fmsRole: 'chairman' } : base;
    await approvalSvc.act(school, e1._id,
      { action: pos.next.step === 'accounts' ? 'verify' : 'approve', step: pos.next.step }, asRole);
  }

  await paymentSvc.pay(school, e1._id, { paymentMode: 'cheque', instrumentNumber: '00991' }, cashier);

  const unpaidAmt = money.toPaise(5000);
  const e2 = await expenseSvc.create(school, {
    requestDate: new Date('2026-07-22'),
    department: { name: 'Admin' },
    vendor: { name: vendor.vendorName, ref: vendor._id },
    category: 'Stationery', purpose: 'Files',
    budgetHead: head._id, baseAmount: unpaidAmt, totalAmount: unpaidAmt,
    paymentMode: 'cheque',
    attachments: [{ fileName: 'inv2.pdf', url: '/u/inv2.pdf', kind: 'invoice' }],
  }, requester);
  await expenseSvc.submit(school, e2._id, requester, {});

  const hist = await svc.history(school, vendor._id);
  ok('HISTORY AGGREGATES EXPENSES', hist.summary.expenseCount === 2, String(hist.summary.expenseCount));
  ok('HISTORY AGGREGATES PAYMENTS', hist.summary.paymentCount === 1, String(hist.summary.paymentCount));
  ok('total billed correct', hist.summary.totalBilled === amt + unpaidAmt, String(hist.summary.totalBilled));
  ok('total paid correct', hist.summary.totalPaid === amt, String(hist.summary.totalPaid));
  ok('OUTSTANDING = billed − paid', hist.summary.outstanding === unpaidAmt, String(hist.summary.outstanding));
  ok('the expense list is returned', hist.expenses.length === 2);
  ok('the payment list is returned', hist.payments.length === 1);
  ok('purchase orders are absent AND SAID TO BE',
    hist.purchaseOrders.length === 0 && /P4.3/.test(hist.note));

  // ── 2. Duplicate prevention ───────────────────────────────────────────────
  console.log('\n2. Duplicates');
  await throws('a second vendor with the same GSTIN is rejected',
    () => svc.create(school, { vendorName: 'Copycat', gstin: '27AAPFU0939F1ZV' }, purchaseOfficer),
    /already belongs to vendor/);

  const noGst = await svc.create(school, { vendorName: 'Local Kirana' }, purchaseOfficer);
  const noGst2 = await svc.create(school, { vendorName: 'Another Local' }, purchaseOfficer);
  ok('TWO vendors without a GSTIN are both allowed',
    !!noGst && !!noGst2 && noGst.vendorCode !== noGst2.vendorCode);

  // ── 3. Status rules ───────────────────────────────────────────────────────
  console.log('\n3. Status rules');
  await throws('cannot activate without bank details',
    () => svc.setStatus(school, noGst._id, { vendorStatus: 'active' }, manager), /bank details/);

  await svc.update(school, noGst._id, { bank: bankDetails }, purchaseOfficer);
  const activated = await svc.setStatus(school, noGst._id, { vendorStatus: 'active' }, manager);
  ok('activates once bank details exist', activated.vendorStatus === 'active');

  await throws('blacklisting without a reason blocked',
    () => svc.setStatus(school, noGst._id, { vendorStatus: 'blacklisted' }, manager), /reason/);

  const black = await svc.setStatus(school, noGst._id,
    { vendorStatus: 'blacklisted', reason: 'Repeated short delivery' }, manager);
  ok('blacklisted with a reason', black.vendorStatus === 'blacklisted');
  ok('the reason is recorded', /short delivery/.test(black.statusReason));

  await throws('a blacklisted vendor cannot be transacted with',
    () => svc.assertTransactable(school, noGst._id), /blacklisted/);
  const okVendor = await svc.assertTransactable(school, vendor._id);
  ok('an active vendor can be transacted with', okVendor.vendorStatus === 'active');

  await throws('cannot set the same status twice',
    () => svc.setStatus(school, vendor._id, { vendorStatus: 'active' }, manager), /already active/);

  // ── 4. Tax ID edge cases ──────────────────────────────────────────────────
  console.log('\n4. Tax identifiers');
  const gstOnly = await svc.create(school, { vendorName: 'GST Only', gstin: '29AAGCB7383J1Z4' }, purchaseOfficer);
  ok('a GSTIN alone derives the PAN', gstOnly.pan === 'AAGCB7383J');

  const panOnly = await svc.create(school, { vendorName: 'PAN Only', pan: 'AAACB2894G' }, purchaseOfficer);
  ok('a PAN alone is accepted', panOnly.pan === 'AAACB2894G');
  ok('and the vendor is NOT marked GST registered', panOnly.isGstRegistered === false);

  await throws('a state code contradicting the GSTIN is rejected',
    () => svc.create(school, {
      vendorName: 'Wrong State', gstin: '07AAACB2894G1ZP',
      address: { stateCode: '27' },
    }, purchaseOfficer), /contradicts the GSTIN/);

  // A GSTIN that CONTRADICTS the stored PAN must be refused, not silently
  // applied. `panOnly` holds AAACB2894G; 24AAACC1206D1ZM embeds AAACC1206D,
  // which is a different person — one of the two is wrong and a human has to
  // say which. (The original version of this test asserted the unsafe
  // behaviour: that the stored PAN would be quietly overwritten.)
  await throws('adding a GSTIN that CONTRADICTS the stored PAN is refused',
    () => svc.update(school, panOnly._id, { gstin: '24AAACC1206D1ZM' }, purchaseOfficer),
    /does not match/);

  const unchanged = await FmsVendor.findById(panOnly._id);
  ok('and the stored PAN is untouched', unchanged.pan === 'AAACB2894G', unchanged.pan);
  ok('and no GSTIN was set', unchanged.gstin === null);

  // The matching GSTIN for that PAN is accepted.
  const updated = await svc.update(school, panOnly._id, { gstin: '07AAACB2894G1ZP' }, purchaseOfficer);
  ok('a GSTIN whose PAN AGREES is accepted', updated.gstin === '07AAACB2894G1ZP');
  ok('the PAN is unchanged, as it should be', updated.pan === 'AAACB2894G');
  ok('and the vendor is now GST registered', updated.isGstRegistered === true);

  // ── 5. Documents ──────────────────────────────────────────────────────────
  console.log('\n5. Documents');
  await svc.addDocument(school, gstOnly._id, {
    docType: 'panCard', fileName: 'pan.pdf', url: '/u/pan.pdf',
    expiryDate: new Date(Date.now() + 10 * 86400000),
  }, purchaseOfficer);

  const expiring = await svc.expiringDocuments(school, 30);
  ok('documents expiring within 30 days are surfaced', expiring.length >= 1);
  ok('sorted soonest first',
    expiring.length < 2 || expiring[0].expiryDate <= expiring[1].expiryDate);

  await throws('cannot verify twice',
    () => svc.verifyDocument(school, doc1._id, manager), /already verified/);

  // ── 6. Never deleted ──────────────────────────────────────────────────────
  console.log('\n6. Never deleted');
  await throws('deleteOne blocked', () => FmsVendor.deleteOne({ _id: vendor._id }), /never deleted/);
  await throws('deleteMany blocked', () => FmsVendor.deleteMany({ school }), /never deleted/);
  ok('the vendor survives', (await FmsVendor.countDocuments({ _id: vendor._id })) === 1);

  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: 'fms_vendors' });
  ok('vendor changes are audited', audits >= 5, `${audits} entries`);

  const docAudit = await M.FmsAuditTrail
    .findOne({ school, entity: 'fms_vendordocuments', action: 'verify' }).lean();
  ok('verification audited with before/after', !!docAudit?.before && !!docAudit?.after);

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