// backend/fms/models/approval/index.js
//
// fms_approvalmatrix   — configurable routing thresholds (SCR-20)
// fms_expenseapprovals — an append-only record of every approval action
//
// SRS M5 / FR-M5, BPMN WF1.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const APPROVAL_ACTION = ['verify', 'approve', 'reject', 'return'];
const APPROVAL_STEP = ['accounts', 'deptHead', 'principal', 'chairman', 'trustee'];

// ─────────────────────────────────────────────────────────────────────────────
// Approval matrix
// ─────────────────────────────────────────────────────────────────────────────

const TierSchema = new mongoose.Schema({
  tier: { type: Number, required: true },
  minAmount: { type: Number, required: true },          // integer paise, inclusive
  maxAmount: { type: Number, default: null },           // inclusive; null = open-ended
  approvers: [{ type: String, enum: APPROVAL_STEP }],
  label: { type: String },
}, { _id: false });

const ApprovalMatrixSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true },
  // Null applies to every year. A year-specific matrix overrides it, so
  // thresholds can change at a year boundary without rewriting history.
  financialYear: { type: ObjectId, default: null },

  tiers: { type: [TierSchema], required: true },

  isActive: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
  notes: { type: String },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_approvalmatrix' });

ApprovalMatrixSchema.index(
  { school: 1, financialYear: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

// ─────────────────────────────────────────────────────────────────────────────
// Approval records
//
// APPEND-ONLY. Every action taken on an expense is a permanent record: who,
// what, when, from which state to which, and why. Editing this would destroy
// the only evidence of how a payment came to be authorised.
// ─────────────────────────────────────────────────────────────────────────────

const ExpenseApprovalSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  expenseRequest: { type: ObjectId, required: true, index: true },
  expenseNumber: { type: String },

  step: { type: String, enum: APPROVAL_STEP, required: true },
  action: { type: String, enum: APPROVAL_ACTION, required: true },

  actor: { type: ObjectId, required: true },
  actorEmail: { type: String },
  actorRole: { type: String },

  fromStatus: { type: String, required: true },
  toStatus: { type: String, required: true },

  // Snapshot of what was being authorised, so the record stays meaningful even
  // if the request is later edited after a return.
  amountAtAction: { type: Number },
  tierAtAction: { type: Number },

  comment: { type: String },
  ipAddress: { type: String },
  actedAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'fms_expenseapprovals' });

ExpenseApprovalSchema.index({ school: 1, expenseRequest: 1, actedAt: 1 });
ExpenseApprovalSchema.index({ school: 1, actor: 1, actedAt: -1 });
ExpenseApprovalSchema.index({ school: 1, step: 1, action: 1, actedAt: -1 });

const IMMUTABLE_OPS = [
  'updateOne', 'updateMany', 'findOneAndUpdate',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
];
IMMUTABLE_OPS.forEach((op) =>
  ExpenseApprovalSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error(
      'fms_expenseapprovals is append-only — an approval record is the evidence ' +
      'of how a payment was authorised and cannot be altered'
    );
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsApprovalMatrix: reg('FmsApprovalMatrix', ApprovalMatrixSchema),
  FmsExpenseApproval: reg('FmsExpenseApproval', ExpenseApprovalSchema),
  APPROVAL_ACTION,
  APPROVAL_STEP,
};