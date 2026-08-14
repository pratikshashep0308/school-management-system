/**
 * Holiday — BP-012 · GAP-CAL-002 · LLD §10.2, §14, §17.2.10, §28.1
 *
 * Persists school holidays. Replaces `const schoolHolidays = {}` in
 * attendanceService.js, whose setter has never had a caller — so isHoliday() has
 * been Sunday-only in practice and every real holiday has been invisible.
 * Festival absences currently feed consecutive-absence and sub-75% parent alerts
 * as genuine truancy. This is a live data-quality defect, not a missing feature.
 *
 * recurringAnnually is the ONLY rollover-eligible flag (D-003).
 */
const mongoose = require('mongoose');

const HolidaySchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    // A multi-day break is one document with an endDate, not one document per day.
    endDate: { type: Date, default: null },
    recurringAnnually: { type: Boolean, default: false },
    type: {
      type: String,
      enum: ['national', 'regional', 'religious', 'school', 'other'],
      default: 'school',
    },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademicYear',
      required: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

HolidaySchema.index({ school: 1, date: 1 });
HolidaySchema.index({ school: 1, academicYearId: 1 });
HolidaySchema.index({ school: 1, recurringAnnually: 1 });

HolidaySchema.path('endDate').validate(function (value) {
  return value == null || !this.date || value >= this.date;
}, 'HOLIDAY_INVALID_RANGE: endDate must be on or after date');

/** Inclusive test — handles both single-day and range holidays. */
HolidaySchema.methods.covers = function (date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const start = new Date(this.date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(this.endDate || this.date);
  end.setHours(23, 59, 59, 999);
  return d >= start && d <= end;
};

module.exports = mongoose.models.Holiday || mongoose.model('Holiday', HolidaySchema);
