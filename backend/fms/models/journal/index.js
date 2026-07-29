// backend/fms/models/journal/index.js
//
// fms_journalvouchers — MANUAL journal vouchers.
//
// ─── WHY THIS IS A SEPARATE COLLECTION ───────────────────────────────────────
// A draft JV is not a posting. It is a *proposal* for one. It can be edited,
// rejected, abandoned — none of which a ledger entry may ever be.
//
// So the draft lives here with its lines embedded, and only on approval does it
// go through LedgerPostingService, which creates the real fms_vouchers header
// and the append-only fms_ledgerentries rows. Once that happens the JV holds a
// reference to them and becomes immutable itself.
//
// Keeping the two apart is what lets a JV be a workflow document while the
// ledger stays a permanent record.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

/**
 * DRAFT       created, editable by its author
 * SUBMITTED   sent for approval, locked to the author
 * POSTED      approved and written to the ledger — immutable
 * REJECTED    sent back; editable again
 * CANCELLED   abandoned before posting; terminal, never deleted
 * REVERSED    was posted, then reversed by an opposite posting
 */
const JV_STATUS = ['draft', 'submitted', 'posted', 'rejected', 'cancelled', 'reversed'];

/**
 * A proposed ledger line. Same shape LedgerPostingService.post() expects, so
 * approval hands them straight over with no translation — a translation step
 * is somewhere a bug could change an amount.
 */
const JournalLineSchema = new mongoose.Schema({
  account: { type: ObjectId, required: true },        // fms_accounts._id
  accountCode: { type: String },                       // denormalised for display
  accountName: { type: String },
  debit: { type: Number, default: 0, min: 0 },         // integer paise
  credit: { type: Number, default: 0, min: 0 },        // integer paise
  narration: { type: String, default: '' },
  partyType: { type: String, enum: ['vendor', 'student', 'teacher', 'other', null], default: null },
  party: { type: ObjectId, default: null },
  partyName: { type: String },
  department: { type: ObjectId, default: null },
  costCenter: { type: String },
}, { _id: true });

JournalLineSchema.pre('validate', async function () {
  const dr = this.debit || 0;
  const cr = this.credit || 0;
  if (!Number.isInteger(dr) || !Number.isInteger(cr)) {
    throw new Error('journal line: amounts must be integer paise, not float rupees');
  }
  if ((dr > 0 && cr > 0) || (dr === 0 && cr === 0)) {
    throw new Error('journal line: exactly one of debit/credit must be non-zero');
  }
});

/**
 * An attachment REFERENCE, not the file.
 *
 * Files go through the SMS's existing upload route (`multer` → local disk).
 * Duplicating that machinery here would mean two upload paths, two storage
 * locations and two things to back up.
 */
const AttachmentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  url: { type: String, required: true },
  mimeType: { type: String },
  sizeBytes: { type: Number },
  kind: {
    type: String,
    enum: ['invoice', 'bill', 'voucher', 'correspondence', 'other'],
    default: 'other',
  },
  uploadedBy: { type: ObjectId },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

/** One step of the approval trail. Append-only in practice — never rewritten. */
const WorkflowStepSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['create', 'update', 'submit', 'approve', 'reject', 'cancel', 'reverse'],
    required: true,
  },
  actor: { type: ObjectId, required: true },
  actorEmail: { type: String },
  actorRole: { type: String },
  comment: { type: String },
  fromStatus: { type: String },
  toStatus: { type: String },
  at: { type: Date, default: Date.now },
}, { _id: true });

const JournalVoucherSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  jvDate: { type: Date, required: true },
  narration: { type: String, required: true, trim: true },
  reference: { type: String },                          // free-text external ref

  lines: {
    type: [JournalLineSchema],
    validate: {
      validator: (v) => Array.isArray(v) && v.length >= 2,
      message: 'A journal voucher needs at least two lines',
    },
  },

  totalDebit: { type: Number, default: 0 },             // integer paise
  totalCredit: { type: Number, default: 0 },

  jvStatus: { type: String, enum: JV_STATUS, default: 'draft', index: true },

  attachments: [AttachmentSchema],
  workflow: [WorkflowStepSchema],

  // Set only once posted. Their presence is what makes this JV immutable.
  voucher: { type: ObjectId, default: null },           // fms_vouchers._id
  voucherNumber: { type: String, default: null },
  postedBy: { type: ObjectId },
  postedAt: { type: Date },

  submittedBy: { type: ObjectId },
  submittedAt: { type: Date },
  rejectedBy: { type: ObjectId },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },

  reversalVoucher: { type: ObjectId, default: null },
  reversedBy: { type: ObjectId },
  reversedAt: { type: Date },
  reversalReason: { type: String },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_journalvouchers' });

// Keep the totals honest on every save, so a stale total can never be the
// thing that lets an unbalanced JV through.
JournalVoucherSchema.pre('validate', async function () {
  this.totalDebit = (this.lines || []).reduce((s, l) => s + (l.debit || 0), 0);
  this.totalCredit = (this.lines || []).reduce((s, l) => s + (l.credit || 0), 0);
});

/** A posted JV is a historical record; only pre-posting states may be edited. */
JournalVoucherSchema.methods.isEditable = function () {
  return ['draft', 'rejected'].includes(this.jvStatus);
};

JournalVoucherSchema.methods.isBalanced = function () {
  return this.totalDebit === this.totalCredit && this.totalDebit > 0;
};

JournalVoucherSchema.index({ school: 1, jvStatus: 1, jvDate: -1 });
JournalVoucherSchema.index({ school: 1, financialYear: 1, jvDate: -1 });
JournalVoucherSchema.index({ school: 1, createdBy: 1, jvStatus: 1 });
JournalVoucherSchema.index({ voucher: 1 });

// ─── No hard deletes ─────────────────────────────────────────────────────────
// A financial document.
['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  JournalVoucherSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_journalvouchers: journal vouchers are reversed, never deleted');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsJournalVoucher: reg('FmsJournalVoucher', JournalVoucherSchema),
  JV_STATUS,
};