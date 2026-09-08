// backend/models/questionPaperModels.js
//
// Question Paper Management — additive to the advanced exam module. A
// QuestionPaper is a subject-wise paper tied to an existing ExamGroup + Class +
// Subject; its questions are embedded (a paper is edited and printed as a whole,
// so its questions have no life independent of it). Reusable questions live
// separately in QuestionBankItem so they can be pulled into any paper.
//
// Everything is school-scoped, matching every other model in this codebase, and
// references existing collections (ExamGroup, Class, Subject, AcademicYear,
// User) rather than duplicating any of them.

const mongoose = require('mongoose');

const QUESTION_TYPES = [
  'mcq', 'truefalse', 'fillblank', 'short', 'long', 'match',
];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

// ── Embedded question ────────────────────────────────────────────────────────
// One schema serves every type; type-specific fields (options, correctAnswer,
// matchPairs) are optional and only meaningful for the relevant types. This
// keeps a paper's questions in one array that can be reordered by `order`.
const QuestionSchema = new mongoose.Schema({
  text:        { type: String, required: true, trim: true },
  type:        { type: String, enum: QUESTION_TYPES, default: 'short' },
  marks:       { type: Number, default: 1, min: 0 },
  difficulty:  { type: String, enum: DIFFICULTIES, default: 'medium' },
  instructions:{ type: String, default: '' },

  // MCQ: the choices, plus which one is correct (index into options).
  options:       [{ type: String }],
  correctAnswer: { type: String, default: '' },   // MCQ correct option / T-F / fill answer

  // Match the following: left↔right pairs.
  matchPairs: [{ left: { type: String }, right: { type: String } }],

  // Ordering within the paper. Lower shows first. Re-sequenced on save.
  order: { type: Number, default: 0 },
}, { _id: true });

// ── Question paper ───────────────────────────────────────────────────────────
const QuestionPaperSchema = new mongoose.Schema({
  title:        { type: String, required: true, trim: true },

  // Context — all references to existing collections.
  academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
  examGroup:    { type: mongoose.Schema.Types.ObjectId, ref: 'ExamGroup' },
  class:        { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  section:      { type: String, default: '' },    // optional label
  subject:      { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },

  durationMinutes: { type: Number, default: 0 },
  generalInstructions: { type: String, default: '' },

  questions: [QuestionSchema],

  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  publishedAt: { type: Date },

  school:    { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Derived totals — computed, never stored, so they can't drift from the array.
QuestionPaperSchema.virtual('totalQuestions').get(function () {
  return (this.questions || []).length;
});
QuestionPaperSchema.virtual('totalMarks').get(function () {
  return (this.questions || []).reduce((s, q) => s + (q.marks || 0), 0);
});
QuestionPaperSchema.set('toJSON',   { virtuals: true });
QuestionPaperSchema.set('toObject', { virtuals: true });

QuestionPaperSchema.index({ school: 1, examGroup: 1, class: 1, subject: 1 });
QuestionPaperSchema.index({ school: 1, status: 1, updatedAt: -1 });

// ── Reusable question bank item ──────────────────────────────────────────────
// A standalone, reusable question. Same fields as an embedded question plus the
// class/subject context used to filter the bank. Pulling one into a paper copies
// its content into the paper's embedded questions — the paper then owns its copy,
// so later edits to the bank item don't rewrite historical papers.
const QuestionBankItemSchema = new mongoose.Schema({
  text:        { type: String, required: true, trim: true },
  type:        { type: String, enum: QUESTION_TYPES, default: 'short' },
  marks:       { type: Number, default: 1, min: 0 },
  difficulty:  { type: String, enum: DIFFICULTIES, default: 'medium' },
  instructions:{ type: String, default: '' },
  options:       [{ type: String }],
  correctAnswer: { type: String, default: '' },
  matchPairs: [{ left: { type: String }, right: { type: String } }],

  class:   { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },

  school:    { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

QuestionBankItemSchema.index({ school: 1, subject: 1, class: 1, type: 1, difficulty: 1 });

module.exports = {
  QUESTION_TYPES,
  DIFFICULTIES,
  QuestionPaper:    mongoose.models.QuestionPaper    || mongoose.model('QuestionPaper', QuestionPaperSchema),
  QuestionBankItem: mongoose.models.QuestionBankItem || mongoose.model('QuestionBankItem', QuestionBankItemSchema),
};
