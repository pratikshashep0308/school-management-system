/**
 * AcademicYear — BP-010 · GAP-CAL-001 · LLD §10.2, §17.2, §21
 *
 * Replaces reliance on free-text year strings (School.academicYear,
 * Timetable.academicYear, ExamGroup.academicYear) with a first-class entity.
 * This is the anchor for rollover (D-003), promotion (D-004) and historical
 * enrolment reconstruction (D-006).
 *
 * Terms are embedded rather than a separate collection, per §10.2.
 */
const mongoose = require('mongoose');

const TermSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { _id: true }
);

const AcademicYearSchema = new mongoose.Schema(
  {
    // Canonical year label. This is the format of record; School.academicYear is
    // aligned to it and Timetable/ExamGroup free-text years are retired from all
    // read paths (BP-011).
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    terms: { type: [TermSchema], default: [] },
    isActive: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['draft', 'active', 'closed'],
      default: 'draft',
    },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

AcademicYearSchema.index({ school: 1, name: 1 }, { unique: true });
AcademicYearSchema.index({ school: 1, isActive: 1 });
AcademicYearSchema.index({ school: 1, startDate: 1, endDate: 1 });

/** Year boundaries must be coherent. */
AcademicYearSchema.path('endDate').validate(function (value) {
  return !this.startDate || !value || this.startDate < value;
}, 'ACADEMIC_YEAR_INVALID_RANGE: startDate must be earlier than endDate');

/**
 * Terms must sit inside the year and must not overlap each other. Overlapping
 * terms would make "which term is this date in" ambiguous, and BR-CAL-05
 * (restated) validates timetable overrides against exactly that question.
 */
AcademicYearSchema.pre('validate', function (next) {
  if (!Array.isArray(this.terms) || this.terms.length === 0) return next();

  for (const t of this.terms) {
    if (!t.startDate || !t.endDate) continue;
    if (t.startDate >= t.endDate) {
      return next(new Error(`TERM_INVALID_RANGE: term '${t.name}' starts on or after it ends`));
    }
    if (this.startDate && t.startDate < this.startDate) {
      return next(new Error(`TERM_OUTSIDE_YEAR: term '${t.name}' starts before the academic year`));
    }
    if (this.endDate && t.endDate > this.endDate) {
      return next(new Error(`TERM_OUTSIDE_YEAR: term '${t.name}' ends after the academic year`));
    }
  }

  const sorted = [...this.terms]
    .filter((t) => t.startDate && t.endDate)
    .sort((a, b) => a.startDate - b.startDate);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].startDate < sorted[i - 1].endDate) {
      return next(
        new Error(
          `TERM_OVERLAP: term '${sorted[i].name}' overlaps '${sorted[i - 1].name}'`
        )
      );
    }
  }
  return next();
});

/**
 * At most one active year per school. Enforced here rather than by a partial
 * index so the error is a named business rule the API can surface.
 */
AcademicYearSchema.pre('save', async function (next) {
  if (!this.isActive) return next();
  const clash = await this.constructor.findOne({
    school: this.school,
    isActive: true,
    _id: { $ne: this._id },
  });
  if (clash) {
    return next(
      new Error(
        'ACADEMIC_YEAR_MULTIPLE_ACTIVE: another academic year is already active ' +
          `for this school (${clash.name}). Close or deactivate it first.`
      )
    );
  }
  return next();
});

/** Which term contains a given date, or null. */
AcademicYearSchema.methods.termFor = function (date) {
  const d = new Date(date);
  return (
    (this.terms || []).find((t) => t.startDate <= d && d <= t.endDate) || null
  );
};

/** Whether a date falls inside this academic year. */
AcademicYearSchema.methods.contains = function (date) {
  const d = new Date(date);
  return this.startDate <= d && d <= this.endDate;
};

module.exports =
  mongoose.models.AcademicYear ||
  mongoose.model('AcademicYear', AcademicYearSchema);
