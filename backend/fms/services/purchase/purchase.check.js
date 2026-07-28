// backend/fms/services/purchase/purchase.check.js
//
// Procure-to-pay integration checks. SRS M8 / BPMN WF2.
//
//   node fms/services/purchase/purchase.check.js
//
// Separate database (<yourdb>_fmscheck), dropped at the end.
//
// Section 1 is the P4.3 verification: run one PR fully to PAID and confirm the
// payable and settlement postings are correct. Section 2 confirms a quantity
// mismatch is flagged.

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
  const testUri = uri.replace(/\/([^/?]+)(\?|$)/, '/$1_fmscheck$2');
  const dbName = testUri.match(/\/([^/?]+)(\?|$)/)[1];
  if (!dbName.endsWith('_fmscheck')) throw new Error(`Refusing: '${dbName}'`);

  await mongoose.connect(testUri);
  const info = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!info.setName) throw new Error('Not a replica set');
  console.log(`\nDatabase: ${dbName}   replica set: ${info.setName}\n`);

  const M = require('../../models/core');
  const {
    FmsPurchaseRequest, FmsPurchaseOrder, FmsGoodsReceipt, FmsPurchaseInvoice,
  } = require('../../models/purchase');
  const svc = require('./purchaseService');
  const vendorSvc = require('../vendor/vendorService');
  const gl = require('../ledger/ledgerQueryService');
  const money = require('../../utils/money');
  const { Types } = mongoose;

  const school = new Types.ObjectId();
  const who = (e, r) => ({ user: { _id: new Types.ObjectId(), email: e }, fmsRole: r });
  const requester = who('req@test', 'deptHead');
  const po_officer = who('po@test', 'purchaseOfficer');
  const principal = who('principal@test', 'principal');
  const manager = who('mgr@test', 'accountsManager');

  const fy = await M.FmsFinancialYear.create({
    school, yearCode: '2026-27',
    startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'),
    fyStatus: 'open', isCurrent: true,
  });
  for (const [t, p] of [['PR','PR'],['PO','PO'],['GRN','GRN'],['VEN','VEN']]) {
    await M.FmsNumberSequence.create({
      school, financialYear: fy._id, type: t, prefix: p,
      yearLabel: fy.yearCode, sequence: 0, padding: 5,
    });
  }

  const mkG = (c,n,t,b) => M.FmsAccountGroup.create({ school, groupCode:c, groupName:n, accountType:t, normalBalance:b });
  const mkA = (c,n,g,t,b,x={}) => M.FmsAccount.create({ school, accountCode:c, accountName:n, accountGroup:g._id, accountType:t, normalBalance:b, ...x });

  const gAsset = await mkG('1000','Assets','asset','debit');
  const gLia = await mkG('2000','Liabilities','liability','credit');
  const gExp = await mkG('5000','Expenditure','expense','debit');
  const bank = await mkA('1201','Bank',gAsset,'asset','debit',{ isBankAccount:true });
  const creditors = await mkA('2201','Sundry Creditors',gLia,'liability','credit');
  const stationery = await mkA('5201','Printing & Stationery',gExp,'expense','debit');

  const bankDetails = { accountName:'Sharma', accountNumber:'0011223344', ifsc:'SBIN0001234' };
  const vA = await vendorSvc.create(school, { vendorName:'Sharma Stationers', gstin:'27AAPFU0939F1ZV', bank:bankDetails }, po_officer);
  await vendorSvc.setStatus(school, vA._id, { vendorStatus:'active' }, manager);
  const vB = await vendorSvc.create(school, { vendorName:'Gupta Supplies', gstin:'29AAGCB7383J1Z4', bank:bankDetails }, po_officer);
  await vendorSvc.setStatus(school, vB._id, { vendorStatus:'active' }, manager);

  const RATE = money.toPaise(250);

  async function fullChain({ vendorRate = RATE, receiveQty = 10, invoiceQty = 10, invoiceRate = RATE } = {}) {
    const pr = await svc.createRequest(school, {
      department: { name: 'Administration' },
      purpose: 'A4 paper for the term',
      items: [{ description:'A4 Paper (ream)', quantity:10, unit:'ream',
        estimatedRate: RATE, estimatedAmount: RATE*10, budgetHead: stationery._id }],
    }, requester);

    const prDoc = await FmsPurchaseRequest.findById(pr._id);
    const itemId = prDoc.items[0]._id;

    await svc.addQuotation(school, pr._id, {
      vendor: vA._id, vendorName: vA.vendorName, quoteNumber:'Q-1',
      items: [{ prItemId: itemId, rate: vendorRate, amount: vendorRate*10 }],
    }, po_officer);
    await svc.addQuotation(school, pr._id, {
      vendor: vB._id, vendorName: vB.vendorName, quoteNumber:'Q-2',
      items: [{ prItemId: itemId, rate: vendorRate + money.toPaise(30), amount: (vendorRate + money.toPaise(30))*10 }],
    }, po_officer);

    const fresh = await FmsPurchaseRequest.findById(pr._id);
    const cheapest = fresh.quotations.sort((a,b)=>a.grandTotal-b.grandTotal)[0];
    await svc.selectQuotation(school, pr._id, cheapest._id, po_officer);
    await svc.approveRequest(school, pr._id, principal, {});
    const { purchaseOrder } = await svc.issuePO(school, pr._id, {}, po_officer);

    const poDoc = await FmsPurchaseOrder.findById(purchaseOrder._id);
    const poItemId = poDoc.items[0]._id;

    const { goodsReceipt } = await svc.receiveGoods(school, purchaseOrder._id, {
      challanNumber: 'CH-1',
      items: [{ poItemId, receivedQty: receiveQty, acceptedQty: receiveQty, rejectedQty: 0 }],
    }, po_officer);

    const inv = await svc.recordInvoice(school, purchaseOrder._id, {
      invoiceNumber: `INV-${Math.random().toString().slice(2,8)}`,
      invoiceDate: new Date('2026-07-25'),
      goodsReceipts: [goodsReceipt._id],
      items: [{ itemId: poItemId, quantity: invoiceQty, rate: invoiceRate, amount: invoiceQty*invoiceRate }],
      grandTotal: invoiceQty*invoiceRate,
    }, po_officer);

    return { pr, purchaseOrder, goodsReceipt, invoice: inv, poItemId };
  }

  // ── 1. THE P4.3 VERIFICATION ──────────────────────────────────────────────
  console.log('1. One request all the way to PAID');

  const c = await fullChain();
  ok('PR created', /^PR-2026-27-\d{5}$/.test(c.pr.prNumber), c.pr.prNumber);
  ok('two quotations recorded', (await FmsPurchaseRequest.findById(c.pr._id)).quotations.length === 2);
  ok('PO issued', /^PO-2026-27-\d{5}$/.test(c.purchaseOrder.poNumber), c.purchaseOrder.poNumber);
  ok('PO uses the QUOTED rate', c.purchaseOrder.items[0].rate === RATE);
  ok('GRN recorded', /^GRN-2026-27-\d{5}$/.test(c.goodsReceipt.grnNumber));
  ok('PO marked fully received',
    (await FmsPurchaseOrder.findById(c.purchaseOrder._id)).poStatus === 'received');
  ok('NO ledger entries yet — receiving is not owing',
    (await M.FmsLedgerEntry.countDocuments({ school })) === 0);

  const verified = await svc.verifyInvoice(school, c.invoice._id, manager, {});
  ok('invoice verified', verified.invoice.invoiceStatus === 'verified');
  ok('three-way match passed', verified.matchResult.matched === true);
  ok('PAYABLE POSTED', !!verified.voucher.voucherNumber, verified.voucher.voucherNumber);

  const payable = await gl.voucherDetail(school, verified.voucher._id);
  ok('payable posting balances', payable.totals.balanced);
  ok('Dr the expense head',
    payable.lines.find((l)=>l.accountCode==='5201')?.debit === money.toPaise(2500));
  ok('CR SUNDRY CREDITORS',
    payable.lines.find((l)=>l.accountCode==='2201')?.credit === money.toPaise(2500));
  ok('the vendor is named on both lines',
    payable.lines.every((l)=>l.partyName === 'Sharma Stationers'));

  const paid = await svc.payInvoice(school, c.invoice._id, {
    creditAccount: bank._id, paymentMode: 'neft', bankReference: 'NEFT001',
  }, manager);
  ok('invoice PAID', paid.invoice.invoiceStatus === 'paid');

  const settle = await gl.voucherDetail(school, paid.voucher._id);
  ok('settlement balances', settle.totals.balanced);
  ok('DR SUNDRY CREDITORS on payment',
    settle.lines.find((l)=>l.accountCode==='2201')?.debit === money.toPaise(2500));
  ok('Cr bank', settle.lines.find((l)=>l.accountCode==='1201')?.credit === money.toPaise(2500));

  const tb = await gl.trialBalance(school);
  ok('CREDITORS BACK TO ZERO after payment',
    tb.lines.find((l)=>l.accountCode==='2201').balance === 0);
  ok('expense stands at 2500',
    tb.lines.find((l)=>l.accountCode==='5201').balance === money.toPaise(2500));
  ok('trial balance balances', tb.totals.balanced);

  const prPaid = await FmsPurchaseRequest.findById(c.pr._id);
  ok('request reaches PAID', prPaid.purchaseStatus === 'paid');
  const closed = await svc.closeRequest(school, c.pr._id, manager);
  ok('and CLOSED', closed.purchaseStatus === 'closed');

  // ── 2. Quantity mismatch is flagged ───────────────────────────────────────
  console.log('\n2. Three-way match catches a mismatch');

  const mm = await fullChain({ receiveQty: 8, invoiceQty: 10 });
  const preview = await svc.runMatch(school, mm.invoice._id);
  ok('MISMATCH DETECTED', preview.matched === false);
  ok('flagged as over-invoiced vs received',
    preview.blocking.some((d)=>d.type==='OVER_INVOICED_VS_RECEIVED'));
  ok('the excess is reported',
    preview.blocking.find((d)=>d.type==='OVER_INVOICED_VS_RECEIVED').excess === 2);

  const beforeCount = await M.FmsVoucher.countDocuments({ school });
  await throws('VERIFICATION IS BLOCKED',
    () => svc.verifyInvoice(school, mm.invoice._id, manager, {}), /match failed/);
  ok('and NOTHING was posted',
    (await M.FmsVoucher.countDocuments({ school })) === beforeCount);
  ok('the invoice is marked disputed',
    (await FmsPurchaseInvoice.findById(mm.invoice._id)).invoiceStatus === 'disputed');

  // ── 3. Rate mismatch ──────────────────────────────────────────────────────
  console.log('\n3. Rate mismatch');
  const rm = await fullChain({ invoiceRate: money.toPaise(275) });
  const rmMatch = await svc.runMatch(school, rm.invoice._id);
  ok('a rate change is flagged', rmMatch.blocking.some((d)=>d.type==='RATE_MISMATCH'));
  ok('with the difference in paise',
    rmMatch.blocking.find((d)=>d.type==='RATE_MISMATCH').differencePaise === money.toPaise(25));

  // ── 4. Override, deliberately ─────────────────────────────────────────────
  console.log('\n4. Override');
  await FmsPurchaseInvoice.updateOne({ _id: rm.invoice._id }, { $set: { invoiceStatus: 'pending' } });
  await throws('overriding without a reason is refused',
    () => svc.verifyInvoice(school, rm.invoice._id, manager, { override: true }), /overrideReason/);

  const overridden = await svc.verifyInvoice(school, rm.invoice._id, manager, {
    override: true, overrideReason: 'Rate renegotiated after the quote; approved verbally',
  });
  ok('an override with a reason succeeds', overridden.invoice.invoiceStatus === 'verified');
  ok('THE OVERRIDE IS ATTRIBUTED', !!overridden.invoice.overriddenBy);
  ok('and the reason recorded', /renegotiated/.test(overridden.invoice.overrideReason));
  ok('the failed match is kept on the record', overridden.invoice.matchResult.matched === false);

  // ── 5. Quotation selection ────────────────────────────────────────────────
  console.log('\n5. Quotation selection');
  const pr5 = await svc.createRequest(school, {
    department: { name: 'Science' }, purpose: 'Lab consumables',
    items: [{ description:'Beakers', quantity:5, estimatedRate: money.toPaise(400),
      estimatedAmount: money.toPaise(2000), budgetHead: stationery._id }],
  }, requester);
  const pr5doc = await FmsPurchaseRequest.findById(pr5._id);
  const it5 = pr5doc.items[0]._id;

  await svc.addQuotation(school, pr5._id, { vendor: vA._id, vendorName: vA.vendorName,
    items: [{ prItemId: it5, rate: money.toPaise(400), amount: money.toPaise(2000) }] }, po_officer);
  await svc.addQuotation(school, pr5._id, { vendor: vB._id, vendorName: vB.vendorName,
    items: [{ prItemId: it5, rate: money.toPaise(450), amount: money.toPaise(2250) }] }, po_officer);

  const q = await FmsPurchaseRequest.findById(pr5._id);
  const dearer = q.quotations.find((x)=>x.grandTotal === money.toPaise(2250));

  await throws('choosing a DEARER quote without a reason is refused',
    () => svc.selectQuotation(school, pr5._id, dearer._id, po_officer), /not the lowest/);

  const chosen = await svc.selectQuotation(school, pr5._id, dearer._id, po_officer,
    'Better delivery time and prior quality record');
  ok('a dearer quote can be chosen WITH a reason', chosen.wasCheapest === false);
  ok('the reason is stored on the quotation', /delivery time/.test(chosen.selected.selectionReason));

  // ── 6. Guards ─────────────────────────────────────────────────────────────
  console.log('\n6. Guards');
  await throws('the requester cannot approve their own request',
    () => svc.approveRequest(school, pr5._id, requester, {}), /Separation of duties/);

  // A DEDICATED vendor for this test. Blacklisting vB here poisoned every later
  // section, because fullChain() asks both vendors to quote — the guard was
  // right and the check was leaking state into its own fixtures.
  const vBad = await vendorSvc.create(school,
    { vendorName: 'Dodgy Traders', bank: bankDetails }, po_officer);
  await vendorSvc.setStatus(school, vBad._id, { vendorStatus: 'active' }, manager);
  await vendorSvc.setStatus(school, vBad._id,
    { vendorStatus: 'blacklisted', reason: 'Repeated non-delivery' }, manager);

  await throws('a blacklisted vendor cannot quote',
    () => svc.addQuotation(school, pr5._id,
      { vendor: vBad._id, vendorName: vBad.vendorName, items: [] }, po_officer),
    /blacklisted/);

  ok('the other vendors are untouched',
    (await vendorSvc.assertTransactable(school, vB._id)).vendorStatus === 'active');

  const po6 = await FmsPurchaseOrder.findById(c.purchaseOrder._id);
  await throws('cannot receive more than ordered',
    () => svc.receiveGoods(school, po6._id, {
      items: [{ poItemId: po6.items[0]._id, receivedQty: 5, acceptedQty: 5, rejectedQty: 0 }],
    }, po_officer), /exceed the order/);

  await throws('a duplicate invoice number from the same vendor is rejected',
    () => svc.recordInvoice(school, c.purchaseOrder._id, {
      invoiceNumber: c.invoice.invoiceNumber, invoiceDate: new Date('2026-07-25'),
      items: [], grandTotal: 100,
    }, po_officer), /already been recorded/);

  await throws('cannot pay an unverified invoice',
    () => svc.payInvoice(school, mm.invoice._id, { creditAccount: bank._id, paymentMode:'neft' }, manager),
    /Only a verified/);

  await throws('cannot pay twice',
    () => svc.payInvoice(school, c.invoice._id, { creditAccount: bank._id, paymentMode:'neft' }, manager),
    /already been paid|Only a verified/);

  // ── 7. Rejected goods ─────────────────────────────────────────────────────
  console.log('\n7. Rejected goods');
  const rj = await fullChain({ receiveQty: 10 });
  const rjPo = await FmsPurchaseOrder.findById(rj.purchaseOrder._id);
  await throws('accepted + rejected must equal received',
    () => FmsGoodsReceipt.create({
      school, financialYear: fy._id, grnNumber: 'GRN-BAD', grnDate: new Date(),
      purchaseOrder: rjPo._id, vendor: vA._id,
      items: [{ poItemId: rjPo.items[0]._id, receivedQty: 10, acceptedQty: 8, rejectedQty: 1 }],
    }), /must equal/);

  // ── 8. Cancellation ───────────────────────────────────────────────────────
  console.log('\n8. Cancellation');
  const cx = await svc.createRequest(school, {
    department: { name: 'Admin' }, purpose: 'To be cancelled',
    items: [{ description:'Widget', quantity:1, estimatedRate: 100, estimatedAmount: 100, budgetHead: stationery._id }],
  }, requester);
  const cancelled = await svc.cancelRequest(school, cx._id, manager, 'No longer needed');
  ok('a request can be cancelled', cancelled.purchaseStatus === 'cancelled');
  ok('NOT deleted', (await FmsPurchaseRequest.countDocuments({ _id: cx._id })) === 1);

  await throws('CANNOT cancel once goods have arrived',
    () => svc.cancelRequest(school, c.pr._id, manager, 'too late'), /already been received|Cannot cancel/);

  await throws('purchase requests are never deleted',
    () => FmsPurchaseRequest.deleteOne({ _id: cx._id }), /never deleted/);

  // ── 9. Final integrity ────────────────────────────────────────────────────
  console.log('\n9. Final integrity');
  const finalTb = await gl.trialBalance(school);
  ok('FINAL: debits = credits', finalTb.totals.balanced, JSON.stringify(finalTb.totals));

  const audits = await M.FmsAuditTrail.countDocuments({ school, entity: /^fms_purchase/ });
  ok('purchase activity is audited', audits >= 5, `${audits} entries`);

  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failures:'); failures.forEach((f)=>console.log(`  - ${f}`)); }
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
  } catch (_) {}
  process.exit(1);
});