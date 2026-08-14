// backend/models/FeeType.js
// Dynamic fee categories created by admin (Tuition, Exam, Uniform, Transport, etc.)

const mongoose = require('mongoose');

const FeeTypeSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },       // "Tuition Fee"
  description: { type: String, default: '' },
  category: {
    type: String,
    enum: ['tuition', 'exam', 'transport', 'uniform', 'library', 'sports', 'other'],
    default: 'other',
  },
  isRecurring: { type: Boolean, default: false },                  // monthly recurring
  frequency: {
    type: String,
    enum: ['monthly', 'quarterly', 'annually', 'one-time'],
    default: 'one-time',
  },
  defaultAmount: { type: Number, default: 0 },                     // suggested default
  isActive:    { type: Boolean, default: true },
  school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt:   { type: Date, default: Date.now },
});

FeeTypeSchema.index({ school: 1, name: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.FeeType || mongoose.model('FeeType', FeeTypeSchema);