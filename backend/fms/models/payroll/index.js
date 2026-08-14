// backend/fms/models/payroll/index.js
//
// fms_payrollpostings — what the FMS did with each salary slip.
//
// Per docs/discovery/04_integration_plan.md §3.
//
// Kept as its own collection rather than folded into the voucher because it
// records the DECISIONS as well as the amounts: which date was chosen and why
// (§3.4), which components were posted, and whether a later status change
// forced a reversal (§3.5). None of that belongs on a ledger voucher.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const POSTING_STATUS = ['posted', 'reversed'];

const PayrollPostingSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  /** The SMS SalarySlip._id — the idempotency key. */
  salarySlip: { type: ObjectId, required: true },
  teacher: { type: ObjectId, default: null },      // opaque SMS id
  teacherName: { type: String },
  month: { type: String },
  year: { type: Number },
  slipStatus: { type: String },                    // as at posting time

  grossAmount: { type: Number, required: true },   // integer paise
  netAmount: { type: Number, required: true },
  deductions: {
    pf: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    loan: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
  },

  /**
   * Which components actually reached the ledger. ESIC and Professional Tax
   * never appear here — the source has no fields for them (G1) — and recording
   * what WAS posted makes that visible without needing to know the rule.
   */
  componentsPosted: [{ type: String }],

  // ── §3.4, the posting-date decision ──────────────────────────────────────
  postingDate: { type: Date, required: true },
  /**
   * 'paymentDate' or 'updatedAt'. `paymentDate` defaults to Date.now at
   * document creation, so on an unpaid slip it records when the form was
   * opened rather than when salary was paid. Storing the choice means a
   * question about the date years later has an answer.
   */
  dateChosen: { type: String, enum: ['paymentDate', 'updatedAt'] },
  sourcePaymentDate: { type: Date },
  sourceUpdatedAt: { type: Date },

  voucher: { type: ObjectId, required: true },
  voucherNumber: { type: String },

  postingStatus: { type: String, enum: POSTING_STATUS, default: 'posted', index: true },

  // ── §3.5, reversal on status regression ──────────────────────────────────
  reversalVoucher: { type: ObjectId, default: null },
  reversalVoucherNumber: { type: String },
  reversedAt: { type: Date },
  reversedBy: { type: ObjectId },
  reversalReason: { type: String },

  postedBy: { type: ObjectId },
  createdBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_payrollpostings' });

/**
 * One LIVE posting per slip. A reversed one may sit alongside a fresh posting
 * for the same slip — §3.5 says a slip that returns to 'paid' posts again with
 * a new voucher, and the reversal stays because that period happened.
 */
PayrollPostingSchema.index(
  { school: 1, salarySlip: 1 },
  { unique: true, partialFilterExpression: { postingStatus: 'posted' } }
);
PayrollPostingSchema.index({ school: 1, postingStatus: 1, postingDate: -1 });
PayrollPostingSchema.index({ school: 1, teacher: 1, year: 1, month: 1 });
PayrollPostingSchema.index({ voucher: 1 });

['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  PayrollPostingSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_payrollpostings: payroll postings are reversed, never deleted');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsPayrollPosting: reg('FmsPayrollPosting', PayrollPostingSchema),
  POSTING_STATUS,
};