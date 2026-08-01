// backend/fms/models/expense/category.js
//
// fms_expensecategories — the master that carries the ACCOUNT an expense
// classifies to.
//
// ─── WHY THIS COLLECTION EXISTS ──────────────────────────────────────────────
// Today `FmsExpenseRequest.category` is a required String — a free-text label —
// and the mapping from that label to an account lives in fms_accountmappings,
// which holds ZERO documents. That is why both imported expenses landed in
// 5299 Other Expenses, and why ₹8,53,698 of fee income sat in 4109
// Unclassified until the fee-head split was built.
//
// Putting the account ON the category makes classification a property of the
// thing being classified, rather than a lookup somebody has to remember to
// populate.
//
// ─── WHY THE STRING FIELD SURVIVES ───────────────────────────────────────────
// The build plan originally proposed replacing `category: String` with an
// ObjectId. Discovery (P0.1) found it is REQUIRED and carries live data, so
// retyping it would break every existing request.
//
// Instead the expense request gains `category.ref`, following the {name, ref}
// shape `department` and `vendor` already use in this model. The string stays
// authoritative until every request has a ref; nothing is rewritten.

const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const DOC_STATUS = ['active', 'inactive'];

const ExpenseCategorySchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },

  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  description: { type: String },

  // The point of the collection. Validated against a postable, active account
  // in categoryService — a reference alone does not prove the account can
  // receive a posting.
  account: { type: ObjectId, required: true },
  accountCode: { type: String },                    // denormalised, for display

  // Two levels only: Utilities → Electricity. Enforced below, because a cycle
  // here makes tree() recurse until the process dies.
  parent: { type: ObjectId, default: null },

  defaultCostCentre: { type: String, default: null },
  budgetHead: { type: ObjectId, default: null },

  // Enforced at SUBMISSION, not at draft — a draft must stay freely editable
  // or people stop using drafts.
  requiresVendor: { type: Boolean, default: false },
  requiresInvoice: { type: Boolean, default: false },

  approvalOverride: { type: ObjectId, default: null },

  colour: { type: String, default: '#6B7280' },
  icon: { type: String, default: '💰' },

  // Lets the SMS expense ingest resolve a category by name instead of dropping
  // everything into 5299.
  smsCategoryId: { type: String, default: null },

  status: { type: String, enum: DOC_STATUS, default: 'active' },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_expensecategories' });

// Unique per SCHOOL, not globally. Two schools may both have a 'STAT' code and
// that is correct — every FMS document is school-scoped.
ExpenseCategorySchema.index({ school: 1, code: 1 }, { unique: true });
ExpenseCategorySchema.index({ school: 1, status: 1 });
ExpenseCategorySchema.index({ school: 1, parent: 1 });
ExpenseCategorySchema.index({ school: 1, smsCategoryId: 1 }, { sparse: true });

// ─── Depth and cycle guard ───────────────────────────────────────────────────
// A category may not be its own parent, and may not sit under a category that
// itself has a parent. Checked on save rather than only in the service, because
// the service is not the only way a document reaches the database.
ExpenseCategorySchema.pre('save', async function guardDepth(next) {
  if (!this.parent) return next();

  if (String(this.parent) === String(this._id)) {
    return next(new Error('A category cannot be its own parent'));
  }

  const Model = mongoose.models.FmsExpenseCategory;
  const parent = await Model.findById(this.parent).select('parent').lean();

  if (!parent) return next(new Error('Parent category not found'));
  if (parent.parent) {
    return next(new Error('Categories nest two levels only — the chosen parent already has a parent'));
  }

  return next();
});

// ─── No hard deletes ─────────────────────────────────────────────────────────
// A category referenced by a posted expense must survive, or the ledger points
// at nothing. Deactivation only — and categoryService refuses even that while
// live references exist.
['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  ExpenseCategorySchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_expensecategories: categories are deactivated, never deleted');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsExpenseCategory: reg('FmsExpenseCategory', ExpenseCategorySchema),
  DOC_STATUS,
};