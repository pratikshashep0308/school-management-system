/**
 * Subject module collections — FP-021 · GAP-SUB-001…004 · FINAL LLD 1.1 §25
 *
 * Five reading/numeracy/science/language collections. Each writes a milestone to
 * PassportEntry automatically when a threshold is reached; that wiring lives in
 * the service layer (FP-056), not here.
 *
 * The numeracy misconception threshold is a NAMED CONSTANT — a misconception is
 * flagged only after enough related incorrect responses to be a pattern, not a
 * single slip.
 */
const mongoose = require('mongoose');

/** GAP-SUB-002 — related incorrect responses before a misconception is flagged. */
const MISCONCEPTION_THRESHOLD = 3;

const ReadingLevelSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    level: { type: String, required: true },
    assessedOn: { type: Date, default: Date.now },
    assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  },
  { timestamps: true }
);
ReadingLevelSchema.index({ school: 1, student: 1, assessedOn: -1 });

const ReadingLogEntrySchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    title: { type: String, required: true, trim: true },
    minutes: { type: Number, min: 0, default: 0 },
    date: { type: Date, default: Date.now },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  },
  { timestamps: true }
);
ReadingLogEntrySchema.index({ school: 1, student: 1, date: -1 });

const NumeracyMisconceptionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    concept: { type: String, required: true, trim: true },
    // Count of related incorrect responses observed. A flag is raised only when
    // this reaches MISCONCEPTION_THRESHOLD — see the pre-validate guard.
    incorrectCount: { type: Number, required: true, min: 1 },
    flagged: { type: Boolean, default: false },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  },
  { timestamps: true }
);
NumeracyMisconceptionSchema.index({ school: 1, student: 1, concept: 1 });

/**
 * A misconception is only 'flagged' once the pattern threshold is reached.
 * Derived on BOTH validate and save so the value is never stale, and exposed as
 * a static so callers can compute it without a document (e.g. in aggregation).
 */
function computeFlagged(count) {
  return Number(count) >= MISCONCEPTION_THRESHOLD;
}
NumeracyMisconceptionSchema.pre('validate', function (next) {
  this.flagged = computeFlagged(this.incorrectCount);
  next();
});
NumeracyMisconceptionSchema.pre('save', function (next) {
  this.flagged = computeFlagged(this.incorrectCount);
  next();
});
NumeracyMisconceptionSchema.statics.computeFlagged = computeFlagged;

const ScienceInvestigationSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    title: { type: String, required: true, trim: true },
    hypothesis: { type: String, trim: true },
    // Structured safety checklist — data, not free text, so it can be validated
    // and reported on.
    safetyChecklist: {
      type: [
        new mongoose.Schema(
          { item: { type: String, required: true }, checked: { type: Boolean, default: false } },
          { _id: false }
        ),
      ],
      default: [],
    },
    conclusion: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  },
  { timestamps: true }
);
ScienceInvestigationSchema.index({ school: 1, student: 1, date: -1 });

const LanguageProficiencySchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    language: { type: String, required: true, trim: true },
    skill: { type: String, enum: ['listening', 'speaking', 'reading', 'writing'], required: true },
    level: { type: String, required: true },
    assessedOn: { type: Date, default: Date.now },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  },
  { timestamps: true }
);
LanguageProficiencySchema.index({ school: 1, student: 1, language: 1, skill: 1 });

module.exports = {
  ReadingLevel: mongoose.models.ReadingLevel || mongoose.model('ReadingLevel', ReadingLevelSchema),
  ReadingLogEntry: mongoose.models.ReadingLogEntry || mongoose.model('ReadingLogEntry', ReadingLogEntrySchema),
  NumeracyMisconception: mongoose.models.NumeracyMisconception || mongoose.model('NumeracyMisconception', NumeracyMisconceptionSchema),
  ScienceInvestigation: mongoose.models.ScienceInvestigation || mongoose.model('ScienceInvestigation', ScienceInvestigationSchema),
  LanguageProficiency: mongoose.models.LanguageProficiency || mongoose.model('LanguageProficiency', LanguageProficiencySchema),
  MISCONCEPTION_THRESHOLD,
};
