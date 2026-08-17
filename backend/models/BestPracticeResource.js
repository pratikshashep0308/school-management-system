/**
 * BestPracticeResource — FP-018 · GAP-PLC-004 · Decision D-009
 * FINAL LLD 1.1 §26 · Amendment reference: ADR-09 closed
 *
 * ── D-009 is binding ────────────────────────────────────────────────────────
 * This is a NEW DEDICATED COLLECTION. It does not extend ContentItem, is not
 * embedded within ContentItem, and does not reuse ContentItem as a persistence
 * model. No type discriminator is added to ContentItem.
 *
 * This REVERSES the reconciliation's own earlier recommendation, which had
 * suggested folding it into ContentItem. The approved decision governs.
 *
 * It may reference School, Teacher, Subject, competency, grade, curriculum and
 * ContentItem — references are not inheritance.
 */
const mongoose = require('mongoose');

const BestPracticeResourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    summary: { type: String, trim: true },
    body: { type: String, trim: true },

    resourceType: {
      type: String,
      enum: ['lesson-idea', 'classroom-technique', 'assessment-approach', 'resource', 'other'],
      default: 'other',
    },

    // References to other entities — NOT inheritance from them.
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    grade: { type: Number, min: 1, max: 12 },
    competencies: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CompetencyFramework' }],
      default: [],
    },
    contentRefs: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContentItem' }],
      default: [],
    },
    attachments: { type: [String], default: [] },

    contributedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },

    status: {
      type: String,
      enum: ['draft', 'submitted', 'published', 'archived'],
      default: 'draft',
    },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    tags: { type: [String], default: [] },
    usageCount: { type: Number, default: 0, min: 0 },

    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  },
  { timestamps: true }
);

BestPracticeResourceSchema.index({ school: 1, status: 1, publishedAt: -1 });
BestPracticeResourceSchema.index({ school: 1, subject: 1, grade: 1 });
BestPracticeResourceSchema.index({ title: 'text', summary: 'text', tags: 'text' });

/** Publishing requires enough context for another teacher to find and use it. */
BestPracticeResourceSchema.pre('validate', function (next) {
  if (this.status === 'published') {
    if (!String(this.summary || '').trim()) {
      return next(
        new Error('BEST_PRACTICE_INCOMPLETE: a published resource requires a summary.')
      );
    }
    if (!this.subject && (!this.competencies || this.competencies.length === 0)) {
      return next(
        new Error(
          'BEST_PRACTICE_INCOMPLETE: a published resource requires a subject or at least ' +
            'one competency, otherwise it cannot be found by the teachers who need it.'
        )
      );
    }
  }
  return next();
});

/** Lifecycle transitions. Archived is terminal; a new resource supersedes it. */
const ALLOWED = {
  draft: ['submitted', 'archived'],
  submitted: ['published', 'draft', 'archived'],
  published: ['archived'],
  archived: [],
};

BestPracticeResourceSchema.methods.canTransitionTo = function (next) {
  return (ALLOWED[this.status] || []).includes(next);
};

module.exports =
  mongoose.models.BestPracticeResource ||
  mongoose.model('BestPracticeResource', BestPracticeResourceSchema);
module.exports.ALLOWED_TRANSITIONS = ALLOWED;
