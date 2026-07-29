// backend/fms/models/banking/index.js
//
// fms_bankaccounts        the school's bank accounts, each tied to a GL head
// fms_banktransactions    lines imported from a bank statement
// fms_bankreconciliations a reconciliation period and its outcome
//
// SRS M9 / FR-M9, BPMN WF7, screens SCR-36..42.
//
// ─── FIELD NAMES FOLLOW THE STATEMENT'S POINT OF VIEW ────────────────────────
// `statementDirection` rather than a bare `direction`, and `valueDate` rather
// than a bare `date`, because these fields hold what the BANK said — not what
// the school's books say. The two disagree by design: a bank credit is a ledger
// debit, and conflating them is the classic reconciliation error.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const RECON_STATUS = ['unreconciled', 'matched', 'reconciled'];
/**
 * A reconciliation period.
 *
 *   draft        being prepared
 *   inProgress   matching under way
 *   reconciled   complete and balanced — CLOSED TO NEW POSTINGS
 *   locked       closed permanently, e.g. after year-end
 *   reopened     deliberately reopened; the lock is lifted
 *
 * `reconciled` and `locked` are the two that LedgerPostingService refuses to
 * post into. This list is the union of every value the service, the routes and
 * the checks actually use — derived by grepping all three rather than one,
 * which is how 'inProgress' came to be missing the first time.
 */
const PERIOD_STATUS = ['draft', 'inProgress', 'reconciled', 'locked', 'reopened'];
const STATEMENT_DIRECTION = ['debit', 'credit'];

// ─────────────────────────────────────────────────────────────────────────────

const BankAccountSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },

  accountName: { type: String, required: true },
  accountNumber: { type: String, required: true },
  ifsc: { type: String, required: true },
  bankName: { type: String, required: true },
  branch: { type: String },
  accountType: { type: String, enum: ['current', 'savings', 'cc', 'od'], default: 'current' },

  /** The GL head this account posts to. Every movement lands there. */
  ledgerAccount: { type: ObjectId, required: true },
  ledgerAccountCode: { type: String },

  openingBalance: { type: Number, default: 0 },      // integer paise
  openingDate: { type: Date },

  isActive: { type: Boolean, default: true },
  notes: { type: String },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_bankaccounts' });

BankAccountSchema.index({ school: 1, accountNumber: 1 }, { unique: true });
// One GL head per bank account. Sharing a head between two accounts makes
// "the balance of this account" unanswerable from the ledger.
BankAccountSchema.index({ school: 1, ledgerAccount: 1 }, { unique: true });
BankAccountSchema.index({ school: 1, isActive: 1 });

// ─────────────────────────────────────────────────────────────────────────────

const BankTransactionSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  bankAccount: { type: ObjectId, required: true, index: true },

  /** The date the bank put against the line. */
  valueDate: { type: Date, required: true },
  narration: { type: String, default: '' },
  reference: { type: String, default: '' },

  /** THE BANK's view: debit = money out of the account. */
  statementDirection: { type: String, enum: STATEMENT_DIRECTION, required: true },
  amount: { type: Number, required: true, min: 1 },     // integer paise
  runningBalance: { type: Number, default: null },

  reconciliationStatus: { type: String, enum: RECON_STATUS, default: 'unreconciled', index: true },

  matchedEntry: { type: ObjectId, default: null },      // fms_ledgerentries._id
  matchedVoucher: { type: ObjectId, default: null },
  matchConfidence: { type: String },
  matchedBy: { type: ObjectId },
  matchedAt: { type: Date },
  matchNote: { type: String },

  reconciliation: { type: ObjectId, default: null },

  importBatch: { type: String },
  sourceLine: { type: Number },
  /** The row exactly as it arrived, for when a match is disputed later. */
  rawLine: { type: String },

  createdBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_banktransactions' });

/**
 * Duplicate absorption.
 *
 * Re-importing an overlapping month is a normal accident — a double click, or a
 * statement that repeats the last few days. Without this, every one of those
 * lines is entered twice and the reconciliation quietly stops being possible.
 *
 * The service relies on the E11000 this raises, counting duplicates rather than
 * failing the import.
 */
BankTransactionSchema.index(
  {
    school: 1, bankAccount: 1, valueDate: 1,
    statementDirection: 1, amount: 1, narration: 1, reference: 1,
  },
  { unique: true, name: 'statement_line_identity' }
);
BankTransactionSchema.index({ school: 1, bankAccount: 1, valueDate: 1 });
BankTransactionSchema.index({ school: 1, reconciliationStatus: 1, valueDate: 1 });
BankTransactionSchema.index({ school: 1, matchedEntry: 1 });

// ─────────────────────────────────────────────────────────────────────────────

const ReconciliationSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  bankAccount: { type: ObjectId, required: true },
  financialYear: { type: ObjectId },

  periodFrom: { type: Date, required: true },
  periodTo: { type: Date, required: true },

  /** What the school's ledger says at periodTo. */
  bookBalance: { type: Number, default: 0 },
  /** The statement balance adjusted for items in transit. */
  adjustedBankBalance: { type: Number, default: 0 },
  statementClosingBalance: { type: Number, default: 0 },

  /**
   * Book minus adjusted bank. Must be zero to reconcile — a reconciliation
   * with an unexplained difference has not reconciled anything.
   */
  difference: { type: Number, default: 0 },

  unpresentedCheques: { type: Number, default: 0 },
  depositsInTransit: { type: Number, default: 0 },
  adjustmentNotes: { type: String },

  matchedCount: { type: Number, default: 0 },
  matchedStatementCount: { type: Number, default: 0 },
  matchedLedgerCount: { type: Number, default: 0 },
  unmatchedStatementCount: { type: Number, default: 0 },
  unmatchedLedgerCount: { type: Number, default: 0 },

  /**
   * `reconciled` and `locked` both close the period to new postings —
   * LedgerPostingService refuses to write into either.
   */
  periodStatus: { type: String, enum: PERIOD_STATUS, default: 'draft', index: true },

  reconciledBy: { type: ObjectId },
  reconciledAt: { type: Date },
  reopenedBy: { type: ObjectId },
  reopenedAt: { type: Date },
  reopenReason: { type: String },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_bankreconciliations' });

ReconciliationSchema.index({ school: 1, bankAccount: 1, periodTo: -1 });
ReconciliationSchema.index({ school: 1, periodStatus: 1 });
// Supports the period-lock lookup on every posting.
ReconciliationSchema.index({ school: 1, bankAccount: 1, periodStatus: 1, periodFrom: 1, periodTo: 1 });

['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  ReconciliationSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error(
      'fms_bankreconciliations: a completed reconciliation is a signed statement ' +
      'of position — reopen it instead of deleting it'
    );
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsBankAccount: reg('FmsBankAccount', BankAccountSchema),
  FmsBankTransaction: reg('FmsBankTransaction', BankTransactionSchema),
  FmsBankReconciliation: reg('FmsBankReconciliation', ReconciliationSchema),
  RECON_STATUS, PERIOD_STATUS, STATEMENT_DIRECTION,
};