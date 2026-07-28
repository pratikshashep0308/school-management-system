// backend/fms/services/purchase/purchaseService.js
//
// Procure-to-pay. SRS M8 / FR-M8, BPMN WF2, screens SCR-30..35.
//
//   request → quote → compare → approve → PO → GRN → invoice → verify → pay
//
// ─── TWO POSTINGS, NOT ONE ───────────────────────────────────────────────────
//   invoice verified   Dr <expense head>        Cr Sundry Creditors
//   payment made       Dr Sundry Creditors      Cr Cash / Bank
//
// Goods taken on credit create a liability before any money moves, so the
// payable is real from the moment the bill is accepted. A direct expense
// payment (P3.4) collapses both into one because there is no credit period.

const mongoose = require('mongoose');
const {
  FmsAccount, FmsFinancialYear, FmsNumberSequence, FmsAuditTrail, FmsSettings,
} = require('../../models/core');
const {
  FmsPurchaseRequest, FmsPurchaseOrder, FmsGoodsReceipt, FmsPurchaseInvoice,
} = require('../../models/purchase');
const posting = require('../ledger/LedgerPostingService');
const budgetService = require('../budget/budgetService');
const vendorService = require('../vendor/vendorService');
const match = require('./threeWayMatch');
const { errors } = require('../../utils/apiResponse');

const LOCKED_FY = ['closed', 'locked'];

async function audit({ school, entity, doc, action, before, after, req }) {
  await FmsAuditTrail.create({
    school, entity, entityId: doc?._id, action, before, after,
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip, userAgent: req?.get?.('user-agent'),
  });
}

function step(req, action, fromStatus, toStatus, comment) {
  return {
    action, actor: req?.user?._id, actorEmail: req?.user?.email,
    actorRole: req?.fmsRole, comment, fromStatus, toStatus, at: new Date(),
  };
}

async function currentFy(school) {
  const fy = await FmsFinancialYear.findOne({ school, isCurrent: true }).lean();
  if (!fy) throw errors.conflict('No current financial year is set');
  if (LOCKED_FY.includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year ${fy.yearCode} is ${fy.fyStatus}`);
  }
  return fy;
}

async function nextNumber(school, fy, type, prefix, session) {
  return FmsNumberSequence.next(school, fy._id, type, prefix, fy.yearCode, session);
}

/**
 * The Sundry Creditors account.
 *
 * Configurable, because a school may not use the code we proposed. Failing
 * loudly with an instruction is better than guessing at a liability head and
 * posting somebody's payable into the wrong place.
 */
async function creditorsAccount(school) {
  const setting = await FmsSettings.findOne({ school, key: 'accounts.sundryCreditors' }).lean();
  if (setting?.value) {
    const a = await FmsAccount.findOne({ _id: setting.value, school }).lean();
    if (a) return a;
  }

  const byCode = await FmsAccount.findOne({
    school, accountCode: '2201', accountType: 'liability', status: 'active',
  }).lean();
  if (byCode) return byCode;

  throw errors.conflict(
    'No Sundry Creditors account is configured',
    {
      hint: 'Create a liability account for payables and record it in fms_settings ' +
            "under 'accounts.sundryCreditors', or use account code 2201.",
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Request
// ─────────────────────────────────────────────────────────────────────────────

async function createRequest(school, payload, req) {
  const fy = await currentFy(school);

  if (!payload.items?.length) {
    throw errors.validation('Validation failed', { items: 'at least one item is required' });
  }

  // Every line must name a real expense head — the budget check and the
  // eventual posting both depend on it.
  for (const [i, item] of payload.items.entries()) {
    if (!item.budgetHead) {
      throw errors.validation('Validation failed', { [`items[${i}].budgetHead`]: 'is required' });
    }
    const a = await FmsAccount.findOne({ _id: item.budgetHead, school }).lean();
    if (!a) {
      throw errors.validation('Validation failed', { [`items[${i}].budgetHead`]: 'account not found' });
    }
    if (a.accountType !== 'expense' || !a.isPostable) {
      throw errors.validation('Validation failed', {
        [`items[${i}].budgetHead`]: `${a.accountCode} must be a postable expense head`,
      });
    }
    item.budgetHeadCode = a.accountCode;
    if (!Number.isInteger(item.estimatedRate || 0) || !Number.isInteger(item.estimatedAmount || 0)) {
      throw errors.validation('Validation failed', {
        [`items[${i}]`]: 'rates and amounts must be integer paise',
      });
    }
  }

  const session = await mongoose.startSession();
  let doc;
  try {
    await session.withTransaction(async () => {
      const prNumber = await nextNumber(school, fy, 'PR', 'PR', session);
      const [created] = await FmsPurchaseRequest.create([{
        school, financialYear: fy._id, prNumber,
        requestDate: new Date(payload.requestDate || Date.now()),
        requiredBy: payload.requiredBy ? new Date(payload.requiredBy) : undefined,
        department: { name: payload.department?.name, ref: payload.department?.ref || null },
        requestedBy: payload.requestedBy || req?.user?._id,
        requestedByName: payload.requestedByName || req?.user?.email,
        purpose: payload.purpose,
        justification: payload.justification,
        priority: payload.priority || 'normal',
        items: payload.items,
        purchaseStatus: 'requested',
        workflow: [step(req, 'create', null, 'requested')],
        createdBy: req?.user?._id,
      }], { session });
      doc = created;
    });
  } finally {
    await session.endSession();
  }

  await audit({ school, entity: 'fms_purchaserequests', doc, action: 'create', after: doc.toObject(), req });
  return doc;
}

/** Record a quotation received against a request (SCR-32). */
async function addQuotation(school, prId, payload, req) {
  const pr = await FmsPurchaseRequest.findOne({ _id: prId, school });
  if (!pr) throw errors.notFound('Purchase request');

  if (!['requested', 'quoted'].includes(pr.purchaseStatus)) {
    throw errors.conflict(`Cannot add a quotation to a ${pr.purchaseStatus} request`);
  }

  // A blacklisted or on-hold vendor must not enter the comparison at all —
  // otherwise someone selects them and discovers the problem at payment.
  await vendorService.assertTransactable(school, payload.vendor);

  const before = pr.toObject();
  pr.quotations.push({
    vendor: payload.vendor,
    vendorName: payload.vendorName,
    quoteNumber: payload.quoteNumber,
    quoteDate: payload.quoteDate ? new Date(payload.quoteDate) : new Date(),
    validUntil: payload.validUntil ? new Date(payload.validUntil) : undefined,
    items: payload.items || [],
    gstAmount: payload.gstAmount || 0,
    otherCharges: payload.otherCharges || 0,
    deliveryDays: payload.deliveryDays,
    paymentTerms: payload.paymentTerms,
    attachmentUrl: payload.attachmentUrl,
    receivedBy: req?.user?._id,
  });

  if (pr.purchaseStatus === 'requested') pr.purchaseStatus = 'quoted';
  pr.workflow.push(step(req, 'quotation', before.purchaseStatus, pr.purchaseStatus,
    `Quote from ${payload.vendorName}`));
  pr.updatedBy = req?.user?._id;
  await pr.save();

  await audit({ school, entity: 'fms_purchaserequests', doc: pr, action: 'update', before, after: pr.toObject(), req });
  return pr;
}

/**
 * Select a quotation.
 *
 * Choosing anything but the cheapest requires a written reason. That is often
 * the right call — quality, delivery, reliability — but it is the first thing
 * an auditor asks, and it should be answerable without relying on memory.
 */
async function selectQuotation(school, prId, quotationId, req, reason) {
  const pr = await FmsPurchaseRequest.findOne({ _id: prId, school });
  if (!pr) throw errors.notFound('Purchase request');

  if (pr.purchaseStatus !== 'quoted') {
    throw errors.conflict(`Cannot select a quotation on a ${pr.purchaseStatus} request`);
  }
  if ((pr.quotations || []).length < 1) {
    throw errors.conflict('There are no quotations to select from');
  }

  const chosen = pr.quotations.id(quotationId);
  if (!chosen) throw errors.notFound('Quotation');

  const cheapest = [...pr.quotations].sort((a, b) => a.grandTotal - b.grandTotal)[0];
  const isCheapest = String(cheapest._id) === String(quotationId);

  if (!isCheapest && (!reason || !String(reason).trim())) {
    throw errors.validation('Validation failed', {
      reason:
        `${chosen.vendorName} at ${chosen.grandTotal} is not the lowest quote ` +
        `(${cheapest.vendorName} at ${cheapest.grandTotal}) — a reason is required`,
      cheapestVendor: cheapest.vendorName,
      cheapestAmount: cheapest.grandTotal,
      selectedAmount: chosen.grandTotal,
      difference: chosen.grandTotal - cheapest.grandTotal,
    });
  }

  const before = pr.toObject();
  pr.quotations.forEach((q) => { q.selected = String(q._id) === String(quotationId); });
  chosen.selectionReason = reason || 'Lowest quotation';
  pr.selectedQuotation = chosen._id;
  pr.workflow.push(step(req, 'selectQuotation', 'quoted', 'quoted',
    `${chosen.vendorName} — ${chosen.selectionReason}`));
  pr.updatedBy = req?.user?._id;
  await pr.save();

  await audit({ school, entity: 'fms_purchaserequests', doc: pr, action: 'update', before, after: pr.toObject(), req });
  return { request: pr, selected: chosen, wasCheapest: isCheapest };
}

/** Approve a request with a selected quotation. Runs the budget check. */
async function approveRequest(school, prId, req, { comment, acknowledgeOverBudget } = {}) {
  const pr = await FmsPurchaseRequest.findOne({ _id: prId, school });
  if (!pr) throw errors.notFound('Purchase request');

  if (pr.purchaseStatus !== 'quoted') {
    throw errors.conflict(`Cannot approve a ${pr.purchaseStatus} request`);
  }
  if (!pr.selectedQuotation) {
    throw errors.conflict('A quotation must be selected before approval');
  }
  if (String(pr.requestedBy) === String(req?.user?._id)) {
    throw errors.forbidden('Separation of duties: you cannot approve a request you raised.');
  }

  const quote = pr.quotations.id(pr.selectedQuotation);

  // Check the selected quote's value against the budget for the first item's
  // head. Multi-head requests check the dominant head; the per-item posting
  // later is exact.
  const head = pr.items[0]?.budgetHead;
  const check = head
    ? await budgetService.checkAvailability(school, head, pr.financialYear,
        quote.grandTotal, pr.department?.name)
    : { checked: false, outcome: 'notChecked', reason: 'No budget head on the request' };

  if (check.outcome === 'exceeded' && check.blocking !== false && !acknowledgeOverBudget) {
    throw errors.conflict(`Over budget: ${check.reason}`, {
      ...check,
      hint: 'Resubmit with acknowledgeOverBudget: true — the status is recorded.',
    });
  }

  const before = pr.toObject();
  pr.purchaseStatus = 'approved';
  pr.approvedBy = req?.user?._id;
  pr.approvedAt = new Date();
  pr.approvalComment = comment;
  pr.budgetCheck = check;
  pr.workflow.push(step(req, 'approve', 'quoted', 'approved', comment));
  pr.updatedBy = req?.user?._id;
  await pr.save();

  await audit({ school, entity: 'fms_purchaserequests', doc: pr, action: 'approve', before, after: pr.toObject(), req });
  return pr;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Purchase order
// ─────────────────────────────────────────────────────────────────────────────

async function issuePO(school, prId, payload, req) {
  const pr = await FmsPurchaseRequest.findOne({ _id: prId, school });
  if (!pr) throw errors.notFound('Purchase request');

  if (pr.purchaseStatus !== 'approved') {
    throw errors.conflict(`A purchase order needs an approved request (this one is ${pr.purchaseStatus})`);
  }

  const existing = await FmsPurchaseOrder.findOne({
    school, purchaseRequest: pr._id, poStatus: { $ne: 'cancelled' },
  }).lean();
  if (existing) {
    throw errors.conflict(
      `Purchase order ${existing.poNumber} has already been issued for this request`,
      { poId: existing._id }
    );
  }

  const quote = pr.quotations.id(pr.selectedQuotation);
  if (!quote) throw errors.conflict('The selected quotation is missing');

  const vendor = await vendorService.assertTransactable(school, quote.vendor);
  const fy = await currentFy(school);

  // Build order lines from the request and the winning quote, so the rate on
  // the PO is the rate that was actually quoted.
  const rateFor = new Map((quote.items || []).map((q) => [String(q.prItemId), q]));
  const items = pr.items.map((it) => {
    const q = rateFor.get(String(it._id));
    const rate = q?.rate ?? it.estimatedRate ?? 0;
    return {
      prItemId: it._id,
      description: it.description,
      specification: it.specification,
      quantity: it.quantity,
      unit: it.unit,
      rate,
      amount: q?.amount ?? rate * it.quantity,
      budgetHead: it.budgetHead,
      budgetHeadCode: it.budgetHeadCode,
    };
  });

  const session = await mongoose.startSession();
  let po;
  try {
    await session.withTransaction(async () => {
      const poNumber = await nextNumber(school, fy, 'PO', 'PO', session);
      const [created] = await FmsPurchaseOrder.create([{
        school, financialYear: fy._id, poNumber,
        poDate: new Date(payload?.poDate || Date.now()),
        purchaseRequest: pr._id, prNumber: pr.prNumber, quotationId: quote._id,
        vendor: vendor._id, vendorName: vendor.vendorName, vendorGstin: vendor.gstin,
        items,
        gstAmount: quote.gstAmount || 0,
        otherCharges: quote.otherCharges || 0,
        deliveryDate: payload?.deliveryDate ? new Date(payload.deliveryDate) : undefined,
        deliveryAddress: payload?.deliveryAddress,
        paymentTerms: payload?.paymentTerms || quote.paymentTerms,
        terms: payload?.terms,
        poStatus: 'issued',
        issuedBy: req?.user?._id,
        issuedAt: new Date(),
        createdBy: req?.user?._id,
      }], { session });
      po = created;

      pr.purchaseStatus = 'poIssued';
      pr.workflow.push(step(req, 'issuePO', 'approved', 'poIssued', poNumber));
      await pr.save({ session });
    });
  } finally {
    await session.endSession();
  }

  await audit({ school, entity: 'fms_purchaseorders', doc: po, action: 'create', after: po.toObject(), req });
  return { purchaseOrder: po, request: pr };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Goods receipt
// ─────────────────────────────────────────────────────────────────────────────

async function receiveGoods(school, poId, payload, req) {
  const po = await FmsPurchaseOrder.findOne({ _id: poId, school });
  if (!po) throw errors.notFound('Purchase order');

  if (['cancelled', 'closed'].includes(po.poStatus)) {
    throw errors.conflict(`Cannot receive against a ${po.poStatus} purchase order`);
  }
  if (!payload.items?.length) {
    throw errors.validation('Validation failed', { items: 'at least one line is required' });
  }

  const fy = await currentFy(school);
  const poItems = new Map(po.items.map((i) => [String(i._id), i]));

  const lines = [];
  for (const [idx, line] of payload.items.entries()) {
    const poItem = poItems.get(String(line.poItemId));
    if (!poItem) {
      throw errors.validation('Validation failed', {
        [`items[${idx}].poItemId`]: 'this line is not on the purchase order',
      });
    }

    const received = line.receivedQty || 0;
    const rejected = line.rejectedQty || 0;
    const accepted = line.acceptedQty ?? (received - rejected);

    // Over-delivery is caught here rather than at invoice: accepting more than
    // was ordered commits the school to paying for it.
    const alreadyAccepted = poItem.acceptedQty || 0;
    if (alreadyAccepted + accepted > poItem.quantity) {
      throw errors.conflict(
        `Accepting ${accepted} of '${poItem.description}' would exceed the order — ` +
        `${poItem.quantity} ordered, ${alreadyAccepted} already accepted`,
        { ordered: poItem.quantity, alreadyAccepted, nowAccepting: accepted }
      );
    }

    lines.push({
      poItemId: poItem._id,
      description: poItem.description,
      orderedQty: poItem.quantity,
      receivedQty: received,
      acceptedQty: accepted,
      rejectedQty: rejected,
      rejectionReason: line.rejectionReason,
      rate: poItem.rate,
      amount: accepted * poItem.rate,
    });
  }

  const session = await mongoose.startSession();
  let grn;
  try {
    await session.withTransaction(async () => {
      const grnNumber = await nextNumber(school, fy, 'GRN', 'GRN', session);
      const [created] = await FmsGoodsReceipt.create([{
        school, financialYear: fy._id, grnNumber,
        grnDate: new Date(payload.grnDate || Date.now()),
        purchaseOrder: po._id, poNumber: po.poNumber,
        vendor: po.vendor, vendorName: po.vendorName,
        challanNumber: payload.challanNumber,
        challanDate: payload.challanDate ? new Date(payload.challanDate) : undefined,
        vehicleNumber: payload.vehicleNumber,
        items: lines,
        grnStatus: lines.some((l) => l.rejectedQty > 0) ? 'partiallyAccepted' : 'accepted',
        receivedBy: req?.user?._id,
        inspectedBy: payload.inspectedBy || req?.user?._id,
        inspectedAt: new Date(),
        inspectionNote: payload.inspectionNote,
        createdBy: req?.user?._id,
      }], { session });
      grn = created;

      for (const l of lines) {
        const item = po.items.id(l.poItemId);
        item.receivedQty = (item.receivedQty || 0) + l.receivedQty;
        item.acceptedQty = (item.acceptedQty || 0) + l.acceptedQty;
      }

      const fullyReceived = po.items.every((i) => (i.acceptedQty || 0) >= i.quantity);
      po.poStatus = fullyReceived ? 'received' : 'partiallyReceived';
      await po.save({ session });

      const pr = await FmsPurchaseRequest.findById(po.purchaseRequest).session(session);
      if (pr && pr.purchaseStatus === 'poIssued') {
        pr.purchaseStatus = 'goodsReceived';
        pr.workflow.push(step(req, 'receiveGoods', 'poIssued', 'goodsReceived', grnNumber));
        await pr.save({ session });
      }
    });
  } finally {
    await session.endSession();
  }

  await audit({ school, entity: 'fms_goodsreceipts', doc: grn, action: 'create', after: grn.toObject(), req });
  return { goodsReceipt: grn, purchaseOrder: po };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Invoice
// ─────────────────────────────────────────────────────────────────────────────

async function recordInvoice(school, poId, payload, req) {
  const po = await FmsPurchaseOrder.findOne({ _id: poId, school });
  if (!po) throw errors.notFound('Purchase order');
  if (po.poStatus === 'cancelled') {
    throw errors.conflict('Cannot invoice against a cancelled purchase order');
  }

  const fy = await currentFy(school);

  const dup = await FmsPurchaseInvoice.findOne({
    school, vendor: po.vendor, invoiceNumber: payload.invoiceNumber,
  }).lean();
  if (dup) {
    throw errors.conflict(
      `Invoice ${payload.invoiceNumber} from this vendor has already been recorded`,
      { invoiceId: dup._id, invoiceStatus: dup.invoiceStatus }
    );
  }

  const doc = await FmsPurchaseInvoice.create({
    school, financialYear: fy._id,
    invoiceNumber: payload.invoiceNumber,
    invoiceDate: new Date(payload.invoiceDate),
    purchaseOrder: po._id, poNumber: po.poNumber,
    goodsReceipts: payload.goodsReceipts || [],
    vendor: po.vendor, vendorName: po.vendorName,
    items: payload.items || [],
    gstAmount: payload.gstAmount || 0,
    otherCharges: payload.otherCharges || 0,
    grandTotal: payload.grandTotal,
    invoiceStatus: 'pending',
    createdBy: req?.user?._id,
  });

  await audit({ school, entity: 'fms_purchaseinvoices', doc, action: 'create', after: doc.toObject(), req });
  return doc;
}

/** Run the three-way match without changing anything. */
async function runMatch(school, invoiceId) {
  const inv = await FmsPurchaseInvoice.findOne({ _id: invoiceId, school }).lean();
  if (!inv) throw errors.notFound('Purchase invoice');

  const po = await FmsPurchaseOrder.findById(inv.purchaseOrder).lean();
  if (!po) throw errors.notFound('Purchase order');

  const grns = await FmsGoodsReceipt.find({ school, purchaseOrder: po._id }).lean();
  const received = match.accumulateReceipts(grns);

  const poItems = po.items.map((i) => ({
    itemId: i._id, description: i.description, quantity: i.quantity,
    rate: i.rate, amount: i.amount,
  }));

  return match.matchInvoice(poItems, received, inv.items);
}

/**
 * Verify an invoice and post the payable.
 *
 * A blocking discrepancy stops verification unless it is explicitly overridden
 * with a reason — an override is sometimes legitimate, but it must be a
 * deliberate, attributed act rather than a silent pass.
 */
async function verifyInvoice(school, invoiceId, req, { note, override, overrideReason } = {}) {
  const inv = await FmsPurchaseInvoice.findOne({ _id: invoiceId, school });
  if (!inv) throw errors.notFound('Purchase invoice');

  if (inv.invoiceStatus !== 'pending') {
    throw errors.conflict(`Only a pending invoice can be verified (this one is ${inv.invoiceStatus})`);
  }

  const result = await runMatch(school, invoiceId);

  if (!result.canVerify && !override) {
    inv.matchResult = result;
    inv.invoiceStatus = 'disputed';
    inv.disputedReason = result.summary;
    await inv.save();

    throw errors.conflict(
      `Three-way match failed: ${result.summary}`,
      { matchResult: result, hint: 'Resolve the discrepancies, or override with a reason.' }
    );
  }

  if (!result.canVerify && override && (!overrideReason || !String(overrideReason).trim())) {
    throw errors.validation('Validation failed', {
      overrideReason: 'is required when overriding a failed three-way match',
      blocking: result.blocking,
    });
  }

  const po = await FmsPurchaseOrder.findById(inv.purchaseOrder);
  const fy = await FmsFinancialYear.findById(inv.financialYear).lean();
  if (!fy || LOCKED_FY.includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year is ${fy ? fy.fyStatus : 'missing'}`);
  }

  const creditors = await creditorsAccount(school);

  // One debit per expense head, so a multi-head order posts to each correctly.
  const byHead = new Map();
  for (const line of inv.items) {
    const poItem = po.items.id(line.itemId);
    if (!poItem) continue;
    const key = String(poItem.budgetHead);
    byHead.set(key, (byHead.get(key) || 0) + (line.amount || 0));
  }

  const lines = [];
  for (const [headId, amount] of byHead) {
    lines.push({
      account: headId, debit: amount, credit: 0,
      narration: `${po.poNumber} — invoice ${inv.invoiceNumber}`,
      partyType: 'vendor', party: inv.vendor, partyName: inv.vendorName,
    });
  }

  const extras = (inv.gstAmount || 0) + (inv.otherCharges || 0);
  if (extras > 0 && lines.length) {
    // GST and freight follow the goods. Education services are exempt, so the
    // school generally cannot reclaim input credit and the whole amount is the
    // cost — same reasoning as P3.4.
    lines[0].debit += extras;
  }

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  lines.push({
    account: creditors._id, debit: 0, credit: totalDebit,
    narration: `Payable to ${inv.vendorName} — invoice ${inv.invoiceNumber}`,
    partyType: 'vendor', party: inv.vendor, partyName: inv.vendorName,
  });

  const posted = await posting.post({
    school, financialYear: fy._id, voucherType: 'journal',
    voucherDate: inv.invoiceDate,
    narration: `Invoice ${inv.invoiceNumber} from ${inv.vendorName} (${po.poNumber})`,
    referenceNumber: inv.invoiceNumber,
    source: 'purchase', sourceId: String(inv._id), sourceRef: inv._id,
    postedBy: req?.user?._id,
    lines,
  });

  const before = inv.toObject();
  inv.matchResult = result;
  inv.invoiceStatus = 'verified';
  inv.verifiedBy = req?.user?._id;
  inv.verifiedAt = new Date();
  inv.verificationNote = note;
  inv.payableVoucher = posted.voucher._id;
  if (override && !result.canVerify) {
    inv.overriddenBy = req?.user?._id;
    inv.overrideReason = overrideReason;
  }
  inv.updatedBy = req?.user?._id;
  await inv.save();

  for (const line of inv.items) {
    const poItem = po.items.id(line.itemId);
    if (poItem) poItem.invoicedQty = (poItem.invoicedQty || 0) + (line.quantity || 0);
  }
  await po.save();

  const pr = await FmsPurchaseRequest.findById(po.purchaseRequest);
  if (pr && ['goodsReceived', 'poIssued'].includes(pr.purchaseStatus)) {
    pr.purchaseStatus = 'invoiceVerified';
    pr.workflow.push(step(req, 'verifyInvoice', 'goodsReceived', 'invoiceVerified', inv.invoiceNumber));
    await pr.save();
  }

  await audit({ school, entity: 'fms_purchaseinvoices', doc: inv, action: 'verify', before, after: inv.toObject(), req });
  return { invoice: inv, voucher: posted.voucher, entries: posted.entries, matchResult: result };
}

/** Settle a verified invoice: Dr Sundry Creditors, Cr Cash/Bank. */
async function payInvoice(school, invoiceId, payload, req) {
  const inv = await FmsPurchaseInvoice.findOne({ _id: invoiceId, school });
  if (!inv) throw errors.notFound('Purchase invoice');

  if (inv.invoiceStatus !== 'verified') {
    throw errors.conflict(
      `Only a verified invoice can be paid (this one is ${inv.invoiceStatus})`,
      inv.invoiceStatus === 'paid' ? { hint: 'This invoice has already been paid.' } : undefined
    );
  }

  const fy = await FmsFinancialYear.findById(inv.financialYear).lean();
  if (!fy || LOCKED_FY.includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year is ${fy ? fy.fyStatus : 'missing'}`);
  }

  const creditors = await creditorsAccount(school);
  const source = await FmsAccount.findOne({ _id: payload.creditAccount, school }).lean();
  if (!source) throw errors.validation('Validation failed', { creditAccount: 'account not found' });
  if (!source.isCashAccount && !source.isBankAccount) {
    throw errors.validation('Validation failed', {
      creditAccount: `${source.accountCode} is neither a cash nor a bank account`,
    });
  }

  const posted = await posting.post({
    school, financialYear: fy._id, voucherType: 'payment',
    voucherDate: new Date(payload.paymentDate || Date.now()),
    narration: `Payment to ${inv.vendorName} — invoice ${inv.invoiceNumber}`,
    referenceNumber: payload.instrumentNumber || payload.bankReference,
    source: 'manual', postedBy: req?.user?._id,
    lines: [
      {
        account: creditors._id, debit: inv.grandTotal, credit: 0,
        narration: `Settling invoice ${inv.invoiceNumber}`,
        partyType: 'vendor', party: inv.vendor, partyName: inv.vendorName,
      },
      {
        account: source._id, debit: 0, credit: inv.grandTotal,
        narration: `${payload.paymentMode}${payload.instrumentNumber ? ' ' + payload.instrumentNumber : ''}`,
        partyType: 'vendor', party: inv.vendor, partyName: inv.vendorName,
      },
    ],
  });

  const before = inv.toObject();
  inv.invoiceStatus = 'paid';
  inv.paymentVoucher = posted.voucher._id;
  inv.paidAt = new Date();
  inv.updatedBy = req?.user?._id;
  await inv.save();

  const po = await FmsPurchaseOrder.findById(inv.purchaseOrder);
  const pr = po ? await FmsPurchaseRequest.findById(po.purchaseRequest) : null;
  if (pr && pr.purchaseStatus === 'invoiceVerified') {
    pr.purchaseStatus = 'paid';
    pr.workflow.push(step(req, 'pay', 'invoiceVerified', 'paid', posted.voucher.voucherNumber));
    await pr.save();
  }

  await audit({ school, entity: 'fms_purchaseinvoices', doc: inv, action: 'post', before, after: inv.toObject(), req });
  return { invoice: inv, voucher: posted.voucher, entries: posted.entries };
}

/** Close a fully paid request. */
async function closeRequest(school, prId, req) {
  const pr = await FmsPurchaseRequest.findOne({ _id: prId, school });
  if (!pr) throw errors.notFound('Purchase request');
  if (pr.purchaseStatus !== 'paid') {
    throw errors.conflict(`Only a paid request can be closed (this one is ${pr.purchaseStatus})`);
  }

  const before = pr.toObject();
  pr.purchaseStatus = 'closed';
  pr.workflow.push(step(req, 'close', 'paid', 'closed'));
  await pr.save();

  await audit({ school, entity: 'fms_purchaserequests', doc: pr, action: 'update', before, after: pr.toObject(), req });
  return pr;
}

/** Cancel. Blocked once anything has been received — goods are already here. */
async function cancelRequest(school, prId, req, reason) {
  const pr = await FmsPurchaseRequest.findOne({ _id: prId, school });
  if (!pr) throw errors.notFound('Purchase request');

  if (['paid', 'closed', 'cancelled'].includes(pr.purchaseStatus)) {
    throw errors.conflict(`Cannot cancel a ${pr.purchaseStatus} request`);
  }
  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', { reason: 'is required' });
  }

  const received = await FmsGoodsReceipt.countDocuments({
    school, purchaseOrder: { $in: (await FmsPurchaseOrder.find({ school, purchaseRequest: pr._id }).distinct('_id')) },
  });
  if (received > 0) {
    throw errors.conflict(
      'Goods have already been received against this request',
      { hint: 'Return the goods and raise a credit note; cancelling would leave stock unaccounted for.' }
    );
  }

  const before = pr.toObject();
  pr.purchaseStatus = 'cancelled';
  pr.cancelledBy = req?.user?._id;
  pr.cancelledAt = new Date();
  pr.cancellationReason = reason;
  pr.workflow.push(step(req, 'cancel', before.purchaseStatus, 'cancelled', reason));
  await pr.save();

  await FmsPurchaseOrder.updateMany(
    { school, purchaseRequest: pr._id, poStatus: { $ne: 'cancelled' } },
    { $set: { poStatus: 'cancelled', cancelledBy: req?.user?._id, cancelledAt: new Date(), cancellationReason: reason } }
  );

  await audit({ school, entity: 'fms_purchaserequests', doc: pr, action: 'cancel', before, after: pr.toObject(), req });
  return pr;
}

module.exports = {
  createRequest, addQuotation, selectQuotation, approveRequest,
  issuePO, receiveGoods, recordInvoice, runMatch, verifyInvoice,
  payInvoice, closeRequest, cancelRequest, creditorsAccount,
};