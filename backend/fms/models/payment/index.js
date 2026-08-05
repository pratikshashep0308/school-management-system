// backend/fms/models/payment/index.js
//
// fms_paymentvouchers — money PAID OUT against an approved expense.
// BPMN WF3, screens SCR-52 (voucher) / SCR-53 (queue).
//
// ─── PAYING TWICE MUST BE IMPOSSIBLE, NOT MERELY CHECKED ─────────────────────
// A code-level "has this been paid?" check is a read-then-write: two clicks a
// moment apart can both read "no" and both pay. For a receipt that produces a
// duplicate record; for a payment it produces money leaving the school twice.
//
// So the guarantee is a unique partial index on { school, expenseRequest }
// where `isLive` is true. A second live payment for the same expense throws
// E11000 at the database and cannot commit.
//
// `isLive` is set false when a payment FAILS (a bounced cheque, a rejected
// transfer), which frees the expense to be paid again — the retry is a new
// voucher, and the failed one stays on record.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const PAYMENT_STATUS = ['pending', 'processing', 'paid', 'failed'];
const PAYMENT_MODE = ['cash', 'cheque', 'neft', 'rtgs', 'upi', 'dd'];

/** Modes that move money through a bank and therefore need an instrument. */
const INSTRUMENT_MODES = ['cheque', 'dd'];

const PaymentVoucherSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  // Also the GL voucher number. One sequence, as with receipts — a separate
  // payment register that can drift against the ledger is a reconciliation
  // problem waiting to happen.
  paymentNumber: { type: String, required: true },
  paymentDate: { type: Date, required: true },

  expenseRequest: { type: ObjectId, required: true },
  expenseNumber: { type: String },

  amount: { type: Number, required: true, min: 1 },      // integer paise

  paymentMode: { type: String, enum: PAYMENT_MODE, required: true },
  instrumentNumber: { type: String },                     // cheque / DD number
  instrumentDate: { type: Date },
  bankReference: { type: String },                        // NEFT/RTGS/UPI ref
  bankName: { type: String },

  // Dr side: what the money was spent on. Cr side: where it came from.
  debitAccount: { type: ObjectId, required: true },       // expense head
  debitAccountCode: { type: String },
  debitAccountName: { type: String },
  creditAccount: { type: ObjectId, required: true },      // cash or bank
  creditAccountCode: { type: String },

  payeeName: { type: String, required: true },            // denormalised
  payeeType: { type: String, enum: ['vendor', 'staff', 'other'], default: 'other' },
  vendorRef: { type: ObjectId, default: null },           // fms_vendors — P4.2

  narration: { type: String, default: '' },

  paymentStatus: { type: String, enum: PAYMENT_STATUS, default: 'pending', index: true },

  /**
   * True while this payment stands. The unique index below keys on it, so
   * exactly one live payment can exist per expense at any moment.
   */
  isLive: { type: Boolean, default: true },

  voucher: { type: ObjectId },                            // fms_vouchers._id
  reversalVoucher: { type: ObjectId, default: null },

  paidBy: { type: ObjectId },
  paidByName: { type: String },      // denormalised; survives user deletion
  paidAt: { type: Date },

  failedBy: { type: ObjectId },
  failedAt: { type: Date },
  failureReason: { type: String },

  printCount: { type: Number, default: 0 },
  lastPrintedAt: { type: Date },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_paymentvouchers' });

PaymentVoucherSchema.pre('validate', async function () {
  if (!Number.isInteger(this.amount)) {
    throw new Error('payment: amount must be integer paise, not float rupees');
  }
  if (INSTRUMENT_MODES.includes(this.paymentMode) && !this.instrumentNumber) {
    throw new Error(`payment: a ${this.paymentMode} payment needs an instrument number`);
  }
});

// THE guarantee. A second live payment for the same expense throws E11000.
PaymentVoucherSchema.index(
  { school: 1, expenseRequest: 1 },
  { unique: true, partialFilterExpression: { isLive: true } }
);
PaymentVoucherSchema.index({ school: 1, paymentNumber: 1 }, { unique: true });
PaymentVoucherSchema.index({ school: 1, paymentStatus: 1, paymentDate: -1 });
PaymentVoucherSchema.index({ school: 1, paymentMode: 1, paymentDate: -1 });
PaymentVoucherSchema.index({ voucher: 1 });

// A payment is a record of money that left. It is failed and superseded,
// never deleted.
['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  PaymentVoucherSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_paymentvouchers: payments are never deleted — mark them failed instead');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsPaymentVoucher: reg('FmsPaymentVoucher', PaymentVoucherSchema),
  PAYMENT_STATUS,
  PAYMENT_MODE,
  INSTRUMENT_MODES,
};