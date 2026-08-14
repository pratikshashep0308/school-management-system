/**
 * QualityIndicator / Insight / Consent — FP-022 · GAP-QA-001, GAP-AI-001, GAP-CON-001
 * FINAL LLD 1.1 §32, §44 · ADR-11 open (Insight GENERATION only)
 *
 * The model definitions are unblocked. Insight GENERATION depends on the LLM
 * provider (ADR-11) and is FP-080; the collection and its integrity rules are
 * built here so downstream work has something to write against.
 */
const mongoose = require('mongoose');

// ── QualityIndicator (GAP-QA-001) ────────────────────────────────────────────
const QualityIndicatorSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    standard: { type: String, trim: true },
    status: {
      type: String,
      enum: ['not-started', 'in-progress', 'met', 'not-met'],
      default: 'not-started',
    },
    evidence: {
      type: [{ collectionName: String, id: mongoose.Schema.Types.ObjectId, note: String }],
      default: [],
    },
    improvementAction: { type: String, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dueDate: { type: Date },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
  },
  { timestamps: true }
);
QualityIndicatorSchema.index({ school: 1, status: 1 });

// ── Insight (GAP-AI-001) ──────────────────────────────────────────────────────
const InsightSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    affectedEntity: {
      collectionName: { type: String, required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    },
    // GAP-AI-002 — every insight is explainable in plain language. Required.
    explanation: { type: String, required: true, trim: true },
    sourceModules: { type: [String], default: [] },
    // GAP-AI-004 — at least one source reference, so an insight can be traced to
    // the data that produced it. Enforced below.
    sourceRefs: {
      type: [{ collectionName: String, id: mongoose.Schema.Types.ObjectId }],
      required: true,
    },
    reviewStatus: {
      type: String,
      enum: ['unreviewed', 'accepted', 'dismissed'],
      default: 'unreviewed',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    confidence: { type: Number, min: 0, max: 1, default: null },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  },
  { timestamps: true }
);
InsightSchema.index({ school: 1, reviewStatus: 1, createdAt: -1 });

/**
 * An insight with no explanation or no source reference is not persisted. An
 * unexplainable insight cannot be reviewed, and an unsourced one cannot be
 * verified — either would erode trust in the whole feed.
 */
InsightSchema.pre('validate', function (next) {
  if (!String(this.explanation || '').trim()) {
    return next(new Error('INSIGHT_EXPLANATION_REQUIRED: an insight must explain itself in plain language.'));
  }
  if (!Array.isArray(this.sourceRefs) || this.sourceRefs.length === 0) {
    return next(new Error('INSIGHT_SOURCE_REQUIRED: an insight must reference at least one source record.'));
  }
  next();
});

// ── Consent (GAP-CON-001) ─────────────────────────────────────────────────────
const ConsentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    consentType: { type: String, required: true },
    version: { type: String, required: true },
    granted: { type: Boolean, required: true },
    grantedAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  },
  { timestamps: true }
);
ConsentSchema.index({ school: 1, student: 1, consentType: 1, version: 1 });

/**
 * Consent is append-only. A withdrawal appends a new record with granted:false;
 * it never mutates the prior grant. A consent history that can be rewritten is
 * not a consent record.
 */
ConsentSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('CONSENT_IMMUTABLE: consent is append-only. Append a new record to change state.'));
  }
  if (this.granted && !this.grantedAt) this.grantedAt = new Date();
  if (!this.granted && !this.withdrawnAt) this.withdrawnAt = new Date();
  next();
});
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'].forEach((op) => {
  ConsentSchema.pre(op, function (next) {
    next(new Error(`CONSENT_IMMUTABLE: ${op} is not permitted. Append a new consent record.`));
  });
});

module.exports = {
  QualityIndicator: mongoose.models.QualityIndicator || mongoose.model('QualityIndicator', QualityIndicatorSchema),
  Insight: mongoose.models.Insight || mongoose.model('Insight', InsightSchema),
  Consent: mongoose.models.Consent || mongoose.model('Consent', ConsentSchema),
};
