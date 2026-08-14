// backend/fms/models/cashBankBook/index.js
//
// fms_dailyclosings — the record that a day's cash or bank position was closed
// and verified.
//
// ─── WHY THIS EXISTS WHEN BALANCES ARE DERIVED ───────────────────────────────
// The P2.4 brief is explicit: derive the books from postings, do not
// double-store amounts. This collection does not break that rule.
//
// The LEDGER tells you what the books say. This tells you what someone actually
// counted, who counted it, and who checked. Those are different facts, and the
// second exists nowhere else.
//
// `systemClosing` is stored beside the physical count not as a duplicate
// balance but as a snapshot of what the system claimed AT THE MOMENT OF
// COUNTING — which is what makes a variance investigable weeks later. Nothing
// ever reads it to answer "what is the balance": that always comes from the
// ledger.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const CLOSING_STATUS = ['open', 'closed', 'verified', 'disputed'];

const DailyClosingSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  account: { type: ObjectId, required: true },      // fms_accounts._id
  accountCode: { type: String },
  accountName: { type: String },
  bookType: { type: String, enum: ['cash', 'bank'], required: true },

  // Midnight UTC of the day closed — one document per account per day.
  closingDate: { type: Date, required: true },

  // All integer paise. Snapshots at the moment of closing.
  openingBalance: { type: Number, default: 0 },
  totalReceipts: { type: Number, default: 0 },
  totalPayments: { type: Number, default: 0 },
  systemClosing: { type: Number, default: 0 },

  // The genuinely new fact: what was physically counted.
  physicalCount: { type: Number, default: null },
  variance: { type: Number, default: 0 },           // physical − system
  varianceReason: { type: String },

  denominations: [{                                  // optional cash breakdown
    denomination: { type: Number },                  // paise, e.g. 50000 = ₹500
    count: { type: Number },
  }],

  closingStatus: { type: String, enum: CLOSING_STATUS, default: 'closed', index: true },

  closedBy: { type: ObjectId },
  closedAt: { type: Date },
  verifiedBy: { type: ObjectId },
  verifiedAt: { type: Date },
  verificationNote: { type: String },

  entryCount: { type: Number, default: 0 },
  notes: { type: String },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_dailyclosings' });

// Variance is derived, never supplied — a caller-provided variance could be
// made to say anything.
DailyClosingSchema.pre('validate', async function () {
  if (this.physicalCount !== null && this.physicalCount !== undefined) {
    this.variance = this.physicalCount - this.systemClosing;
  } else {
    this.variance = 0;
  }
});

/** One closing per account per day. Re-closing must be explicit, not accidental. */
DailyClosingSchema.index({ school: 1, account: 1, closingDate: 1 }, { unique: true });
DailyClosingSchema.index({ school: 1, bookType: 1, closingDate: -1 });
DailyClosingSchema.index({ school: 1, closingStatus: 1, closingDate: -1 });

// ─── No hard deletes ─────────────────────────────────────────────────────────
// A signed statement that the cash was counted and this is what was there.
['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  DailyClosingSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_dailyclosings: daily closings are a signed count and are never deleted');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsDailyClosing: reg('FmsDailyClosing', DailyClosingSchema),
  CLOSING_STATUS,
};