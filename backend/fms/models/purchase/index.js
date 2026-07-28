// backend/fms/models/purchase/index.js
//
// The procure-to-pay chain. SRS M8 / FR-M8, BPMN WF2, screens SCR-30..35.
//
//   fms_purchaserequests   what we want, and the quotes we gathered
//   fms_purchaseorders     what we committed to buy, and at what rate
//   fms_goodsreceipts      what actually arrived, and what we accepted
//   fms_purchaseinvoices   what the vendor is asking to be paid
//
// ─── WHY FOUR COLLECTIONS AND NOT ONE ────────────────────────────────────────
// They are four different assertions made by four different people at four
// different times, and the whole point of a three-way match is that they can
// DISAGREE. Collapsing them into one document would make the disagreement
// unrepresentable, which is the same as not checking.
//
// ─── WHERE THE LEDGER IS TOUCHED ─────────────────────────────────────────────
//   invoice verified  →  Dr expense/asset   Cr Sundry Creditors   (payable)
//   payment made      →  Dr Sundry Creditors  Cr Cash/Bank        (settled)
//
// Two stages, unlike a direct expense payment (P3.4), because goods taken on
// credit create a liability before any money moves. The payable is posted on
// INVOICE VERIFICATION rather than on receipt: the GRN says what arrived, the
// invoice says what is owed, and those are not always the same number.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const PURCHASE_STATUS = [
  'requested', 'quoted', 'approved', 'poIssued',
  'goodsReceived', 'invoiceVerified', 'paid', 'closed', 'cancelled',
];
const PO_STATUS = ['issued', 'partiallyReceived', 'received', 'closed', 'cancelled'];
const GRN_STATUS = ['draft', 'accepted', 'partiallyAccepted', 'rejected'];
const INVOICE_STATUS = ['pending', 'verified', 'disputed', 'paid', 'cancelled', 'rejected'];

// ─────────────────────────────────────────────────────────────────────────────
// Purchase request
// ─────────────────────────────────────────────────────────────────────────────

const RequestItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  specification: { type: String },
  quantity: { type: Number, required: true, min: 1 },
  unit: { type: String, default: 'nos' },
  estimatedRate: { type: Number, default: 0 },     // integer paise
  estimatedAmount: { type: Number, default: 0 },
  budgetHead: { type: ObjectId },                  // fms_accounts._id
  budgetHeadCode: { type: String },
}, { _id: true });

const QuotationItemSchema = new mongoose.Schema({
  prItemId: { type: ObjectId, required: true },
  rate: { type: Number, required: true, min: 0 },  // integer paise
  amount: { type: Number, required: true, min: 0 },
  deliveryDays: { type: Number },
  remarks: { type: String },
}, { _id: false });

const QuotationSchema = new mongoose.Schema({
  vendor: { type: ObjectId, required: true },
  vendorName: { type: String, required: true },
  quoteNumber: { type: String },
  quoteDate: { type: Date },
  validUntil: { type: Date },

  items: [QuotationItemSchema],
  subTotal: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },

  deliveryDays: { type: Number },
  paymentTerms: { type: String },
  attachmentUrl: { type: String },

  selected: { type: Boolean, default: false },
  /**
   * Required whenever the chosen quote is not the cheapest. Selecting a dearer
   * supplier is often right — quality, delivery, a working relationship — but
   * it is exactly the decision an auditor asks about, and it should be
   * answerable without anyone having to remember.
   */
  selectionReason: { type: String },
  receivedBy: { type: ObjectId },
  receivedAt: { type: Date, default: Date.now },
}, { _id: true });

const PurchaseRequestSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  prNumber: { type: String, required: true },
  requestDate: { type: Date, required: true },
  requiredBy: { type: Date },

  department: {
    name: { type: String, required: true },
    ref: { type: ObjectId, default: null },
  },
  requestedBy: { type: ObjectId, required: true },
  requestedByName: { type: String },

  purpose: { type: String, required: true },
  justification: { type: String },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },

  items: {
    type: [RequestItemSchema],
    validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'At least one item is required' },
  },
  estimatedTotal: { type: Number, default: 0 },

  quotations: [QuotationSchema],
  selectedQuotation: { type: ObjectId, default: null },

  purchaseStatus: { type: String, enum: PURCHASE_STATUS, default: 'requested', index: true },

  approvedBy: { type: ObjectId },
  approvedAt: { type: Date },
  approvalComment: { type: String },
  budgetCheck: { type: mongoose.Schema.Types.Mixed },

  cancelledBy: { type: ObjectId },
  cancelledAt: { type: Date },
  cancellationReason: { type: String },

  workflow: [{
    action: String, actor: ObjectId, actorEmail: String, actorRole: String,
    comment: String, fromStatus: String, toStatus: String,
    at: { type: Date, default: Date.now },
  }],

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_purchaserequests' });

PurchaseRequestSchema.pre('validate', async function () {
  this.estimatedTotal = (this.items || []).reduce((s, i) => s + (i.estimatedAmount || 0), 0);
  for (const q of this.quotations || []) {
    const sub = (q.items || []).reduce((s, i) => s + (i.amount || 0), 0);
    if (q.subTotal !== sub) q.subTotal = sub;
    const total = sub + (q.gstAmount || 0) + (q.otherCharges || 0);
    if (q.grandTotal !== total) q.grandTotal = total;
  }
});

PurchaseRequestSchema.index({ school: 1, prNumber: 1 }, { unique: true });
PurchaseRequestSchema.index({ school: 1, purchaseStatus: 1, requestDate: -1 });
PurchaseRequestSchema.index({ school: 1, requestedBy: 1, purchaseStatus: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// Purchase order
// ─────────────────────────────────────────────────────────────────────────────

const OrderItemSchema = new mongoose.Schema({
  prItemId: { type: ObjectId },
  description: { type: String, required: true },
  specification: { type: String },
  quantity: { type: Number, required: true, min: 1 },
  unit: { type: String, default: 'nos' },
  rate: { type: Number, required: true, min: 0 },     // integer paise
  amount: { type: Number, required: true, min: 0 },
  gstRate: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  budgetHead: { type: ObjectId, required: true },
  budgetHeadCode: { type: String },

  // Running tallies, maintained as GRNs and invoices arrive. Derived facts
  // cached here because the PO screen needs them on every row.
  receivedQty: { type: Number, default: 0 },
  acceptedQty: { type: Number, default: 0 },
  invoicedQty: { type: Number, default: 0 },
}, { _id: true });

const PurchaseOrderSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  poNumber: { type: String, required: true },
  poDate: { type: Date, required: true },

  purchaseRequest: { type: ObjectId, required: true },
  prNumber: { type: String },
  quotationId: { type: ObjectId },

  vendor: { type: ObjectId, required: true },
  vendorName: { type: String, required: true },
  vendorGstin: { type: String },

  items: {
    type: [OrderItemSchema],
    validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'At least one item is required' },
  },

  subTotal: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },

  deliveryDate: { type: Date },
  deliveryAddress: { type: String },
  paymentTerms: { type: String },
  terms: { type: String },

  poStatus: { type: String, enum: PO_STATUS, default: 'issued', index: true },

  issuedBy: { type: ObjectId },
  issuedAt: { type: Date },
  cancelledBy: { type: ObjectId },
  cancelledAt: { type: Date },
  cancellationReason: { type: String },

  printCount: { type: Number, default: 0 },
  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_purchaseorders' });

PurchaseOrderSchema.pre('validate', async function () {
  this.subTotal = (this.items || []).reduce((s, i) => s + (i.amount || 0), 0);
  this.gstAmount = (this.items || []).reduce((s, i) => s + (i.gstAmount || 0), 0);
  this.grandTotal = this.subTotal + this.gstAmount + (this.otherCharges || 0);

  for (const i of this.items || []) {
    for (const k of ['quantity', 'rate', 'amount']) {
      if (!Number.isInteger(i[k]) && k !== 'quantity') {
        throw new Error(`purchaseOrder: item ${k} must be integer paise`);
      }
    }
  }
});

PurchaseOrderSchema.index({ school: 1, poNumber: 1 }, { unique: true });
PurchaseOrderSchema.index({ school: 1, poStatus: 1, poDate: -1 });
PurchaseOrderSchema.index({ school: 1, vendor: 1, poDate: -1 });
PurchaseOrderSchema.index({ school: 1, purchaseRequest: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// Goods receipt
// ─────────────────────────────────────────────────────────────────────────────

const ReceiptItemSchema = new mongoose.Schema({
  poItemId: { type: ObjectId, required: true },
  description: { type: String },
  orderedQty: { type: Number },
  receivedQty: { type: Number, required: true, min: 0 },
  acceptedQty: { type: Number, required: true, min: 0 },
  rejectedQty: { type: Number, default: 0, min: 0 },
  rejectionReason: { type: String },
  rate: { type: Number },
  amount: { type: Number },
}, { _id: true });

const GoodsReceiptSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  grnNumber: { type: String, required: true },
  grnDate: { type: Date, required: true },

  purchaseOrder: { type: ObjectId, required: true },
  poNumber: { type: String },
  vendor: { type: ObjectId, required: true },
  vendorName: { type: String },

  challanNumber: { type: String },
  challanDate: { type: Date },
  vehicleNumber: { type: String },

  items: [ReceiptItemSchema],
  totalValue: { type: Number, default: 0 },

  grnStatus: { type: String, enum: GRN_STATUS, default: 'draft', index: true },

  receivedBy: { type: ObjectId },
  inspectedBy: { type: ObjectId },
  inspectedAt: { type: Date },
  inspectionNote: { type: String },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_goodsreceipts' });

GoodsReceiptSchema.pre('validate', async function () {
  for (const i of this.items || []) {
    const accepted = i.acceptedQty || 0;
    const rejected = i.rejectedQty || 0;
    if (accepted + rejected !== i.receivedQty) {
      throw new Error(
        `goodsReceipt: accepted (${accepted}) + rejected (${rejected}) must equal ` +
        `received (${i.receivedQty}) — every unit that arrived is either usable or not`
      );
    }
    if (rejected > 0 && !i.rejectionReason) {
      throw new Error('goodsReceipt: rejected goods need a reason');
    }
  }
  this.totalValue = (this.items || []).reduce((s, i) => s + (i.amount || 0), 0);
});

GoodsReceiptSchema.index({ school: 1, grnNumber: 1 }, { unique: true });
GoodsReceiptSchema.index({ school: 1, purchaseOrder: 1, grnDate: 1 });
GoodsReceiptSchema.index({ school: 1, vendor: 1, grnDate: -1 });

// ─────────────────────────────────────────────────────────────────────────────
// Purchase invoice
// ─────────────────────────────────────────────────────────────────────────────

const InvoiceItemSchema = new mongoose.Schema({
  itemId: { type: ObjectId, required: true },        // the PO item
  description: { type: String },
  quantity: { type: Number, required: true, min: 0 },
  rate: { type: Number, required: true, min: 0 },    // integer paise
  amount: { type: Number, required: true, min: 0 },
}, { _id: true });

const PurchaseInvoiceSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  /** The VENDOR's invoice number — theirs, not ours. */
  invoiceNumber: { type: String, required: true },
  invoiceDate: { type: Date, required: true },
  receivedDate: { type: Date, default: Date.now },

  purchaseOrder: { type: ObjectId, required: true },
  poNumber: { type: String },
  goodsReceipts: [{ type: ObjectId }],
  vendor: { type: ObjectId, required: true },
  vendorName: { type: String },

  items: [InvoiceItemSchema],
  subTotal: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true, min: 1 },

  /** The three-way match result at the moment of verification. */
  matchResult: { type: mongoose.Schema.Types.Mixed },

  invoiceStatus: { type: String, enum: INVOICE_STATUS, default: 'pending', index: true },

  verifiedBy: { type: ObjectId },
  verifiedAt: { type: Date },
  verificationNote: { type: String },

  /**
   * Set when a blocking discrepancy is overridden. An override is sometimes
   * legitimate — a renegotiated rate, an agreed substitution — but it must be
   * a deliberate, attributed act rather than a silent pass.
   */
  overriddenBy: { type: ObjectId },
  overrideReason: { type: String },

  disputedReason: { type: String },

  payableVoucher: { type: ObjectId, default: null },   // the Cr Creditors posting
  paymentVoucher: { type: ObjectId, default: null },   // the settlement
  paidAt: { type: Date },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_purchaseinvoices' });

PurchaseInvoiceSchema.pre('validate', async function () {
  this.subTotal = (this.items || []).reduce((s, i) => s + (i.amount || 0), 0);
  if (!this.grandTotal) {
    this.grandTotal = this.subTotal + (this.gstAmount || 0) + (this.otherCharges || 0);
  }
});

// A vendor's invoice number is unique to that vendor. The same number from two
// different vendors is normal; the same number twice from one vendor is a
// duplicate bill, which is exactly what this prevents.
PurchaseInvoiceSchema.index(
  { school: 1, vendor: 1, invoiceNumber: 1 },
  { unique: true }
);
PurchaseInvoiceSchema.index({ school: 1, invoiceStatus: 1, invoiceDate: -1 });
PurchaseInvoiceSchema.index({ school: 1, purchaseOrder: 1 });

// ─────────────────────────────────────────────────────────────────────────────

const NEVER_DELETE = ['deleteOne', 'deleteMany', 'findOneAndDelete'];
for (const [schema, label] of [
  [PurchaseRequestSchema, 'purchase requests'],
  [PurchaseOrderSchema, 'purchase orders'],
  [GoodsReceiptSchema, 'goods receipts'],
  [PurchaseInvoiceSchema, 'purchase invoices'],
]) {
  NEVER_DELETE.forEach((op) =>
    schema.pre(op, { query: true, document: false }, async function () {
      throw new Error(`${label} are cancelled, never deleted`);
    })
  );
}

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsPurchaseRequest: reg('FmsPurchaseRequest', PurchaseRequestSchema),
  FmsPurchaseOrder: reg('FmsPurchaseOrder', PurchaseOrderSchema),
  FmsGoodsReceipt: reg('FmsGoodsReceipt', GoodsReceiptSchema),
  FmsPurchaseInvoice: reg('FmsPurchaseInvoice', PurchaseInvoiceSchema),
  PURCHASE_STATUS, PO_STATUS, GRN_STATUS, INVOICE_STATUS,
};