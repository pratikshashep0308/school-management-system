// backend/fms/models/settlement/index.js
//
// fms_settlements — a batch of online receipts cleared into the bank.
//
// Per docs/discovery/04_integration_plan.md §5.
//
// Exists because the clearing head (1202) holds many individual receipts while
// the bank shows one credit. A settlement records which receipts a given credit
// covered — without it, the only way to answer "has this payment arrived?" is
// to eyeball a ledger.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const SETTLEMENT_STATUS = ['settled', 'reversed'];

const SettlementSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  /**
   * The bank's or gateway's reference for this credit — the idempotency key.
   * Settling the same credit twice would credit the clearing head for money
   * that arrived once.
   */
  settlementReference: { type: String, required: true },
  settlementDate: { type: Date, required: true },

  clearingAccount: { type: ObjectId, required: true },
  bankAccount: { type: ObjectId, required: true },

  /** What the receipts totalled. */
  grossAmount: { type: Number, required: true },     // integer paise
  /** What actually landed. Lower when charges are netted off. */
  settledAmount: { type: Number, required: true },
  /**
   * gross − settled. A real expense, posted to its own head rather than netted
   * against income — netting would understate both.
   */
  charges: { type: Number, default: 0 },
  chargeAccount: { type: ObjectId, default: null },

  /** The clearing-account entries this settlement cleared. */
  clearedEntries: [{ type: ObjectId }],
  entryCount: { type: Number, default: 0 },

  settlementStatus: { type: String, enum: SETTLEMENT_STATUS, default: 'settled', index: true },

  voucher: { type: ObjectId, required: true },
  voucherNumber: { type: String },

  reversalVoucher: { type: ObjectId, default: null },
  reversedAt: { type: Date },
  reversedBy: { type: ObjectId },
  reversalReason: { type: String },

  settledBy: { type: ObjectId },
  settledAt: { type: Date },
  createdBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_settlements' });

SettlementSchema.pre('validate', async function () {
  for (const k of ['grossAmount', 'settledAmount', 'charges']) {
    if (!Number.isInteger(this[k])) {
      throw new Error(`settlement: ${k} must be integer paise`);
    }
  }
  // The arithmetic that makes a settlement meaningful. If these do not add up,
  // either money has gone missing or a charge has not been accounted for.
  if (this.settledAmount + this.charges !== this.grossAmount) {
    throw new Error(
      `settlement: settled ${this.settledAmount} + charges ${this.charges} ` +
      `must equal gross ${this.grossAmount}`
    );
  }
});

// One settlement per reference. The guarantee, not a code check.
SettlementSchema.index({ school: 1, settlementReference: 1 }, { unique: true });
SettlementSchema.index({ school: 1, settlementStatus: 1, settlementDate: -1 });
// Supports the "is this entry already settled?" lookup.
SettlementSchema.index({ school: 1, clearedEntries: 1 });

['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  SettlementSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_settlements: settlements are reversed, never deleted');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsSettlement: reg('FmsSettlement', SettlementSchema),
  SETTLEMENT_STATUS,
};