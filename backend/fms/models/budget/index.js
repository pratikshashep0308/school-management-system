// backend/fms/models/budget/index.js
//
// fms_budgets — a spending allowance per account per financial year.
// SRS M6 / FR-M6, screens SCR-22/23/24/25.
//
// ─── WHAT IS STORED, AND WHAT IS NOT ─────────────────────────────────────────
// Stored: the ALLOWANCE — how much may be spent, who revised it and why.
//
// NOT stored: what has actually been spent. That is derived at query time from
// fms_ledgerentries (posted) and fms_expenserequests (committed but unpaid).
// A stored `actualSpending` field would be a second copy of the ledger, and the
// two would drift the first time anything was posted outside the update path.
//
// ─── THE DOUBLE-COUNTING TRAP ────────────────────────────────────────────────
// A paid expense exists in BOTH the ledger and as an expense request. Summing
// both would count every paid expense twice, exhausting the budget at half its
// real spend. So `committed` deliberately covers only approved-but-not-yet-paid
// requests; anything paid is already in `actual`.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const BUDGET_STATUS = ['draft', 'active', 'revised', 'closed'];

/**
 * What happens when a request would exceed the budget.
 *   block — refuse, unless the requester explicitly acknowledges (default)
 *   warn  — allow, but flag it to every approver
 */
const OVER_BUDGET_POLICY = ['block', 'warn'];

const RevisionSchema = new mongoose.Schema({
  previousAmount: { type: Number, required: true },     // integer paise
  newAmount: { type: Number, required: true },
  delta: { type: Number, required: true },
  reason: { type: String, required: true },
  revisedBy: { type: ObjectId, required: true },
  revisedByEmail: { type: String },
  revisedAt: { type: Date, default: Date.now },
}, { _id: true });

const BudgetSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, required: true },

  account: { type: ObjectId, required: true },          // fms_accounts._id
  accountCode: { type: String },
  accountName: { type: String },

  // Optional narrowing. A budget with no department covers the account across
  // the whole school; one with a department covers only that department's
  // spending on it.
  department: {
    name: { type: String, default: null },
    ref: { type: ObjectId, default: null },             // fms_departments — P4.x
  },

  budgetAmount: { type: Number, required: true, min: 0 },   // integer paise
  revisedBudget: { type: Number, default: null },           // null until revised

  /** Fraction of the effective budget at which a warning is raised. */
  warnThreshold: { type: Number, default: 0.9, min: 0, max: 1 },
  overBudgetPolicy: { type: String, enum: OVER_BUDGET_POLICY, default: 'block' },

  budgetStatus: { type: String, enum: BUDGET_STATUS, default: 'draft', index: true },

  revisions: [RevisionSchema],
  notes: { type: String },

  activatedBy: { type: ObjectId },
  activatedAt: { type: Date },
  closedBy: { type: ObjectId },
  closedAt: { type: Date },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_budgets' });

BudgetSchema.pre('validate', async function () {
  for (const k of ['budgetAmount', 'revisedBudget']) {
    const v = this[k];
    if (v !== null && v !== undefined && !Number.isInteger(v)) {
      throw new Error(`budget: ${k} must be integer paise, not float rupees`);
    }
  }
});

/** The figure actually in force — the revision if there is one. */
BudgetSchema.virtual('effectiveAmount').get(function () {
  return this.revisedBudget ?? this.budgetAmount;
});

BudgetSchema.methods.isLive = function () {
  return ['active', 'revised'].includes(this.budgetStatus);
};

// One live budget per account per year per department. Two would make
// "the budget for this head" ambiguous, and any answer would be arbitrary.
BudgetSchema.index(
  { school: 1, financialYear: 1, account: 1, 'department.name': 1 },
  { unique: true }
);
BudgetSchema.index({ school: 1, financialYear: 1, budgetStatus: 1 });
BudgetSchema.index({ school: 1, account: 1, budgetStatus: 1 });

// A budget that has been spent against is part of the record of how the year
// was managed. Closed, never deleted.
['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  BudgetSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_budgets: budgets are closed, never deleted');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsBudget: reg('FmsBudget', BudgetSchema),
  BUDGET_STATUS,
  OVER_BUDGET_POLICY,
};