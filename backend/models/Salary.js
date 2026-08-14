const mongoose = require('mongoose');

const SalarySlipSchema = new mongoose.Schema({
  school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  teacher:      { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  month:        { type: Number, required: true },   // 1-12
  year:         { type: Number, required: true },
  basicSalary:  { type: Number, required: true, default: 0 },
  allowances:   {
    hra:        { type: Number, default: 0 },
    da:         { type: Number, default: 0 },
    ta:         { type: Number, default: 0 },
    medical:    { type: Number, default: 0 },
    other:      { type: Number, default: 0 },
  },
  deductions:   {
    pf:              { type: Number, default: 0 },
    tax:             { type: Number, default: 0 },   // TDS
    // Added 2026-07-30. The school confirmed it deducts both. Until now they
    // were pooled into `other`, which meant the ESIC and professional tax
    // liability accounts could never be fed and read zero — indistinguishable
    // from "nothing was deducted".
    //
    // Historic slips keep their combined figure in `other` and are NOT
    // restated: reclassifying past postings is a journal voucher and the
    // accountant's decision, not a migration script.
    esic:            { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    loan:            { type: Number, default: 0 },
    other:           { type: Number, default: 0 },
  },
  grossSalary:  { type: Number, default: 0 },
  netSalary:    { type: Number, default: 0 },
  paymentMode:  { type: String, enum: ['cash','bank','upi','cheque'], default: 'bank' },
  paymentDate:  { type: Date, default: Date.now },
  status:       { type: String, enum: ['paid','pending','hold'], default: 'pending' },
  remarks:      String,
  paidBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

SalarySlipSchema.index({ school: 1, teacher: 1, month: 1, year: 1 }, { unique: true });
SalarySlipSchema.index({ school: 1, month: 1, year: 1 });

module.exports = mongoose.model('SalarySlip', SalarySlipSchema);