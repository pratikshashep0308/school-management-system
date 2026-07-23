// backend/models/examModels.js
// Stage 1 of the advanced exam module: configurable exam types, grading
// schemes, and component-based marks. The original Exam/Result models in
// models/index.js are left untouched so existing exams keep working.
const mongoose = require('mongoose');

// ── EXAM TYPE ────────────────────────────────────────────────────────────────
// Replaces the hardcoded enum (unit/midterm/final/...) with school-defined
// types. Seeded with the old values so existing exams still map cleanly.
const ExamTypeSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },   // "Unit Test"
  code:        { type: String, trim: true, uppercase: true },  // "UT"
  weightage:   { type: Number, default: 0 },   // % contribution to final result
  description: { type: String, default: '' },
  isActive:    { type: Boolean, default: true },
  school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
ExamTypeSchema.index({ school: 1, name: 1 }, { unique: true });

// ── GRADING SCHEME ───────────────────────────────────────────────────────────
// Admin-defined grade bands. Previously the bands were hardcoded in the
// Result pre-save hook, so every school got A+/A/B+ at fixed cut-offs.
const GradeBandSchema = new mongoose.Schema({
  grade:      { type: String, required: true },   // "A+"
  minPercent: { type: Number, required: true },   // 91
  maxPercent: { type: Number, required: true },   // 100
  gradePoint: { type: Number, default: 0 },       // 10  (for GPA/CGPA)
  remark:     { type: String, default: '' },      // "Outstanding"
  isFail:     { type: Boolean, default: false },
}, { _id: false });

const GradingSchemeSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  // percentage → show %, grade → show letter, cgpa/gpa → show grade points
  mode:      { type: String, enum: ['percentage', 'grade', 'cgpa', 'gpa'], default: 'grade' },
  bands:     { type: [GradeBandSchema], default: [] },
  passMark:  { type: Number, default: 35 },   // % needed to pass a subject
  isDefault: { type: Boolean, default: false },
  isActive:  { type: Boolean, default: true },
  school:    { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
GradingSchemeSchema.index({ school: 1, name: 1 }, { unique: true });

// Resolve a percentage to its band. Returns null when no band matches.
GradingSchemeSchema.methods.gradeFor = function (percent) {
  if (percent == null || isNaN(percent)) return null;
  return this.bands.find(b => percent >= b.minPercent && percent <= b.maxPercent) || null;
};

// ── EXAM SUBJECT ─────────────────────────────────────────────────────────────
// One row per subject within an exam. This is what makes an exam multi-subject:
// the original model allowed a single subject per exam record.
const ExamSubjectSchema = new mongoose.Schema({
  examGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamGroup', required: true },
  subject:   { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  class:     { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },

  date:      { type: Date },
  startTime: { type: String },   // "10:00"
  endTime:   { type: String },   // "13:00"
  room:      { type: String, default: '' },
  invigilator: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },

  // Mark components. Each is optional — a school may use only theory.
  components: {
    theory:     { max: { type: Number, default: 100 }, enabled: { type: Boolean, default: true  } },
    practical:  { max: { type: Number, default: 0   }, enabled: { type: Boolean, default: false } },
    internal:   { max: { type: Number, default: 0   }, enabled: { type: Boolean, default: false } },
    project:    { max: { type: Number, default: 0   }, enabled: { type: Boolean, default: false } },
    oral:       { max: { type: Number, default: 0   }, enabled: { type: Boolean, default: false } },
    assignment: { max: { type: Number, default: 0   }, enabled: { type: Boolean, default: false } },
  },

  passingMarks: { type: Number, default: 35 },
  // Locked once results are published; admin can unlock to correct.
  isLocked:  { type: Boolean, default: false },
  school:    { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
}, { timestamps: true });
ExamSubjectSchema.index({ examGroup: 1, subject: 1, class: 1 }, { unique: true });

// Total marks available across all enabled components
ExamSubjectSchema.virtual('totalMarks').get(function () {
  const c = this.components || {};
  return ['theory','practical','internal','project','oral','assignment']
    .reduce((sum, k) => sum + (c[k]?.enabled ? (c[k].max || 0) : 0), 0);
});
ExamSubjectSchema.set('toJSON',   { virtuals: true });
ExamSubjectSchema.set('toObject', { virtuals: true });

// ── EXAM GROUP ───────────────────────────────────────────────────────────────
// The exam itself ("Half Yearly 2026"), spanning many subjects and classes.
const ExamGroupSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  examType:     { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType' },
  academicYear: { type: String, default: '' },   // "2026-27"
  session:      { type: String, default: '' },
  classes:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
  startDate:    { type: Date },
  endDate:      { type: Date },
  description:  { type: String, default: '' },
  instructions: { type: String, default: '' },
  gradingScheme:{ type: mongoose.Schema.Types.ObjectId, ref: 'GradingScheme' },

  status: {
    type: String,
    enum: ['draft', 'scheduled', 'ongoing', 'completed', 'published'],
    default: 'draft',
  },
  resultsPublishedAt: { type: Date },
  resultsPublishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  school:    { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
ExamGroupSchema.index({ school: 1, status: 1, startDate: -1 });

// ── EXAM MARK ────────────────────────────────────────────────────────────────
// One row per student per exam-subject, holding each component separately.
const ExamMarkSchema = new mongoose.Schema({
  examGroup:   { type: mongoose.Schema.Types.ObjectId, ref: 'ExamGroup', required: true },
  examSubject: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSubject', required: true },
  student:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },

  marks: {
    theory:     { type: Number, default: null },
    practical:  { type: Number, default: null },
    internal:   { type: Number, default: null },
    project:    { type: Number, default: null },
    oral:       { type: Number, default: null },
    assignment: { type: Number, default: null },
  },
  graceMarks: { type: Number, default: 0 },

  // Derived on save so reports don't have to recompute every time
  obtained:   { type: Number, default: 0 },
  maxMarks:   { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  grade:      { type: String, default: '' },
  gradePoint: { type: Number, default: 0 },
  isPass:     { type: Boolean, default: false },

  isAbsent:   { type: Boolean, default: false },
  remarks:    { type: String, default: '' },

  // draft = teacher still working, published = visible to students/parents
  status:     { type: String, enum: ['draft', 'published'], default: 'draft' },

  enteredBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  enteredAt:  { type: Date },
  school:     { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
}, { timestamps: true });
ExamMarkSchema.index({ examSubject: 1, student: 1 }, { unique: true });
ExamMarkSchema.index({ examGroup: 1, student: 1 });

module.exports = {
  ExamType:      mongoose.models.ExamType      || mongoose.model('ExamType', ExamTypeSchema),
  GradingScheme: mongoose.models.GradingScheme || mongoose.model('GradingScheme', GradingSchemeSchema),
  ExamGroup:     mongoose.models.ExamGroup     || mongoose.model('ExamGroup', ExamGroupSchema),
  ExamSubject:   mongoose.models.ExamSubject   || mongoose.model('ExamSubject', ExamSubjectSchema),
  ExamMark:      mongoose.models.ExamMark      || mongoose.model('ExamMark', ExamMarkSchema),
};