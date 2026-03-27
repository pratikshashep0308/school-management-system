const mongoose = require('mongoose');

// ── STUDENT FEE LEDGER ──
// One document per student — tracks total, paid, pending, and full payment history
const StudentFeeSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, unique: true },
  class:   { type: mongoose.Schema.Types.ObjectId, ref: 'Class',   required: true },
  school:  { type: mongoose.Schema.Types.ObjectId, ref: 'School',  required: true },
  section: { type: String },

  // Aggregated amounts (auto-updated on every payment)
  totalFees:   { type: Number, default: 0 },
  paidAmount:  { type: Number, default: 0 },
  pendingAmount: { type: Number, default: 0 },

  // Status derived from amounts
  paymentStatus: {
    type: String,
    enum: ['not_paid', 'partial', 'paid'],
    default: 'not_paid'
  },

  // Full payment history
  paymentHistory: [{
    amount:        { type: Number, required: true },
    paidOn:        { type: Date, default: Date.now },
    method:        { type: String, enum: ['cash', 'online', 'cheque', 'bank', 'upi'], default: 'cash' },
    transactionId: { type: String },
    receiptNumber: { type: String },
    month:         { type: String },   // "March 2026"
    year:          { type: Number },
    remarks:       { type: String },
    collectedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    feeStructure:  { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure' },
  }],

  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

// Recalculate derived fields before every save
StudentFeeSchema.pre('save', function (next) {
  this.paidAmount    = this.paymentHistory.reduce((sum, p) => sum + p.amount, 0);
  this.pendingAmount = Math.max(0, this.totalFees - this.paidAmount);

  if (this.paidAmount <= 0)                         this.paymentStatus = 'not_paid';
  else if (this.paidAmount >= this.totalFees)        this.paymentStatus = 'paid';
  else                                               this.paymentStatus = 'partial';

  this.updatedAt = new Date();
  next();
});

// ── FEE STRUCTURE (unchanged, re-exported for clarity) ──
const FeeStructureSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  class:       { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  amount:      { type: Number, required: true },
  frequency:   { type: String, enum: ['monthly', 'quarterly', 'annually', 'one-time'], default: 'monthly' },
  dueDay:      { type: Number, default: 10 },
  lateFee:     { type: Number, default: 200 },
  description: String,
  school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt:   { type: Date, default: Date.now }
});

// ── FEE PAYMENT (legacy, kept for backward compat) ──
const FeePaymentSchema = new mongoose.Schema({
  student:      { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  feeStructure: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure' },
  amount:       { type: Number, required: true },
  paidOn:       { type: Date, default: Date.now },
  method:       { type: String, enum: ['cash', 'online', 'cheque', 'bank', 'upi'], default: 'cash' },
  transactionId: String,
  receiptNumber: { type: String, unique: true },
  status:       { type: String, enum: ['paid', 'pending', 'overdue', 'partial'], default: 'paid' },
  month:        String,
  year:         Number,
  remarks:      String,
  collectedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt:    { type: Date, default: Date.now }
});

FeePaymentSchema.pre('save', function (next) {
  if (!this.receiptNumber) {
    this.receiptNumber = 'RCP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
  }
  next();
});

module.exports.StudentFee  = mongoose.model('StudentFee',  StudentFeeSchema);
module.exports.FeeStructure = mongoose.model('FeeStructure', FeeStructureSchema);
module.exports.FeePayment  = mongoose.model('FeePayment',  FeePaymentSchema);
