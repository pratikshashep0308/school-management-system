// backend/fms/routes/purchase.js
//
// Procure-to-pay — SRS M8 / FR-M8, BPMN WF2, screens SCR-30..35.
//
// RBAC per the matrix: `purchase` gives 'edit' to purchaseOfficer and deptHead,
// 'admin' to principal and vicePrincipal (approval), 'read' to the rest.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const {
  FmsPurchaseRequest, FmsPurchaseOrder, FmsGoodsReceipt, FmsPurchaseInvoice,
  PURCHASE_STATUS, PO_STATUS, INVOICE_STATUS,
} = require('../models/purchase');
const svc = require('../services/purchase/purchaseService');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

// ─── Requests ────────────────────────────────────────────────────────────────

router.get('/requests', fmsAuthorize('purchase', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['requestDate', 'prNumber', 'estimatedTotal', 'priority'], defaultSort: '-requestDate',
  });

  const filter = { school: req.fmsScope.school };
  if (req.query.purchaseStatus) {
    if (!PURCHASE_STATUS.includes(req.query.purchaseStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.purchaseStatus}'`, { allowed: PURCHASE_STATUS });
    }
    filter.purchaseStatus = req.query.purchaseStatus;
  }
  if (req.query.mine === 'true') filter.requestedBy = req.user._id;
  if (req.query.department) filter['department.name'] = req.query.department;

  const [items, total] = await Promise.all([
    FmsPurchaseRequest.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsPurchaseRequest.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
}));

router.get('/requests/:id', fmsAuthorize('purchase', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsPurchaseRequest.findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!doc) throw errors.notFound('Purchase request');

  const orders = await FmsPurchaseOrder.find({ school: req.fmsScope.school, purchaseRequest: doc._id }).lean();
  return ok(res, { ...doc, purchaseOrders: orders });
}));

router.post('/requests', fmsAuthorize('purchase', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    purpose: { required: true, rules: [check.nonEmpty] },
    items: { required: true, rules: [check.array] },
    requestDate: { rules: [check.date] },
    requiredBy: { rules: [check.date] },
  });
  if (!req.body.department?.name) {
    throw errors.validation('Validation failed', { 'department.name': 'is required' });
  }
  const doc = await svc.createRequest(req.fmsScope.school, req.body, req);
  return created(res, doc, `Purchase request ${doc.prNumber} created`);
}));

/** POST a quotation received from a vendor (SCR-32). */
router.post('/requests/:id/quotations', fmsAuthorize('purchase', 'CREATE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    vendor: { required: true, rules: [check.objectId] },
    vendorName: { required: true, rules: [check.nonEmpty] },
    items: { required: true, rules: [check.array] },
    gstAmount: { rules: [check.paise] },
    otherCharges: { rules: [check.paise] },
  });
  const doc = await svc.addQuotation(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, doc, { message: 'Quotation recorded' });
}));

/**
 * Select a quotation. Anything but the cheapest needs a reason — it is often
 * the right call, and it is always the first thing an auditor asks about.
 */
router.post('/requests/:id/select-quotation', fmsAuthorize('purchase', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    quotationId: { required: true, rules: [check.objectId] },
    reason: { rules: [check.string] },
  });
  const r = await svc.selectQuotation(req.fmsScope.school, req.params.id, req.body.quotationId, req, req.body.reason);
  return ok(res, {
    request: r.request, selected: r.selected, wasCheapest: r.wasCheapest,
  }, { message: r.wasCheapest ? 'Lowest quotation selected' : 'Quotation selected with a recorded reason' });
}));

router.post('/requests/:id/approve', fmsAuthorize('purchase', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await svc.approveRequest(req.fmsScope.school, req.params.id, req, req.body || {});
  return ok(res, doc, { message: 'Purchase request approved' });
}));

router.post('/requests/:id/cancel', fmsAuthorize('purchase', 'CANCEL'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, { reason: { required: true, rules: [check.nonEmpty] } });
  const doc = await svc.cancelRequest(req.fmsScope.school, req.params.id, req, req.body.reason);
  return ok(res, doc, { message: 'Purchase request cancelled' });
}));

router.post('/requests/:id/close', fmsAuthorize('purchase', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await svc.closeRequest(req.fmsScope.school, req.params.id, req);
  return ok(res, doc, { message: 'Purchase request closed' });
}));

// ─── Purchase orders ─────────────────────────────────────────────────────────

router.get('/orders', fmsAuthorize('purchase', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['poDate', 'poNumber', 'grandTotal'], defaultSort: '-poDate',
  });
  const filter = { school: req.fmsScope.school };
  if (req.query.poStatus) {
    if (!PO_STATUS.includes(req.query.poStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.poStatus}'`, { allowed: PO_STATUS });
    }
    filter.poStatus = req.query.poStatus;
  }
  if (req.query.vendor) {
    if (check.objectId(req.query.vendor)) throw errors.badRequest('Invalid vendor id');
    filter.vendor = req.query.vendor;
  }
  const [items, total] = await Promise.all([
    FmsPurchaseOrder.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsPurchaseOrder.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
}));

router.get('/orders/:id', fmsAuthorize('purchase', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const po = await FmsPurchaseOrder.findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!po) throw errors.notFound('Purchase order');

  const [grns, invoices] = await Promise.all([
    FmsGoodsReceipt.find({ school: req.fmsScope.school, purchaseOrder: po._id }).lean(),
    FmsPurchaseInvoice.find({ school: req.fmsScope.school, purchaseOrder: po._id }).lean(),
  ]);
  return ok(res, { ...po, goodsReceipts: grns, invoices });
}));

router.post('/requests/:id/issue-po', fmsAuthorize('purchase', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const r = await svc.issuePO(req.fmsScope.school, req.params.id, req.body || {}, req);
  return created(res, {
    purchaseOrder: r.purchaseOrder,
    request: { _id: r.request._id, prNumber: r.request.prNumber, purchaseStatus: r.request.purchaseStatus },
  }, `Purchase order ${r.purchaseOrder.poNumber} issued`);
}));

// ─── Goods receipts ──────────────────────────────────────────────────────────

router.get('/receipts', fmsAuthorize('purchase', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['grnDate', 'grnNumber'], defaultSort: '-grnDate',
  });
  const filter = { school: req.fmsScope.school };
  if (req.query.purchaseOrder) {
    if (check.objectId(req.query.purchaseOrder)) throw errors.badRequest('Invalid purchaseOrder id');
    filter.purchaseOrder = req.query.purchaseOrder;
  }
  const [items, total] = await Promise.all([
    FmsGoodsReceipt.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsGoodsReceipt.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
}));

/**
 * Record goods received. Accepted + rejected must equal received — every unit
 * that arrived is either usable or it is not.
 */
router.post('/orders/:id/receive', fmsAuthorize('purchase', 'CREATE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    items: { required: true, rules: [check.array] },
    grnDate: { rules: [check.date] },
    challanNumber: { rules: [check.string] },
  });
  const r = await svc.receiveGoods(req.fmsScope.school, req.params.id, req.body, req);
  return created(res, {
    goodsReceipt: r.goodsReceipt,
    purchaseOrder: { _id: r.purchaseOrder._id, poNumber: r.purchaseOrder.poNumber, poStatus: r.purchaseOrder.poStatus },
  }, `Goods receipt ${r.goodsReceipt.grnNumber} recorded`);
}));

// ─── Invoices ────────────────────────────────────────────────────────────────

router.get('/invoices', fmsAuthorize('purchase', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['invoiceDate', 'grandTotal'], defaultSort: '-invoiceDate',
  });
  const filter = { school: req.fmsScope.school };
  if (req.query.invoiceStatus) {
    if (!INVOICE_STATUS.includes(req.query.invoiceStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.invoiceStatus}'`, { allowed: INVOICE_STATUS });
    }
    filter.invoiceStatus = req.query.invoiceStatus;
  }
  const [items, total] = await Promise.all([
    FmsPurchaseInvoice.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsPurchaseInvoice.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
}));

router.get('/invoices/:id', fmsAuthorize('purchase', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsPurchaseInvoice.findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!doc) throw errors.notFound('Purchase invoice');
  return ok(res, doc);
}));

router.post('/orders/:id/invoices', fmsAuthorize('purchase', 'CREATE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    invoiceNumber: { required: true, rules: [check.nonEmpty] },
    invoiceDate: { required: true, rules: [check.date] },
    items: { required: true, rules: [check.array] },
    grandTotal: { required: true, rules: [check.paise] },
    gstAmount: { rules: [check.paise] },
    otherCharges: { rules: [check.paise] },
  });
  const doc = await svc.recordInvoice(req.fmsScope.school, req.params.id, req.body, req);
  return created(res, doc, `Invoice ${doc.invoiceNumber} recorded — run the three-way match to verify`);
}));

/** Preview the three-way match without changing anything. */
router.get('/invoices/:id/match', fmsAuthorize('purchase', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  return ok(res, await svc.runMatch(req.fmsScope.school, req.params.id));
}));

/**
 * Verify an invoice and post the payable.
 * A blocking discrepancy stops verification unless explicitly overridden.
 */
router.post('/invoices/:id/verify', fmsAuthorize('purchase', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body || {}, {
    note: { rules: [check.string] },
    override: { rules: [check.boolean] },
    overrideReason: { rules: [check.string] },
  });
  const r = await svc.verifyInvoice(req.fmsScope.school, req.params.id, req, req.body || {});
  return ok(res, {
    invoice: r.invoice,
    payableVoucher: { _id: r.voucher._id, voucherNumber: r.voucher.voucherNumber },
    matchResult: r.matchResult,
  }, { message: `Verified — payable posted as ${r.voucher.voucherNumber}` });
}));

/** Settle a verified invoice: Dr Sundry Creditors, Cr Cash/Bank. */
router.post('/invoices/:id/pay', fmsAuthorize('purchase', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    creditAccount: { required: true, rules: [check.objectId] },
    paymentMode: { required: true, rules: [check.enumOf(['cash', 'cheque', 'neft', 'rtgs', 'upi', 'dd'])] },
    instrumentNumber: { rules: [check.string] },
    bankReference: { rules: [check.string] },
    paymentDate: { rules: [check.date] },
  });
  const r = await svc.payInvoice(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, {
    invoice: r.invoice,
    paymentVoucher: { _id: r.voucher._id, voucherNumber: r.voucher.voucherNumber },
  }, { message: `Paid — ${r.voucher.voucherNumber}` });
}));

module.exports = router;