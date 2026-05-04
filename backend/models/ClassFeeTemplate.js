// backend/models/ClassFeeTemplate.js
// Default fee structure for a class. When a student is enrolled into a class
// that has a template, every line in the template auto-creates a FeeAssignment
// for that student (with a per-student override allowed at apply time).

const mongoose = require('mongoose');

// ── One line in a template: a fee category with its 12-month price ──────────
const TemplateLineSchema = new mongoose.Schema({
  feeType:       { type: mongoose.Schema.Types.ObjectId, ref: 'FeeType', required: true },
  annualAmount:  { type: Number, required: true, min: 0 }, // 12-month price; half-year = annualAmount / 2
  notes:         { type: String, default: '' },
}, { _id: true });

const ClassFeeTemplateSchema = new mongoose.Schema({
  class:    { type: mongoose.Schema.Types.ObjectId, ref: 'Class',  required: true },
  school:   { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  isActive: { type: Boolean, default: true },
  lines:    [TemplateLineSchema],
  createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt:{ type: Date, default: Date.now },
  updatedAt:{ type: Date, default: Date.now },
});

// One template per class per school
ClassFeeTemplateSchema.index({ class: 1, school: 1 }, { unique: true });

ClassFeeTemplateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.ClassFeeTemplate
  || mongoose.model('ClassFeeTemplate', ClassFeeTemplateSchema);