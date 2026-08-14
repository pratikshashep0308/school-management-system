/**
 * timetableTermValidation — FP-051 · GAP-MTP-002, GAP-CAL-006 · FINAL LLD 1.1 §17, §20
 *
 * Validates that a timetable belongs to, and fits within, an academic year — and
 * that lesson-plan dates fall on instructional days within that year.
 *
 * ── Why this is a service, not a model hook ─────────────────────────────────
 * The Timetable model already carries `academicYear`. What it cannot check
 * alone is whether a date is instructional, because that requires the calendar
 * (holidays, special events, the outside-year guard). Those live in
 * calendarService. So this is a cross-collection validation, which belongs in a
 * service the controllers call — not duplicated into a model hook that cannot
 * reach the calendar.
 *
 * It reuses calendarService.isNonInstructionalDay so the timetable, the
 * attendance guard (BR-CAL-08) and the lesson planner all agree on what a
 * teaching day is. One source of truth.
 */
const mongoose = require('mongoose');
const calendarService = require('./calendarService');

/**
 * Is a date inside the academic year's span?
 * DEP-02: a Maharashtra year runs 15 Jun – 30 Apr; 1 May – 14 Jun belongs to no
 * year, and a date there is out of bounds for every year.
 */
function isWithinYear(date, year) {
  const d = new Date(date);
  return d >= new Date(year.startDate) && d <= new Date(year.endDate);
}

/**
 * Validate that a lesson-plan (or timetable-entry) date is legal: inside the
 * year AND instructional.
 *
 * @returns {Promise<{valid: boolean, code: string|null, message: string|null}>}
 */
async function validatePlanDate({ date, academicYearId, schoolId }) {
  if (!date) throw new Error('TIMETABLE_DATE_REQUIRED');
  if (!academicYearId) throw new Error('TIMETABLE_YEAR_REQUIRED');
  if (!schoolId) throw new Error('TIMETABLE_SCHOOL_REQUIRED');

  const AcademicYear = mongoose.model('AcademicYear');
  const year = await AcademicYear.findOne({ _id: academicYearId, school: schoolId }).lean();
  if (!year) {
    return { valid: false, code: 'TIMETABLE_YEAR_NOT_FOUND', message: 'Academic year not found.' };
  }

  // ── Boundary check ─────────────────────────────────────────────────────────
  if (!isWithinYear(date, year)) {
    return {
      valid: false,
      code: 'TIMETABLE_DATE_OUTSIDE_YEAR',
      message:
        `The date falls outside ${year.name} ` +
        `(${new Date(year.startDate).toISOString().slice(0, 10)} to ` +
        `${new Date(year.endDate).toISOString().slice(0, 10)}). ` +
        'The 1 May – 14 Jun gap between years is not a teaching period.',
    };
  }

  // ── Instructional-day check ────────────────────────────────────────────────
  // Delegated so the answer matches the attendance guard exactly.
  const dayStatus = await calendarService.isNonInstructionalDay(new Date(date), schoolId);
  if (dayStatus.nonInstructional) {
    return {
      valid: false,
      code: 'TIMETABLE_DATE_NON_INSTRUCTIONAL',
      message: `That date is not an instructional day: ${dayStatus.reason || 'holiday or non-working day'}.`,
    };
  }

  return { valid: true, code: null, message: null };
}

/**
 * Validate a timetable's own academic-year linkage: the referenced year exists
 * for the school and is not closed. A timetable pointing at a closed year is a
 * data error — you cannot schedule teaching into a year that has ended.
 */
async function validateTimetableYear({ academicYearId, schoolId }) {
  if (!academicYearId) {
    return { valid: false, code: 'TIMETABLE_YEAR_REQUIRED', message: 'A timetable must reference an academic year.' };
  }
  const AcademicYear = mongoose.model('AcademicYear');
  const year = await AcademicYear.findOne({ _id: academicYearId, school: schoolId }).lean();
  if (!year) {
    return { valid: false, code: 'TIMETABLE_YEAR_NOT_FOUND', message: 'Academic year not found.' };
  }
  if (year.status === 'closed') {
    return {
      valid: false,
      code: 'TIMETABLE_YEAR_CLOSED',
      message: `Cannot attach a timetable to ${year.name}, which is closed.`,
    };
  }
  return { valid: true, code: null, message: null, year: { id: year._id, name: year.name, status: year.status } };
}

module.exports = { validatePlanDate, validateTimetableYear, isWithinYear };
