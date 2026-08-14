/**
 * PassportEntry — FP-020 · GAP-SLP-001, GAP-SLP-006, GAP-SIS-001
 * FINAL LLD 1.1 §25
 *
 * The Learning Passport is a longitudinal record of a student's growth — academic
 * milestones, competency achievements, co-curricular events, wellbeing notes.
 *
 * ── Safeguarding is enforced in the query, not the UI ───────────────────────
 * `visibility` controls who may see an entry. A wellbeing entry must NEVER appear
 * in a parent-facing export by default (GAP-SLP-006). This is enforced by the
 * query that builds the export — `parentVisibleFilter()` below — not by a screen
 * choosing to hide it. A field the export query ignores protects nobody.
 *
 * ── GAP-SIS-001 resolves to NO new field ────────────────────────────────────
 * A prior draft proposed `Student.learningPassportId`. It is not created. Entries
 * are queried by `student`, so a pointer field would be a second representation of
 * the same relationship, able to drift from the entries themselves.
 */
const mongoose = require('mongoose');

const ENTRY_TYPES = [
  'academic-milestone', 'competency-achievement', 'co-curricular',
  'wellbeing', 'attendance-milestone', 'reading-milestone', 'award', 'reflection',
];

/** Entry types that are wellbeing-sensitive and default to internal visibility. */
const SENSITIVE_TYPES = ['wellbeing'];

const PassportEntrySchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    entryType: { type: String, enum: ENTRY_TYPES, required: true },
    date: { type: Date, required: true, default: Date.now },

    title: { type: String, required: true, trim: true },
    content: { type: String, trim: true },

    // Where the entry came from — an assessment, an award, a milestone job.
    // Automatic creation is idempotent on this reference.
    sourceRef: {
      collectionName: { type: String, default: null },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },

    // 'internal' — staff only. 'parent' — visible in parent exports. 'student' —
    // visible to the student too. Wellbeing entries default to 'internal'.
    visibility: {
      type: String,
      enum: ['internal', 'parent', 'student'],
      required: true,
      default: 'internal',
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    system: { type: Boolean, default: false },

    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  },
  { timestamps: true }
);

PassportEntrySchema.index({ school: 1, student: 1, date: -1 });
PassportEntrySchema.index({ school: 1, student: 1, entryType: 1 });
// Idempotency for automatic creation.
PassportEntrySchema.index(
  { 'sourceRef.collectionName': 1, 'sourceRef.id': 1 },
  { sparse: true }
);

/**
 * A wellbeing entry must not be created as parent-visible by accident. If no
 * explicit visibility was set for a sensitive type, it stays internal.
 */
PassportEntrySchema.pre('validate', function (next) {
  if (SENSITIVE_TYPES.includes(this.entryType) && this.isNew && !this.$__.selected?.visibility) {
    if (this.visibility === undefined) this.visibility = 'internal';
  }
  next();
});

/**
 * The mandatory filter for any PARENT-facing read or export.
 *
 * This is the safeguarding control. Every parent export path must apply it, so a
 * wellbeing entry cannot reach a parent export regardless of how the export screen
 * is written.
 */
PassportEntrySchema.statics.parentVisibleFilter = function (studentId, schoolId) {
  return {
    student: studentId,
    school: schoolId,
    visibility: 'parent',
    // Belt and braces: sensitive types are excluded even if one were mis-set to
    // 'parent', because the harm of a leak outweighs the cost of a missing entry.
    entryType: { $nin: SENSITIVE_TYPES },
  };
};

PassportEntrySchema.statics.SENSITIVE_TYPES = SENSITIVE_TYPES;
PassportEntrySchema.statics.ENTRY_TYPES = ENTRY_TYPES;

module.exports =
  mongoose.models.PassportEntry || mongoose.model('PassportEntry', PassportEntrySchema);
