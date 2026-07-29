// backend/fms/models/pettyCash/index.js
//
// fms_pettycashfloats        who holds a float, how much, and when to top it up
// fms_pettycashtransactions  every movement against it
//
// SRS M10 / FR-M10, BPMN WF9, screens SCR-43/44/45.
//
// ─── WHAT THIS DOES NOT REBUILD ──────────────────────────────────────────────
// Daily closing — physical count, variance, verification — already exists in
// fms_dailyclosings (P2.4), which works on any account flagged isCashAccount.
// A petty cash account IS a cash account, so it closes through the same code.
//
// Building a parallel closing here would mean two places where a variance can
// be recorded, and eventually two answers to "was the cash counted?".
//
// ─── WHAT IS GENUINELY NEW ───────────────────────────────────────────────────
// The imprest arrangement: a named custodian holds a fixed float, spends from
// it, and has it topped back up to the original amount. The float size, the
// custodian and the replenishment threshold are facts that live nowhere else.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

/**
 * float          the initial imprest handed to a custodian
 * replenishment  topping it back up after spending
 * expense        money spent from the float
 * return         unspent cash handed back
 * adjustment     a correction posted after a verified variance
 */
const PC_TRANSACTION_TYPE = ['float', 'replenishment', 'expense', 'return', 'adjustment'];

const PC_STATUS = ['posted', 'cancelled'];

const FLOAT_STATUS = ['active', 'suspended', 'closed'];

// ─────────────────────────────────────────────────────────────────────────────

const PettyCashFloatSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },

  name: { type: String, required: true },              // 'Front Office Petty Cash'

  /** The GL head. Must be a postable cash account. */
  account: { type: ObjectId, required: true },
  accountCode: { type: String },
  accountName: { type: String },

  /** The person answerable for the cash in the tin. */
  custodian: { type: ObjectId, required: true },       // SMS User._id
  custodianName: { type: String },

  /** The imprest amount — what the float is topped back up TO. */
  floatAmount: { type: Number, required: true, min: 1 },   // integer paise

  /**
   * Replenish when the balance falls to or below this. Defaults to a quarter
   * of the float, which is late enough not to be constantly topping up and
   * early enough not to run dry mid-week.
   */
  replenishThreshold: { type: Number, default: null },

  /** A single expense above this needs approval rather than the tin. */
  maxSingleExpense: { type: Number, default: null },

  floatStatus: { type: String, enum: FLOAT_STATUS, default: 'active', index: true },
  statusReason: { type: String },

  notes: { type: String },
  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_pettycashfloats' });

PettyCashFloatSchema.pre('validate', async function () {
  for (const k of ['floatAmount', 'replenishThreshold', 'maxSingleExpense']) {
    const v = this[k];
    if (v !== null && v !== undefined && !Number.isInteger(v)) {
      throw new Error(`pettyCashFloat: ${k} must be integer paise, not float rupees`);
    }
  }
  if (this.replenishThreshold === null || this.replenishThreshold === undefined) {
    this.replenishThreshold = Math.floor(this.floatAmount / 4);
  }
  if (this.replenishThreshold >= this.floatAmount) {
    throw new Error('pettyCashFloat: the replenishment threshold must be below the float amount');
  }
});

// One float per GL account. Two floats sharing a head would make "how much is
// in the tin" unanswerable from the ledger.
PettyCashFloatSchema.index({ school: 1, account: 1 }, { unique: true });
PettyCashFloatSchema.index({ school: 1, floatStatus: 1 });
PettyCashFloatSchema.index({ school: 1, custodian: 1 });

// ─────────────────────────────────────────────────────────────────────────────

const PettyCashTransactionSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  pettyCashFloat: { type: ObjectId, required: true, index: true },
  voucherNumber: { type: String, required: true },     // also the GL voucher number

  transactionDate: { type: Date, required: true },
  transactionType: { type: String, enum: PC_TRANSACTION_TYPE, required: true },

  amount: { type: Number, required: true, min: 1 },    // integer paise

  /** For an expense: what it was spent on. For a float or return: bank or cash. */
  counterAccount: { type: ObjectId, required: true },
  counterAccountCode: { type: String },
  counterAccountName: { type: String },

  particulars: { type: String, required: true },
  paidTo: { type: String },
  billNumber: { type: String },
  /** A bill or receipt for the spend. Small amounts, but still evidence. */
  attachmentUrl: { type: String },

  pcStatus: { type: String, enum: PC_STATUS, default: 'posted', index: true },

  voucher: { type: ObjectId, required: true },         // fms_vouchers._id
  reversalVoucher: { type: ObjectId, default: null },

  /** Set when this transaction posts a verified closing variance. */
  dailyClosing: { type: ObjectId, default: null },

  recordedBy: { type: ObjectId, required: true },
  cancelledBy: { type: ObjectId },
  cancelledAt: { type: Date },
  cancellationReason: { type: String },

  createdBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_pettycashtransactions' });

PettyCashTransactionSchema.pre('validate', async function () {
  if (!Number.isInteger(this.amount)) {
    throw new Error('pettyCashTransaction: amount must be integer paise, not float rupees');
  }
});

PettyCashTransactionSchema.index({ school: 1, voucherNumber: 1 }, { unique: true });
PettyCashTransactionSchema.index({ school: 1, pettyCashFloat: 1, transactionDate: -1 });
PettyCashTransactionSchema.index({ school: 1, transactionType: 1, transactionDate: -1 });
PettyCashTransactionSchema.index({ voucher: 1 });

// Petty cash is small money with weak controls, which is exactly why the record
// has to be complete. Cancel and reverse; never delete.
['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  PettyCashTransactionSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_pettycashtransactions: petty cash entries are cancelled, never deleted');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsPettyCashFloat: reg('FmsPettyCashFloat', PettyCashFloatSchema),
  FmsPettyCashTransaction: reg('FmsPettyCashTransaction', PettyCashTransactionSchema),
  PC_TRANSACTION_TYPE, PC_STATUS, FLOAT_STATUS,
};