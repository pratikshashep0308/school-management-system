// backend/models/Expense.js
// Two models in one file: ExpenseCategory + Expense
const mongoose = require('mongoose');

// ─── EXPENSE CATEGORY ─────────────────────────────────────────────────────────
const ExpenseCategorySchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  color:       { type: String, default: '#6B7280' },   // hex for UI chips
  icon:        { type: String, default: '💰' },         // emoji icon
  isActive:    { type: Boolean, default: true },
  school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt:   { type: Date, default: Date.now },
});
ExpenseCategorySchema.index({ school: 1, name: 1 }, { unique: true });

// ─── EXPENSE ─────────────────────────────────────────────────────────────────
const ExpenseSchema = new mongoose.Schema({
  category:      { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
  amount:        { type: Number, required: true, min: 0 },
  date:          { type: Date, required: true, default: Date.now },
  description:   { type: String, required: true, trim: true },
  paymentMethod: {
    type: String,
    enum: ['cash', 'upi', 'bank', 'cheque', 'online'],
    default: 'cash',
  },

  // Attachment — stored via Cloudinary (already configured in project)
  attachmentUrl:  { type: String, default: '' },
  attachmentType: { type: String, enum: ['image', 'pdf', ''], default: '' }, // 'image' | 'pdf'

  // Recurring config — if this is a recurring template
  isRecurring:    { type: Boolean, default: false },
  recurringType:  { type: String, enum: ['monthly', 'weekly', 'yearly', ''], default: '' },
  recurringDay:   { type: Number, default: 1 },  // day of month (1–28) for monthly
  nextDueDate:    { type: Date },
  parentExpense:  { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }, // link recurring copy → template

  // Budget limit alert
  budgetLimit:    { type: Number, default: 0 },  // 0 = no limit

  // Audit
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  editHistory: [{
    editedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    editedAt:  { type: Date, default: Date.now },
    oldAmount: Number,
    oldDesc:   String,
    note:      String,
  }],

  school:     { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now },
});

ExpenseSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for fast filtering
ExpenseSchema.index({ school: 1, date: -1 });
ExpenseSchema.index({ school: 1, category: 1, date: -1 });
ExpenseSchema.index({ school: 1, isRecurring: 1 });

const ExpenseCategory = mongoose.models.ExpenseCategory
  || mongoose.model('ExpenseCategory', ExpenseCategorySchema);

const Expense = mongoose.models.Expense
  || mongoose.model('Expense', ExpenseSchema);

module.exports = { Expense, ExpenseCategory };