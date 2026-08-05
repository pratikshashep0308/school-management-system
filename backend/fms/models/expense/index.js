// backend/fms/models/expense/index.js
//
// fms_expenserequests — a REQUEST to spend money. SRS M4 / FR-M4,
// screens SCR-14/15/16/17.
//
// ─── THIS DOES NOT POST TO THE LEDGER ────────────────────────────────────────
// An expense request is a workflow document, not an accounting event. Nothing
// has been spent yet. The ledger is touched at PAYMENT (P3.4), which is when
// money actually moves.
//
// That distinction matters: posting a payable the moment someone types a
// request would put unapproved, possibly rejected spending into the books.
//
// ─── FORWARD DEPENDENCIES, HONESTLY HELD ─────────────────────────────────────
// Vendors are P4.2 and departments are P4.x. Neither collection exists yet, so
// both are stored as a name plus a nullable reference. When those modules land,
// the reference is populated and the name stays as the denormalised snapshot —
// no migration of existing records needed, and no fake foreign key in the
// meantime.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

/**
 * P3.2 covers draft → submitted. The full chain
 * (accountsVerified → principalApproved → chairmanApproved → paymentPending →
 * paymentCompleted → closed, plus rejected / returned / cancelled)
 * arrives with the approval workflow in P3.3.
 */
const EXPENSE_STATUS = [
  'draft', 'submitted',
  'accountsVerified', 'principalApproved', 'chairmanApproved',
  'paymentPending', 'paymentCompleted', 'closed',
  'rejected', 'returned', 'cancelled',
];

const PRIORITY = ['low', 'normal', 'high', 'urgent'];
const PAYMENT_MODE = ['cash', 'cheque', 'neft', 'rtgs', 'upi', 'dd'];
const GST_TYPE = ['none', 'intra', 'inter'];

const ATTACHMENT_KIND = ['invoice', 'bill', 'quotation', 'purchaseOrder', 'challan', 'proof', 'other'];

const AttachmentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  url: { type: String, required: true },
  kind: { type: String, enum: ATTACHMENT_KIND, default: 'other' },
  mimeType: { type: String },
  sizeBytes: { type: Number },
  uploadedBy: { type: ObjectId },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const WorkflowStepSchema = new mongoose.Schema({
  action: { type: String, required: true },
  actor: { type: ObjectId, required: true },
  actorEmail: { type: String },
  // See the note on fms_expenseapprovals.actorName — the record must survive
  // the user being deleted.
  actorName: { type: String },
  actorRole: { type: String },
  comment: { type: String },
  fromStatus: { type: String },
  toStatus: { type: String },
  at: { type: Date, default: Date.now },
}, { _id: true });

const ExpenseRequestSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  expenseNumber: { type: String, required: true },   // EXP-2026-27-00001
  requestDate: { type: Date, required: true },

  // ── Who and where ────────────────────────────────────────────────────────
  department: {
    name: { type: String, required: true },
    ref: { type: ObjectId, default: null },          // fms_departments — P4.x
  },
  requestedBy: { type: ObjectId, required: true },    // SMS User._id
  requestedByName: { type: String },

  vendor: {
    name: { type: String },
    ref: { type: ObjectId, default: null },          // fms_vendors — P4.2
    gstin: { type: String },
    pan: { type: String },
  },

  // ── What ─────────────────────────────────────────────────────────────────
  category: { type: String, required: true },

  // Reference to fms_expensecategories. A FLAT field, not `category.ref` —
  // `category` above is a required String carrying live data, and converting it
  // to a {name, ref} object like `department` and `vendor` would fail to cast
  // on every existing request.
  //
  // Optional, and it does NOT replace budgetHead below. The category supplies a
  // DEFAULT for budgetHead when one is picked; budgetHead remains the field the
  // posting actually reads. Two fields claiming to decide the account is how
  // classification drifts — this one pre-fills, the other decides.
  categoryRef: { type: ObjectId, default: null },
  subCategory: { type: String },
  purpose: { type: String, required: true },
  remarks: { type: String },

  // The expense head this will eventually hit. Captured now so the budget
  // check and the later posting agree on where the money comes from.
  budgetHead: { type: ObjectId, required: true },    // fms_accounts._id
  budgetHeadCode: { type: String },
  budgetHeadName: { type: String },

  // ── Money — all integer paise ────────────────────────────────────────────
  baseAmount: { type: Number, required: true, min: 1 },
  gstType: { type: String, enum: GST_TYPE, default: 'none' },
  gstRate: { type: Number, default: 0 },             // percent, e.g. 18
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  otherTaxAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true, min: 1 },

  paymentMode: { type: String, enum: PAYMENT_MODE, required: true },

  // ── Who is being paid ────────────────────────────────────────────────────
  // `vendor` above covers the vendor case. This exists for the one it cannot:
  // a teacher who buys materials and claims the money back. Recording that as a
  // vendor corrupts the vendor ledger and misstates the accounts.
  payeeType: { type: String, enum: ['vendor', 'employee', 'other'], default: 'vendor' },
  payee: { type: ObjectId, default: null },     // fms_vendors._id or an SMS teacher _id
  payeeName: { type: String },

  // ── Cost centre ──────────────────────────────────────────────────────────
  // `costCenter` already exists on the journal and core models, so the ledger
  // can carry it. It was simply never on the request, which meant an expense
  // could not be attributed at the point it was raised.
  costCentre: { type: String, default: null },

  // ── TDS ──────────────────────────────────────────────────────────────────
  // GST is already fully modelled above (gstRate, cgst, sgst, igst, gstAmount).
  // TDS was genuinely absent. Posting is Dr expense (gross), Cr payment (net),
  // Cr 2103 TDS Payable — and the voucher balances or it does not post.
  tdsSection: { type: String, default: null },   // '194C', '194J', …
  tdsAmount: { type: Number, default: 0 },       // integer paise
  dueDate: { type: Date },
  priority: { type: String, enum: PRIORITY, default: 'normal' },

  // ── Budget check, recorded at submission ─────────────────────────────────
  // `checked: false` means nobody looked — not that it passed. Conflating the
  // two would let an unbudgeted request look approved-by-silence.
  budgetCheck: {
    checked: { type: Boolean, default: false },
    reason: { type: String },
    budgetId: { type: ObjectId, default: null },
    budgetAmount: { type: Number },
    consumed: { type: Number },
    available: { type: Number },
    outcome: { type: String, enum: ['ok', 'warning', 'exceeded', 'notChecked'], default: 'notChecked' },
    // The policy that governed the decision. Without it, an auditor asking
    // "why was this over-budget request allowed through?" cannot tell whether
    // the head was configured to warn or whether a control was bypassed.
    policy: { type: String, enum: ['block', 'warn', null], default: null },
    blocking: { type: Boolean, default: null },
    checkedAt: { type: Date },
  },

  expenseStatus: { type: String, enum: EXPENSE_STATUS, default: 'draft', index: true },

  attachments: [AttachmentSchema],
  workflow: [WorkflowStepSchema],

  submittedBy: { type: ObjectId },
  submittedAt: { type: Date },
  cancelledBy: { type: ObjectId },
  cancelledAt: { type: Date },
  cancellationReason: { type: String },

  // ── Ingest linkage (P5.3) ────────────────────────────────────────────────
  // Set when this record was imported from an SMS Expense rather than raised
  // here. Such a record is recorded as COMPLETED with an empty approval chain,
  // because the money was already spent when the SMS recorded it — running it
  // through the FMS workflow retroactively would manufacture approvals that
  // never happened.
  sourceSystem: { type: String, enum: ['sms', null], default: null },
  sourceExpenseId: { type: ObjectId, default: null },
  /** The SMS category had no mapping, so this went to Other Expenses. */
  needsReclassification: { type: Boolean, default: false },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_expenserequests' });

/**
 * Money consistency, enforced at the schema layer so no code path can save an
 * expense whose parts do not add up.
 */
ExpenseRequestSchema.pre('validate', async function () {
  const ints = { baseAmount: this.baseAmount, cgst: this.cgst, sgst: this.sgst,
    igst: this.igst, otherTaxAmount: this.otherTaxAmount };
  for (const [k, v] of Object.entries(ints)) {
    if (v !== undefined && v !== null && !Number.isInteger(v)) {
      throw new Error(`expense: ${k} must be integer paise, not float rupees`);
    }
  }

  // Intra-state is CGST + SGST; inter-state is IGST. Both together is not a
  // thing, and getting it wrong has tax consequences.
  if (this.gstType === 'intra' && this.igst > 0) {
    throw new Error('expense: intra-state GST uses CGST + SGST, not IGST');
  }
  if (this.gstType === 'inter' && (this.cgst > 0 || this.sgst > 0)) {
    throw new Error('expense: inter-state GST uses IGST, not CGST/SGST');
  }
  if (this.gstType === 'none' && (this.cgst > 0 || this.sgst > 0 || this.igst > 0)) {
    throw new Error('expense: gstType is none but GST components are non-zero');
  }

  this.gstAmount = (this.cgst || 0) + (this.sgst || 0) + (this.igst || 0);

  const computed = (this.baseAmount || 0) + this.gstAmount + (this.otherTaxAmount || 0);
  if (this.totalAmount !== computed) {
    throw new Error(
      `expense: totalAmount ${this.totalAmount} ≠ base ${this.baseAmount} + ` +
      `GST ${this.gstAmount} + other tax ${this.otherTaxAmount || 0} = ${computed}`
    );
  }
});

ExpenseRequestSchema.methods.isEditable = function () {
  return ['draft', 'returned', 'rejected'].includes(this.expenseStatus);
};

ExpenseRequestSchema.index({ school: 1, expenseNumber: 1 }, { unique: true });
// The SMS expense id is the import idempotency key — a unique partial index
// makes a replayed cycle impossible at the database.
ExpenseRequestSchema.index(
  { school: 1, sourceExpenseId: 1 },
  { unique: true, partialFilterExpression: { sourceExpenseId: { $type: 'objectId' } } }
);
ExpenseRequestSchema.index({ school: 1, expenseStatus: 1, requestDate: -1 });
ExpenseRequestSchema.index({ school: 1, financialYear: 1, requestDate: -1 });
ExpenseRequestSchema.index({ school: 1, requestedBy: 1, expenseStatus: 1 });
ExpenseRequestSchema.index({ school: 1, budgetHead: 1, expenseStatus: 1 });
ExpenseRequestSchema.index({ school: 1, 'department.name': 1, requestDate: -1 });

// Never deleted — a rejected or abandoned request is part of the record of
// what was asked for.
['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  ExpenseRequestSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_expenserequests: expense requests are cancelled, never deleted');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsExpenseRequest: reg('FmsExpenseRequest', ExpenseRequestSchema),
  EXPENSE_STATUS, PRIORITY, PAYMENT_MODE, GST_TYPE, ATTACHMENT_KIND,
};