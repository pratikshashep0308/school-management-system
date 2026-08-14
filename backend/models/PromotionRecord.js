/**
 * PromotionRecord — FP-014
 * Requirements: GAP-SIS-005, GAP-SIS-007, GAP-SIS-008
 * FINAL LLD 1.1 §10.1, §18.3 · Decisions D-004, D-006
 *
 * ── What this collection is for ─────────────────────────────────────────────
 * This is the authoritative record of a student's movement between classes, and
 * under D-006 it is the primary source for historical enrolment.
 *
 * `Class` is global and never cloned per year (D-002), and `Class.students[]` is
 * a current-cohort cache that answers only who is in a class *now* (D-005). So
 * nothing in the Class collection can tell you who was in Grade 6-A last year.
 * These records can, correlated with `academicYearId`-stamped Attendance,
 * Result and Timetable rows.
 *
 * ── fromClass/toClass are identity; the strings are not ─────────────────────
 * `fromClass` and `toClass` are ObjectId references and are what the historical
 * enrolment service resolves against. The grade/section strings alongside them
 * are denormalised readability aids, retained so a record stays legible after a
 * Class is renamed. They must never be used to resolve identity.
 *
 * ── Append-only ─────────────────────────────────────────────────────────────
 * A promotion decision is a historical fact. It is never updated after confirm;
 * a correction appends a new record. Enforced at the model layer rather than by
 * convention, because a convention cannot be tested.
 */
const mongoose = require('mongoose');

const PromotionRecordSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },

    // ── Identity of the transition (D-004) ──────────────────────────────────
    fromClass: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    // Absent for a 'graduated' decision — there is no next class.
    toClass: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },

    // ── Denormalised readability aids — NOT identity ────────────────────────
    // Retained so the record stays legible after a Class is renamed. Never used
    // to resolve which Class a student moved between.
    fromGrade: { type: String },
    fromSection: { type: String },
    toGrade: { type: String },
    toSection: { type: String },

    fromAcademicYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: true,
    },
    // Absent for 'graduated'. Otherwise the year the student moves into, which
    // must already exist as draft or active before promotion runs (§15).
    toAcademicYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      default: null,
    },

    decision: {
      type: String,
      enum: ['promoted', 'retained', 'graduated'],
      required: true,
    },

    // BR-SIS-02: retention is a visible decision with a recorded reason, never
    // an accidental omission.
    retentionReason: { type: String, default: null },

    // BR-SIS-03: an administrator may override the computed outcome, but the
    // reason is mandatory and forms part of the audit payload.
    overridden: { type: Boolean, default: false },
    overrideReason: { type: String, default: null },

    /**
     * Snapshot of the per-subject outcome AND its provenance (D-001, D-011).
     * Shape: {
     *   examGroup:    ObjectId,          // which ExamGroup supplied the marks
     *   retestPolicy: String,            // policy applied, from the RETEST group
     *   subjects: [{ examSubject, obtained, graceMarks, isPass, isAbsent,
     *                sourceExamGroup }]
     * }
     * Recorded so a decision stays explainable after a later
     * ExamMark.corrections[] entry changes the underlying mark.
     */
    computedPassFail: { type: mongoose.Schema.Types.Mixed, default: null },

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decisionDate: { type: Date, default: Date.now },

    // Groups a bulk per-class operation (GAP-SIS-009). Re-running a batch with
    // the same id must be a no-op.
    batchId: { type: String, index: true },

    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  },
  { timestamps: true }
);

PromotionRecordSchema.index({ school: 1, student: 1, fromAcademicYear: 1 });
PromotionRecordSchema.index({ school: 1, batchId: 1 });
PromotionRecordSchema.index({ school: 1, fromClass: 1, fromAcademicYear: 1 });
PromotionRecordSchema.index({ school: 1, toClass: 1, toAcademicYear: 1 });

// ── BR-SIS-02 / BR-SIS-03: reasons are mandatory where the decision needs one ─
PromotionRecordSchema.pre('validate', function (next) {
  if (this.decision === 'retained' && !String(this.retentionReason || '').trim()) {
    return next(
      new Error(
        'RETENTION_REASON_REQUIRED: a retained decision must record why, so the ' +
          'outcome is a visible decision rather than an accidental omission.'
      )
    );
  }
  if (this.overridden && !String(this.overrideReason || '').trim()) {
    return next(
      new Error(
        'PROMOTION_OVERRIDE_REASON_REQUIRED: overriding the computed outcome ' +
          'requires a recorded reason.'
      )
    );
  }
  if (this.decision === 'promoted' && !this.toClass) {
    return next(
      new Error('PROMOTION_TARGET_REQUIRED: a promoted decision must name a target class.')
    );
  }
  if (this.decision === 'graduated' && this.toClass) {
    return next(
      new Error(
        'PROMOTION_GRADUATED_HAS_TARGET: a graduated student has no next class. ' +
          'Leave toClass null.'
      )
    );
  }
  return next();
});

/**
 * Append-only. A promotion decision is a historical fact; correcting one appends
 * a new record rather than rewriting the original, so the sequence of decisions
 * remains inspectable.
 *
 * Enforced on every mutating path — document save, and the query-level update
 * helpers, which would otherwise bypass a document hook entirely.
 */
PromotionRecordSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(
      new Error(
        'PROMOTION_RECORD_IMMUTABLE: PromotionRecord is append-only. Append a ' +
          'correcting record instead of modifying this one.'
      )
    );
  }
  return next();
});

['updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate', 'replaceOne'].forEach(
  (op) => {
    PromotionRecordSchema.pre(op, function (next) {
      return next(
        new Error(
          `PROMOTION_RECORD_IMMUTABLE: ${op} is not permitted on PromotionRecord. ` +
            'Append a correcting record instead.'
        )
      );
    });
  }
);

/** Human-readable transition, for audit payloads and the review table. */
PromotionRecordSchema.methods.describe = function () {
  const from = `${this.fromGrade || '?'}-${this.fromSection || '?'}`;
  if (this.decision === 'graduated') return `${from} → graduated`;
  if (this.decision === 'retained') return `${from} → retained`;
  return `${from} → ${this.toGrade || '?'}-${this.toSection || '?'}`;
};

module.exports =
  mongoose.models.PromotionRecord ||
  mongoose.model('PromotionRecord', PromotionRecordSchema);
