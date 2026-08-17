/**
 * CompetencyFramework — FP-015 · GAP-CFG-001 · FINAL LLD 1.1 §10.1, §25
 *
 * The competency vocabulary that the assessment engine, subject modules and the
 * teacher planner all reference. Most-depended-upon net-new collection in the
 * programme.
 *
 * ── Supersede, never edit ───────────────────────────────────────────────────
 * An active row is never mutated. A change creates a new row with
 * frameworkVersion + 1, points `supersedes` at the prior row, and deactivates it.
 *
 * This matters because CompetencyMastery records reference a specific framework
 * version. Editing a competency description in place would silently rewrite what
 * every historical mastery record was assessed against — the same class of
 * defect as mutating a published exam mark.
 */
const mongoose = require('mongoose');

const CompetencyFrameworkSchema = new mongoose.Schema(
  {
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    // Number, matching Class.grade. Never a String — Class.grade is numeric and a
    // second representation would diverge.
    grade: { type: Number, required: true, min: 1, max: 12 },

    code: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    strand: { type: String, trim: true },

    frameworkVersion: { type: Number, required: true, default: 1, min: 1 },
    isActive: { type: Boolean, default: true },
    supersedes: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompetencyFramework',
      default: null,
    },

    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

CompetencyFrameworkSchema.index({ school: 1, code: 1, frameworkVersion: 1 }, { unique: true });
CompetencyFrameworkSchema.index({ school: 1, subject: 1, grade: 1, isActive: 1 });
CompetencyFrameworkSchema.index({ school: 1, isActive: 1 });

/**
 * Reject in-place edits of an active row. A new version is the only permitted
 * way to change a competency, so historical mastery references stay meaningful.
 * Deactivation and the supersedes link are the two exceptions — those are how a
 * supersede completes.
 */
CompetencyFrameworkSchema.pre('save', function (next) {
  if (this.isNew) return next();
  const substantive = ['code', 'description', 'strand', 'subject', 'grade'];
  const edited = substantive.filter((f) => this.isModified(f));
  if (edited.length > 0 && this.isActive) {
    return next(
      new Error(
        `COMPETENCY_FRAMEWORK_IMMUTABLE: cannot edit ${edited.join(', ')} on an active ` +
          'framework row. Create a new version with supersedes pointing here, and ' +
          'deactivate this one — historical CompetencyMastery records reference this version.'
      )
    );
  }
  return next();
});

/** A superseding row must follow the row it replaces. */
CompetencyFrameworkSchema.methods.validateSupersede = async function () {
  if (!this.supersedes) return true;
  const prior = await this.constructor.findById(this.supersedes).lean();
  if (!prior) throw new Error('COMPETENCY_VERSION_MISMATCH: superseded row not found.');
  if (prior.code !== this.code) {
    throw new Error(
      `COMPETENCY_VERSION_MISMATCH: cannot supersede code '${prior.code}' with '${this.code}'.`
    );
  }
  if (this.frameworkVersion <= prior.frameworkVersion) {
    throw new Error(
      `COMPETENCY_VERSION_MISMATCH: version ${this.frameworkVersion} does not follow ` +
        `${prior.frameworkVersion}.`
    );
  }
  return true;
};

module.exports =
  mongoose.models.CompetencyFramework ||
  mongoose.model('CompetencyFramework', CompetencyFrameworkSchema);
