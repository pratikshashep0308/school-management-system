// backend/fms/models/banking/index.js
//
// fms_bankaccounts        the school's bank accounts, each tied to a GL head
// fms_banktransactions    lines imported from a bank statement
// fms_bankreconciliations a reconciliation period and its outcome
//
// SRS M9 / FR-M9, BPMN WF7, screens SCR-36..42.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const RECON_STATUS = ['unreconciled', 'matched', 'reconciled'];
const TXN_TYPE = ['deposit', 'withdrawal', 'transfer', 'charge', 'interest', 'other'];
const PERIOD_STATUS = ['draft', 'inProgress', 'completed', 'reopened'];

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

  /**
   * Everything on or before this date has been reconciled and is closed.
   * LedgerPostingService refuses to post into it — a reconciliation that can
   * be silently altered afterwards is not a reconciliation.
   */
  reconciledUpTo: { type: Date, default: null },

  isActive: { type: Boolean, default: true },
  notes: { type: String },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_bankaccounts' });

BankAccountSchema.index({ school: 1, accountNumber: 1 }, { unique: true });
BankAccountSchema.index({ school: 1, ledgerAccount: 1 }, { unique: true });
BankAccountSchema.index({ school: 1, isActive: 1 });

// ─────────────────────────────────────────────────────────────────────────────

const BankTransactionSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  bankAccount: { type: ObjectId, required: true, index: true },

  transactionDate: { type: Date, required: true },
  valueDate: { type: Date },
  narration: { type: String },
  reference: { type: String },

  /** The BANK's view: debit = money out of the account. */
  direction: { type: String, enum: ['debit', 'credit'], required: true },
  amount: { type: Number, required: true, min: 1 },   // integer paise
  runningBalance: { type: Number, default: null },

  reconciliationStatus: { type: String, enum: RECON_STATUS, default: 'unreconciled', index: true },

  matchedEntry: { type: ObjectId, default: null },    // fms_ledgerentries._id
  matchScore: { type: Number, default: null },
  matchConfidence: { type: String },
  matchedAutomatically: { type: Boolean, default: false },
  matchedBy: { type: ObjectId },
  matchedAt: { type: Date },
  matchNote: { type: String },

  reconciliation: { type: ObjectId, default: null },

  /**
   * A hash of the line as the bank sent it. Re-importing the same statement is
   * a normal accident — someone clicks twice, or a month overlaps — and without
   * this it silently doubles every transaction.
   */
  importHash: { type: String, required: true },
  importBatch: { type: ObjectId },
  importedBy: { type: ObjectId },
  sourceRow: { type: Number },

  createdBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_banktransactions' });

// The guard against double import.
BankTransactionSchema.index(
  { school: 1, bankAccount: 1, importHash: 1 },
  { unique: true }
);
BankTransactionSchema.index({ school: 1, bankAccount: 1, transactionDate: 1 });
BankTransactionSchema.index({ school: 1, reconciliationStatus: 1, transactionDate: 1 });

// ─────────────────────────────────────────────────────────────────────────────

const ReconciliationSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  bankAccount: { type: ObjectId, required: true },
  financialYear: { type: ObjectId, required: true },

  periodFrom: { type: Date, required: true },
  periodTo: { type: Date, required: true },

  /** As printed on the statement, for comparison against the books. */
  statementOpeningBalance: { type: Number, default: 0 },
  statementClosingBalance: { type: Number, required: true },

  /** Derived from the ledger at the moment of reconciling. */
  ledgerClosingBalance: { type: Number, default: 0 },

  /**
   * Statement minus ledger, explained by the items below. A reconciliation
   * with an unexplained difference has not reconciled anything.
   */
  difference: { type: Number, default: 0 },

  unpresentedCheques: { type: Number, default: 0 },
  depositsInTransit: { type: Number, default: 0 },
  bankChargesNotBooked: { type: Number, default: 0 },
  otherAdjustments: { type: Number, default: 0 },
  adjustmentNotes: { type: String },

  transactionCount: { type: Number, default: 0 },
  matchedCount: { type: Number, default: 0 },
  unmatchedCount: { type: Number, default: 0 },

  periodStatus: { type: String, enum: PERIOD_STATUS, default: 'draft', index: true },

  completedBy: { type: ObjectId },
  completedAt: { type: Date },
  reopenedBy: { type: ObjectId },
  reopenedAt: { type: Date },
  reopenReason: { type: String },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_bankreconciliations' });

ReconciliationSchema.index({ school: 1, bankAccount: 1, periodTo: -1 });
ReconciliationSchema.index({ school: 1, periodStatus: 1 });

['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  ReconciliationSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_bankreconciliations: a completed reconciliation is a signed statement of position — reopen it instead');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsBankAccount: reg('FmsBankAccount', BankAccountSchema),
  FmsBankTransaction: reg('FmsBankTransaction', BankTransactionSchema),
  FmsBankReconciliation: reg('FmsBankReconciliation', ReconciliationSchema),
  RECON_STATUS, TXN_TYPE, PERIOD_STATUS,
};