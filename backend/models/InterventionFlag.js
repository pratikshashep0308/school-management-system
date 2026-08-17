/**
 * InterventionFlag — FP-016 · GAP-AE-005 · FINAL LLD 1.1 §25
 *
 * Auto-created when a student has two or more competencies remaining below
 * `developing`. Feeds the Principal Dashboard mastery view and the AI insight
 * layer.
 *
 * `createdBy` is always 'system' in this release. No approved requirement
 * defines a manual-flag workflow, so none is invented here.
 */
const mongoose = require('mongoose');

/** GAP-AE-005 threshold. A named constant, not a literal at the call site. */
const MIN_COMPETENCIES_BELOW_DEVELOPING = 2;

const InterventionFlagSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    competencies: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CompetencyFramework' }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= MIN_COMPETENCIES_BELOW_DEVELOPING,
        message:
          `INTERVENTION_THRESHOLD_NOT_MET: a flag requires at least ` +
          `${MIN_COMPETENCIES_BELOW_DEVELOPING} competencies below developing.`,
      },
      required: true,
    },

    reason: { type: String, required: true, trim: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'closed'],
      default: 'open',
    },

    // System-created only in this release.
    createdBy: { type: String, enum: ['system'], default: 'system' },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  },
  { timestamps: true }
);

InterventionFlagSchema.index({ school: 1, status: 1, createdAt: -1 });
InterventionFlagSchema.index({ school: 1, student: 1, status: 1 });

module.exports =
  mongoose.models.InterventionFlag ||
  mongoose.model('InterventionFlag', InterventionFlagSchema);
module.exports.MIN_COMPETENCIES_BELOW_DEVELOPING = MIN_COMPETENCIES_BELOW_DEVELOPING;
