// backend/models/ClassFeeTemplate.js
// Default fee structure for a class. When a student is enrolled into a class
// that has a template, every line in the template auto-creates a FeeAssignment
// for that student (with a per-student override allowed at apply time).

const mongoose = require('mongoose');

// ── One line in a template (e.g. "School Fee — ₹500/month, due 5th") ──────────
const TemplateLineSchema = new mongoose.Schema({
  feeType:        { type: mongoose.Schema.Types.ObjectId, ref: 'FeeType', required: true },
  amount:         { type: Number, required: true, min: 0 },
  dueDay:         { type: Number, min: 1, max: 31, default: 5 },   // day-of-month for monthly fees
  dueDate:        { type: Date },                                  // explicit date for one-time fees
  lateFeePerDay:  { type: Number, default: 0 },
  notes:          { type: String, default: '' },
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