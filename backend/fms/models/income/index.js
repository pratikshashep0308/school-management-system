// backend/fms/models/income/index.js
//
// fms_incomevouchers — money RECEIVED. SRS M3 / FR-M3, screens SCR-11/12/13.
//
// ─── WHY THIS POSTS IMMEDIATELY, UNLIKE A JOURNAL VOUCHER ────────────────────
// A journal voucher is a *proposal* — it sits in draft, gets approved, then
// posts. An income voucher is a *record of a fact*: the money is already in the
// drawer. Holding it in draft while a parent waits for a receipt would be
// absurd, and would leave cash on hand that the books do not know about.
//
// So creation posts to the ledger in the same call. The only later transition
// is cancellation, which reverses.
//
// ─── ONE NUMBER, NOT TWO ─────────────────────────────────────────────────────
// The GL voucher number IS the receipt number. Running a separate receipt
// sequence alongside the ledger sequence means two things that can disagree —
// a gap in one, a duplicate in the other, and a reconciliation problem nobody
// notices for months. One number is gapless by construction (allocated inside
// the posting transaction) and traces straight to the ledger.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

/** SRS M3 income sources. */
const INCOME_CATEGORY = [
  'studentFee',
  'admissionFee',
  'donation',
  'csr',
  'rent',
  'interest',
  'sales',
  'event',
  'miscellaneous',
];

const PAYMENT_MODE = ['cash', 'cheque', 'bank', 'upi', 'online', 'dd'];

const INCOME_STATUS = ['posted', 'cancelled'];

const IncomeVoucherSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  // Both the accounting reference and the number printed on the parent's
  // receipt. See the note above.
  receiptNumber: { type: String, required: true },

  receiptDate: { type: Date, required: true },
  category: { type: String, enum: INCOME_CATEGORY, required: true },

  amount: { type: Number, required: true, min: 1 },   // integer paise

  paymentMode: { type: String, enum: PAYMENT_MODE, required: true },
  instrumentNumber: { type: String },                  // cheque / DD / UPI ref
  instrumentDate: { type: Date },
  bankName: { type: String },

  // Where the money went (Dr) and what it was for (Cr).
  debitAccount: { type: ObjectId, required: true },    // cash or bank
  debitAccountCode: { type: String },
  creditAccount: { type: ObjectId, required: true },   // income head
  creditAccountCode: { type: String },
  creditAccountName: { type: String },

  // Who paid. `payerName` is denormalised deliberately: a receipt must remain
  // readable even if the SMS student record is later deleted.
  payerType: { type: String, enum: ['student', 'organisation', 'individual', 'other'], default: 'other' },
  payerName: { type: String, required: true },
  smsStudentId: { type: ObjectId, default: null },     // opaque — no ref
  admissionNumber: { type: String },
  className: { type: String },

  narration: { type: String, default: '' },
  reference: { type: String },

  incomeStatus: { type: String, enum: INCOME_STATUS, default: 'posted', index: true },

  // The ledger posting this created.
  voucher: { type: ObjectId, required: true },
  postedBy: { type: ObjectId, required: true },
  postedAt: { type: Date, default: Date.now },

  // Cancellation reverses; it never deletes.
  cancelledBy: { type: ObjectId },
  cancelledAt: { type: Date },
  cancellationReason: { type: String },
  reversalVoucher: { type: ObjectId, default: null },

  // ── Ingest linkage ───────────────────────────────────────────────────────
  // Set when this receipt came from the SMS rather than being keyed in here.
  //
  // These live on the income voucher rather than in a separate fms_feePostings
  // collection (which the integration plan proposed) because an income voucher
  // ALREADY records 'money received from X, for Y, on date Z' — which is what a
  // fee receipt is. A parallel collection would be a second place to ask "did we
  // post this receipt?", and two records of one event drift. Idempotency is
  // handled by fms_ingeststate, so a third record adds nothing.
  sourceSystem: { type: String, enum: ['sms', null], default: null },
  /** The SMS receipt number — the idempotency key, distinct from ours. */
  sourceReceiptNumber: { type: String, default: null },
  sourceCollection: { type: String },          // studentFee | feeAssignment
  sourceDocId: { type: ObjectId, default: null },
  /**
   * True when the source carried no fee type and the money went to
   * 'Fee Income — Unclassified'. Flagged so somebody can reclassify it, rather
   * than it disappearing into a bucket nobody looks at.
   */
  needsReclassification: { type: Boolean, default: false },

  printCount: { type: Number, default: 0 },
  lastPrintedAt: { type: Date },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_incomevouchers' });

/** A receipt number must be unique per school — it is a legal document number. */
IncomeVoucherSchema.index({ school: 1, receiptNumber: 1 }, { unique: true });
// The SMS receipt number is the ingest idempotency key. A unique index makes a
// replayed cycle a database impossibility rather than a code-level hope.
IncomeVoucherSchema.index(
  { school: 1, sourceReceiptNumber: 1 },
  { unique: true, partialFilterExpression: { sourceReceiptNumber: { $type: 'string' } } }
);
IncomeVoucherSchema.index({ school: 1, needsReclassification: 1 });
IncomeVoucherSchema.index({ school: 1, receiptDate: -1 });
IncomeVoucherSchema.index({ school: 1, category: 1, receiptDate: -1 });
IncomeVoucherSchema.index({ school: 1, smsStudentId: 1, receiptDate: -1 });
IncomeVoucherSchema.index({ school: 1, incomeStatus: 1, receiptDate: -1 });
IncomeVoucherSchema.index({ voucher: 1 });

// There is no update path. An income voucher records what happened; if it was
// wrong it is cancelled and re-entered.
const IMMUTABLE = ['updateOne', 'updateMany', 'findOneAndUpdate'];
IMMUTABLE.forEach((op) =>
  IncomeVoucherSchema.pre(op, { query: true, document: false }, async function () {
    // The service uses save() on a loaded document for cancellation, which does
    // not go through query middleware. This blocks bulk edits from anywhere else.
    const update = this.getUpdate() || {};
    const touched = Object.keys(update.$set || update || {});
    const allowed = ['incomeStatus', 'cancelledBy', 'cancelledAt', 'cancellationReason',
      'reversalVoucher', 'printCount', 'lastPrintedAt', 'updatedBy', 'updatedAt'];
    const bad = touched.filter((k) => !allowed.includes(k));
    if (bad.length) {
      throw new Error(
        `fms_incomevouchers: ${bad.join(', ')} cannot be edited — cancel and re-enter instead`
      );
    }
  })
);

['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  IncomeVoucherSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_incomevouchers: receipts are never deleted — cancel instead');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsIncomeVoucher: reg('FmsIncomeVoucher', IncomeVoucherSchema),
  INCOME_CATEGORY,
  PAYMENT_MODE,
  INCOME_STATUS,
};