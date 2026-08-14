// backend/models/Report.js
const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true },
  module: {
    type: String,
    required: true,
    enum: ['students','teachers','classes','fees','attendance','exams','transport','library'],
  },
  fields:  [String],
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  groupBy: { type: String, default: '' },
  sortBy: {
    field: { type: String, default: 'createdAt' },
    order: { type: Number, enum: [1, -1], default: -1 },
  },
  chartConfig: {
    enabled: { type: Boolean, default: false },
    type:    { type: String, enum: ['bar','pie','line','doughnut',''], default: '' },
    xAxis:   { type: String, default: '' },
    yAxis:   { type: String, default: '' },
  },
  isTemplate:        { type: Boolean, default: false },
  scheduleFrequency: { type: String, enum: ['','daily','weekly','monthly'], default: '' },
  downloadHistory: [{
    exportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    format:     { type: String, enum: ['pdf','xlsx','csv'] },
    exportedAt: { type: Date, default: Date.now },
    rowCount:   { type: Number, default: 0 },
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  school:    { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ReportSchema.pre('save', function(next) { this.updatedAt = Date.now(); next(); });
ReportSchema.index({ school: 1, module: 1 });
ReportSchema.index({ school: 1, isTemplate: 1 });

module.exports = mongoose.models.Report || mongoose.model('Report', ReportSchema);