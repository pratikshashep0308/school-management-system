/**
 * SpecialEvent — BP-013 · GAP-CAL-006 · LLD §10.2, §17.2
 *
 * Dates where school is partially in session but instruction is disrupted: the
 * middle state between a normal day and a holiday. Without it, a half-day, exam
 * day or parent-teacher meeting is either a full holiday or a normal day.
 *
 * attendanceRequired and instructionSuspended are INDEPENDENT. An exam day may
 * require attendance while suspending normal instruction. Only
 * instructionSuspended makes a date non-instructional for the calendar service
 * (BR-CAL-01).
 *
 * SpecialEvent is never rollover-eligible — only recurringAnnually Holidays
 * carry forward (D-003).
 */
const mongoose = require('mongoose');

const SpecialEventSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    endDate: { type: Date, default: null },
    attendanceRequired: { type: Boolean, default: true },
    instructionSuspended: { type: Boolean, default: false },
    category: {
      type: String,
      enum: ['exam', 'half-day', 'ptm', 'sports', 'cultural', 'training', 'other'],
      default: 'other',
    },
    drivesTimetableOverride: { type: Boolean, default: false },
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

SpecialEventSchema.index({ school: 1, date: 1 });
SpecialEventSchema.index({ school: 1, academicYearId: 1 });
SpecialEventSchema.index({ school: 1, instructionSuspended: 1, date: 1 });

SpecialEventSchema.path('endDate').validate(function (value) {
  return value == null || !this.date || value >= this.date;
}, 'SPECIAL_EVENT_INVALID_RANGE: endDate must be on or after date');

SpecialEventSchema.methods.covers = function (date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const start = new Date(this.date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(this.endDate || this.date);
  end.setHours(23, 59, 59, 999);
  return d >= start && d <= end;
};

module.exports =
  mongoose.models.SpecialEvent || mongoose.model('SpecialEvent', SpecialEventSchema);
