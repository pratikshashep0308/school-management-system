/**
 * LessonPlan — FP-019 · GAP-MTP-001, GAP-MTP-003, GAP-MTP-004, GAP-MTP-005
 * FINAL LLD 1.1 §26
 *
 * References an EXISTING Timetable period rather than duplicating scheduling
 * data — a second copy of "when does this class meet" would diverge from the
 * timetable the moment either changed.
 *
 * `baseUpdatedAt` supports offline conflict detection (§33): the sync queue
 * sends it back and the server compares against the current `updatedAt`.
 */
const mongoose = require('mongoose');

const LessonPlanSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    date: { type: Date, required: true },

    // GAP-MTP-003 — the plan must correspond to a real scheduled period. The
    // service validates the reference resolves to an active Timetable entry for
    // this teacher; the field itself only carries the pointer.
    timetableRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Timetable', default: null },
    periodIndex: { type: Number, default: null },

    competencies: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CompetencyFramework' }],
      default: [],
    },
    objectives: { type: String, trim: true },
    activities: { type: String, trim: true },
    resources: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContentItem' }],
      default: [],
    },

    // GAP-MTP-005 — the end-of-day structured reflection. The AI reflection
    // assistant (GAP-TC-004) EXTENDS this field; it does not create a parallel store.
    reflection: { type: String, trim: true, default: null },
    reflectionAt: { type: Date, default: null },

    // GAP-MTP-004 — curriculum coverage.
    coverageStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },

    status: { type: String, enum: ['draft', 'final'], default: 'draft' },

    // §33 — optimistic concurrency for the offline write queue.
    baseUpdatedAt: { type: Date, default: null },

    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  },
  { timestamps: true }
);

LessonPlanSchema.index({ school: 1, teacher: 1, date: -1 });
LessonPlanSchema.index({ school: 1, class: 1, subject: 1, date: -1 });
LessonPlanSchema.index({ school: 1, academicYearId: 1, coverageStatus: 1 });

/** Recording a reflection stamps when — a reflection with no time is not chronological. */
LessonPlanSchema.pre('save', function (next) {
  if (this.isModified('reflection') && this.reflection && !this.reflectionAt) {
    this.reflectionAt = new Date();
  }
  return next();
});

module.exports =
  mongoose.models.LessonPlan || mongoose.model('LessonPlan', LessonPlanSchema);
