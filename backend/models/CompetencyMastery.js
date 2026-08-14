/**
 * CompetencyMastery — FP-016 · GAP-AE-003 · FINAL LLD 1.1 §25
 *
 * ── COMPUTED, NEVER MANUALLY ENTERED ────────────────────────────────────────
 * The recompute job is the sole writer. No create or update API exists for this
 * collection, and the model rejects a write that does not carry the job's marker.
 *
 * That restriction is the requirement, not an implementation preference:
 * GAP-AE-003 specifies mastery as computed from Result and FormativeObservation.
 * A manually entered level would be indistinguishable from a computed one and
 * would silently break the explainability that `sourceRefs` exists to provide.
 */
const mongoose = require('mongoose');

/** Marker the recompute job passes so manual writes can be rejected. */
const COMPUTED_BY_JOB = 'competency-mastery-recompute';

const CompetencyMasterySchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    competency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompetencyFramework',
      required: true,
    },
    // The framework version assessed against. Pinned so a later supersede does
    // not silently reinterpret this record.
    frameworkVersion: { type: Number, required: true },

    level: {
      type: String,
      enum: ['emerging', 'developing', 'proficient'],
      required: true,
    },

    computedAt: { type: Date, required: true, default: Date.now },
    computedBy: { type: String, required: true, default: COMPUTED_BY_JOB },

    // Which records produced this level. An entry without provenance cannot be
    // explained to a parent or a teacher, so it is required.
    sourceRefs: {
      type: [
        new mongoose.Schema(
          {
            collectionName: { type: String, required: true },
            id: { type: mongoose.Schema.Types.ObjectId, required: true },
          },
          { _id: false }
        ),
      ],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message:
          'MASTERY_SOURCE_REQUIRED: a computed mastery level must record which records produced it.',
      },
    },

    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  },
  { timestamps: true }
);

// One current level per student per competency. The recompute upserts against
// this, so it can never produce duplicates.
CompetencyMasterySchema.index({ student: 1, competency: 1 }, { unique: true });
CompetencyMasterySchema.index({ school: 1, academicYearId: 1, student: 1 });
CompetencyMasterySchema.index({ school: 1, level: 1 });

CompetencyMasterySchema.pre('save', function (next) {
  if (this.computedBy !== COMPUTED_BY_JOB) {
    return next(
      new Error(
        'MASTERY_MANUAL_WRITE_FORBIDDEN: CompetencyMastery is computed from Result ' +
          'and FormativeObservation records. It is not manually entered.'
      )
    );
  }
  return next();
});

module.exports =
  mongoose.models.CompetencyMastery ||
  mongoose.model('CompetencyMastery', CompetencyMasterySchema);
module.exports.COMPUTED_BY_JOB = COMPUTED_BY_JOB;
