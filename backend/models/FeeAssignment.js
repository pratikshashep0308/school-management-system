// backend/models/FeeAssignment.js
// Links a fee type to a student/class with amount, due date,
// discount, installments, and transport integration.

const mongoose = require('mongoose');

// ── Installment sub-document ──────────────────────────────────────────────────
const InstallmentSchema = new mongoose.Schema({
  number:       { type: Number, required: true },  // 1, 2, 3…
  amount:       { type: Number, required: true },
  dueDate:      { type: Date, required: true },
  paidAmount:   { type: Number, default: 0 },
  paidOn:       { type: Date },
  status:       { type: String, enum: ['pending','partial','paid','overdue'], default: 'pending' },
  receiptNumber: String,
}, { _id: true });

// ── Main assignment document ──────────────────────────────────────────────────
const FeeAssignmentSchema = new mongoose.Schema({
  // Who it applies to
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student' }, // null = class-wide
  class:    { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  section:  { type: String },

  // What fee
  feeType:  { type: mongoose.Schema.Types.ObjectId, ref: 'FeeType', required: true },

  // Amount
  baseAmount:    { type: Number, required: true },
  discountPct:   { type: Number, default: 0 },     // 0–100 percent
  discountAmt:   { type: Number, default: 0 },     // flat discount
  discountReason:{ type: String },                 // "Scholarship", "Sibling", "Waiver"
  finalAmount:   { type: Number, required: true },  // baseAmount - discount (computed)
  lateFeePerDay: { type: Number, default: 0 },     // ₹ per day after dueDate

  // Transport integration
  transportRoute: { type: mongoose.Schema.Types.ObjectId, ref: 'Transport' },

  // Payment tracking
  paidAmount:   { type: Number, default: 0 },
  pendingAmount: { type: Number },
  status: {
    type: String,
    enum: ['pending','partial','paid','overdue','waived'],
    default: 'pending',
  },

  // Due date
  dueDate:  { type: Date },
  month:    { type: String },  // "April 2026"
  year:     { type: Number },

  // Installment support
  hasInstallments: { type: Boolean, default: false },
  installments:    [InstallmentSchema],

  // Payments recorded against this assignment
  payments: [{
    amount:        { type: Number, required: true },
    paidOn:        { type: Date, default: Date.now },
    method:        { type: String, enum: ['cash','upi','online','cheque','bank'], default: 'cash' },
    transactionId: String,
    receiptNumber: String,
    remarks:       String,
    collectedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    installmentNumber: Number,  // which installment this applies to
  }],

  school:    { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Auto-compute pendingAmount + status before save
FeeAssignmentSchema.pre('save', function(next) {
  this.paidAmount   = this.payments.reduce((s, p) => s + p.amount, 0);
  this.pendingAmount = Math.max(0, this.finalAmount - this.paidAmount);

  // Check late fee
  if (this.dueDate && new Date() > this.dueDate && this.status !== 'paid' && this.status !== 'waived') {
    const daysLate = Math.floor((new Date() - this.dueDate) / (1000 * 60 * 60 * 24));
    const lateFee  = daysLate * (this.lateFeePerDay || 0);
    // Add late fee to pending (informational, not stored separately)
    this._lateFeeAccrued = lateFee;
  }

  if (this.paidAmount <= 0)              this.status = 'pending';
  else if (this.paidAmount >= this.finalAmount) this.status = 'paid';
  else                                   this.status = 'partial';

  this.updatedAt = new Date();
  next();
});

FeeAssignmentSchema.index({ student: 1, school: 1 });
FeeAssignmentSchema.index({ class: 1, school: 1 });
FeeAssignmentSchema.index({ feeType: 1, school: 1 });

module.exports = mongoose.models.FeeAssignment || mongoose.model('FeeAssignment', FeeAssignmentSchema);