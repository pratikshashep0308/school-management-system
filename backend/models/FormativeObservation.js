/**
 * FormativeObservation — FP-016 · GAP-AE-002 · FINAL LLD 1.1 §25
 *
 * Lightweight non-exam evidence — oral questioning, exit tickets, observed work
 * — tagged to a competency and a student.
 *
 * Feeds the CompetencyMastery recompute alongside Result/ExamMark. It never
 * replaces marks: the competency layer runs in parallel to the existing
 * marks-and-grades workflow, which GAP-AE-006 places out of scope.
 */
const mongoose = require('mongoose');

const FormativeObservationSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    competency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompetencyFramework',
      required: true,
    },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    date: { type: Date, required: true, default: Date.now },

    evidenceType: {
      type: String,
      enum: ['oral', 'exit-ticket', 'observation', 'written', 'peer', 'other'],
      default: 'observation',
    },
    note: { type: String, trim: true },

    // Emerging/Developing/Proficient as observed. The computed CompetencyMastery
    // level is derived from many of these plus marks — this is one input, not a
    // verdict.
    observedLevel: {
      type: String,
      enum: ['emerging', 'developing', 'proficient'],
      required: true,
    },

    observedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  },
  { timestamps: true }
);

FormativeObservationSchema.index({ school: 1, student: 1, competency: 1, date: -1 });
FormativeObservationSchema.index({ school: 1, academicYearId: 1, student: 1 });

module.exports =
  mongoose.models.FormativeObservation ||
  mongoose.model('FormativeObservation', FormativeObservationSchema);
