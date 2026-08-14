/**
 * rolloverService — FP-034 · GAP-CAL-005 · Decisions D-002, D-003
 * FINAL LLD 1.1 §15
 *
 * ── What rollover carries forward ───────────────────────────────────────────
 * Exactly two things:
 *   1. a new AcademicYear document
 *   2. holidays where recurringAnnually is true
 *
 * ── What it must NEVER touch ────────────────────────────────────────────────
 * Class records, Class.students[], Student.class, or any enrolment record.
 *
 * D-002 makes Class global — it is not cloned per academic year, and its unique
 * index on {name, section, school} is unchanged. D-003 restricts rollover to the
 * two items above. A rollover that writes to any enrolment structure is a defect,
 * not a feature, and the integrity tests assert the Class collection is untouched.
 *
 * Non-recurring holidays are explicitly NOT copied. A one-off closure or a
 * weather day belongs to the year it occurred in.
 *
 * ── The manifest ────────────────────────────────────────────────────────────
 * Every run returns a manifest naming what was carried AND what was deliberately
 * not carried. An administrator running a year-end process should not have to
 * infer that classes were left alone — the wizard states it.
 */
const mongoose = require('mongoose');

/** Collections rollover is forbidden from writing to (D-002, D-003). */
const FORBIDDEN_WRITES = Object.freeze(['Class', 'Student', 'Attendance', 'Result', 'Timetable']);

/**
 * Shift a recurring date into the target year.
 *
 * 29 February is handled explicitly: a leap-day holiday shifted into a non-leap
 * year would silently become 1 March, moving a school closure by a day. It is
 * clamped to 28 February and reported.
 */
function shiftToYear(date, targetYear) {
  const d = new Date(date);
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  if (month === 1 && day === 29) {
    const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (!isLeap(targetYear)) {
      return { date: new Date(Date.UTC(targetYear, 1, 28)), clamped: true };
    }
  }
  return { date: new Date(Date.UTC(targetYear, month, day)), clamped: false };
}

/**
 * Which calendar year a recurring holiday falls into, given the target academic
 * year's span. A Maharashtra year runs 15 June to 30 April, so it crosses a
 * calendar boundary: a June holiday belongs to the start year and a February one
 * to the following year.
 */
function targetCalendarYear(sourceDate, targetYear) {
  const month = new Date(sourceDate).getUTCMonth();
  const startYear = targetYear.startDate.getUTCFullYear();
  const startMonth = targetYear.startDate.getUTCMonth();
  return month >= startMonth ? startYear : startYear + 1;
}

/**
 * Roll a school forward into a new academic year.
 *
 * Idempotent: a holiday already present in the target year (same label and date)
 * is skipped, so a second run adds nothing.
 *
 * @param {object} opts
 * @param {*} opts.schoolId
 * @param {*} opts.sourceYearId    the year being closed
 * @param {object} opts.targetYear {name, startDate, endDate}
 * @param {*} [opts.actorId]
 * @param {boolean} [opts.dryRun]  report without writing
 * @returns {Promise<object>} manifest
 */
async function rollover({ schoolId, sourceYearId, targetYear, actorId, dryRun = false }) {
  if (!schoolId) throw new Error('ROLLOVER_SCHOOL_REQUIRED');
  if (!sourceYearId) throw new Error('ROLLOVER_SOURCE_YEAR_REQUIRED');
  if (!targetYear || !targetYear.name || !targetYear.startDate || !targetYear.endDate) {
    throw new Error(
      'ROLLOVER_TARGET_YEAR_REQUIRED: name, startDate and endDate must be supplied. ' +
        'Academic year boundaries are school-specific and are never defaulted.'
    );
  }

  const AcademicYear = mongoose.model('AcademicYear');
  const Holiday = mongoose.model('Holiday');

  const source = await AcademicYear.findOne({ _id: sourceYearId, school: schoolId }).lean();
  if (!source) throw new Error('ROLLOVER_SOURCE_YEAR_NOT_FOUND');

  const start = new Date(targetYear.startDate);
  const end = new Date(targetYear.endDate);
  if (!(start < end)) {
    throw new Error('ROLLOVER_INVALID_RANGE: startDate must be earlier than endDate.');
  }

  const manifest = {
    school: schoolId,
    sourceYear: { id: source._id, name: source.name },
    targetYear: { name: targetYear.name, startDate: start, endDate: end },
    dryRun,
    carriedForward: { academicYear: null, holidays: [] },
    notCarriedForward: {
      classes: 'Class is global and is never cloned (D-002).',
      classStudents: 'Class.students[] is a current-cohort cache and is not copied (D-005).',
      enrolments: 'Enrolment is not carried by rollover. Promotion re-points Student.class (D-004).',
      nonRecurringHolidays: [],
      specialEvents: 'SpecialEvent is never rollover-eligible.',
    },
    skipped: [],
    warnings: [],
  };

  // ── The new academic year ────────────────────────────────────────────────
  let created = await AcademicYear.findOne({ school: schoolId, name: targetYear.name }).lean();
  if (created) {
    manifest.skipped.push(`Academic year ${targetYear.name} already exists — reused.`);
  } else if (!dryRun) {
    // status 'draft': promotion needs the year to exist before it can point
    // toAcademicYear at it, but the year must not become active until it begins.
    created = (
      await AcademicYear.create({
        name: targetYear.name,
        startDate: start,
        endDate: end,
        terms: [],
        isActive: false,
        status: 'draft',
        school: schoolId,
        createdBy: actorId,
      })
    ).toObject();
  }
  manifest.carriedForward.academicYear = created
    ? { id: created._id, name: created.name, status: created.status }
    : { name: targetYear.name, status: 'draft (dry run)' };

  // ── Recurring holidays only (D-003) ──────────────────────────────────────
  const sourceHolidays = await Holiday.find({
    school: schoolId,
    academicYearId: sourceYearId,
  }).lean();

  const recurring = sourceHolidays.filter((h) => h.recurringAnnually === true);
  manifest.notCarriedForward.nonRecurringHolidays = sourceHolidays
    .filter((h) => h.recurringAnnually !== true)
    .map((h) => h.label);

  for (const h of recurring) {
    const calYear = targetCalendarYear(h.date, { startDate: start });
    const shifted = shiftToYear(h.date, calYear);
    if (shifted.clamped) {
      manifest.warnings.push(
        `'${h.label}' falls on 29 February and ${calYear} is not a leap year — clamped to 28 February.`
      );
    }

    let endShifted = null;
    if (h.endDate) {
      const span = Math.round((new Date(h.endDate) - new Date(h.date)) / 86400000);
      endShifted = new Date(shifted.date.getTime() + span * 86400000);
    }

    if (shifted.date < start || shifted.date > end) {
      manifest.skipped.push(
        `'${h.label}' shifts to ${shifted.date.toISOString().slice(0, 10)}, outside ${targetYear.name}.`
      );
      continue;
    }

    // Idempotency: same label and date in the target year means already carried.
    const existing = created
      ? await Holiday.findOne({
          school: schoolId,
          academicYearId: created._id,
          label: h.label,
          date: shifted.date,
        }).lean()
      : null;

    if (existing) {
      manifest.skipped.push(`'${h.label}' already present in ${targetYear.name}.`);
      continue;
    }

    if (!dryRun && created) {
      await Holiday.create({
        label: h.label,
        date: shifted.date,
        endDate: endShifted,
        recurringAnnually: true,
        type: h.type,
        school: schoolId,
        academicYearId: created._id,
        createdBy: actorId,
      });
    }
    manifest.carriedForward.holidays.push({
      label: h.label,
      from: new Date(h.date).toISOString().slice(0, 10),
      to: shifted.date.toISOString().slice(0, 10),
    });
  }

  return manifest;
}

module.exports = { rollover, shiftToYear, targetCalendarYear, FORBIDDEN_WRITES };
