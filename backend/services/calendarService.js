/**
 * calendarService — BP-030 · GAP-CAL-002, GAP-CAL-007, GAP-CAL-009
 * LLD §14, §17.2.2, §17.2.5, §17.2.10, §17.2.11 BR-CAL-01, §28.1
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 * attendanceService.js held `const schoolHolidays = {}` with a setter that has
 * never had a caller anywhere in the backend. isHoliday() therefore evaluated to
 * `isWeekend(date) || false`, and isWeekend() tests only getDay() === 0 — so the
 * holiday check has been Sunday-only in practice and every real school holiday
 * has been invisible. Attendance is markable on festival days, and those absences
 * feed consecutive-absence and sub-75% parent alerts as genuine truancy.
 *
 * ── One helper, not two ─────────────────────────────────────────────────────
 * The Specification offered two options — rewire isHoliday(), or add a parallel
 * isNonInstructionalDay(). LLD §17.2.2 named both without choosing. Two helpers
 * with overlapping semantics would recreate exactly the duplicated-date-check
 * pattern the Specification identifies as the root cause of the original defect.
 *
 * The resolved design (Appendix R R.2.4) is ONE exported async helper. isHoliday()
 * is retained in attendanceService as a thin deprecated wrapper delegating here,
 * so existing call sites keep compiling during the transition.
 *
 * NO CONSUMER MAY RE-IMPLEMENT A DATE CHECK. No direct Holiday or SpecialEvent
 * query belongs outside this service.
 *
 * ── Async is unavoidable ────────────────────────────────────────────────────
 * The Specification states that call sites "require no change, since its
 * signature and behaviour are preserved". That is incorrect: a database-backed
 * implementation must be async, so all three call sites
 * (attendanceController.js:73, :215, :313) must be awaited.
 *
 * ── Fail closed ─────────────────────────────────────────────────────────────
 * If the calendar cannot be read, attendance marking is BLOCKED rather than
 * allowed. Allowing marking on a possible holiday is the failure this whole unit
 * exists to prevent.
 */
const mongoose = require('mongoose');
require('../models/Holiday');
require('../models/SpecialEvent');
require('../models/AcademicYear');

/** Sunday is a non-instructional day independently of the persisted calendar. */
const SUNDAY = 0;

// Day boundaries are computed in UTC, not local time. Downstream code turns a
// date into a string with `.toISOString().slice(0,10)`, which is UTC; using
// local midnight (setHours) here would shift every date by the server's offset
// on any non-UTC server (staging runs in IST, UTC+5:30), silently moving range
// results back a day. setUTCHours keeps the boundary and the string in the same
// frame. A date-only input like '2026-08-18' is parsed by Date as UTC midnight,
// so this treats such inputs as that calendar day exactly.
const startOfDay = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

/**
 * Per-request memoised cache. A single attendance POST checks the calendar up to
 * three times; without this that is three round-trips for the same date.
 * Callers create a context, pass it through, and discard it when the request ends.
 */
function createCalendarContext() {
  return { _cache: new Map() };
}

const cacheKey = (schoolId, date) =>
  `${String(schoolId)}::${startOfDay(date).toISOString()}`;

/**
 * The single authoritative non-instructional-day check.
 *
 * @param {Date|string} date
 * @param {*} schoolId
 * @param {object} [ctx]  optional context from createCalendarContext()
 * @returns {Promise<{blocked: boolean, reason: string|null, ref: *, label: string|null}>}
 *          reason is one of 'outside-academic-year' | 'holiday' | 'special-event' |
 *          'sunday' | null
 */
async function isNonInstructionalDay(date, schoolId, ctx) {
  if (!date) throw new Error('CALENDAR_DATE_REQUIRED');
  if (!schoolId) throw new Error('CALENDAR_SCHOOL_REQUIRED');

  const key = cacheKey(schoolId, date);
  if (ctx && ctx._cache.has(key)) return ctx._cache.get(key);

  const target = new Date(date);
  let result;

  try {
    const Holiday = mongoose.model('Holiday');
    const SpecialEvent = mongoose.model('SpecialEvent');
    const dayStart = startOfDay(target);
    const dayEnd = endOfDay(target);

    // A record covers the target if it starts on or before the day ends AND
    // finishes on or after the day begins. For a single-day holiday endDate is
    // null, and its effective end is its OWN date — so the record covers the
    // target only when its date falls within the queried day. Treating a null
    // endDate as "no upper bound" (the original bug) made every day from the
    // holiday onward match forever.
    const spanQuery = {
      school: schoolId,
      date: { $lte: dayEnd },
      $or: [
        // Single day: the holiday's own date must be on/after the day begins.
        { endDate: null, date: { $gte: dayStart } },
        // Multi day: the span's end must be on/after the day begins.
        { endDate: { $gte: dayStart } },
      ],
    };

    const [holiday, event] = await Promise.all([
      Holiday.findOne(spanQuery).lean(),
      SpecialEvent.findOne({ ...spanQuery, instructionSuspended: true }).lean(),
    ]);

    // ── Outside any academic year ────────────────────────────────────────────
    // Checked FIRST because it is the broadest condition. Between academic years
    // school is closed for weeks at a time — for Maharashtra State Board schools
    // the break runs 1 May to 14 June — and those dates belong to no year. They
    // are not Sundays and carry no Holiday record, so without this check
    // attendance would be markable throughout the summer break.
    //
    // Recording the break as a Holiday is not the right fix: a holiday belongs to
    // an academic year, and this window belongs to neither. The absence of a year
    // IS the reason.
    const AcademicYear = mongoose.model('AcademicYear');
    const coveringYear = await AcademicYear.findOne({
      school: schoolId,
      startDate: { $lte: dayEnd },
      endDate: { $gte: dayStart },
    }).lean();

    if (!coveringYear) {
      result = {
        blocked: true,
        reason: 'outside-academic-year',
        ref: null,
        label: 'Outside the academic year',
      };
    } else if (holiday) {
      result = {
        blocked: true,
        reason: 'holiday',
        ref: holiday._id,
        label: holiday.label,
      };
    } else if (event) {
      result = {
        blocked: true,
        reason: 'special-event',
        ref: event._id,
        label: event.label,
      };
    } else if (startOfDay(target).getUTCDay() === SUNDAY) {
      // Retained as an independent OR-term, exactly as before. Uses the UTC
      // day-of-week of the normalised day so it agrees with the UTC boundaries
      // used everywhere else (getDay() would drift on a non-UTC server).
      result = { blocked: true, reason: 'sunday', ref: null, label: 'Sunday' };
    } else {
      result = { blocked: false, reason: null, ref: null, label: null };
    }
  } catch (err) {
    // FAIL CLOSED. See the module comment.
    const failure = new Error(
      `CALENDAR_UNAVAILABLE: could not read the academic calendar (${err.message})`
    );
    failure.code = 'CALENDAR_UNAVAILABLE';
    throw failure;
  }

  if (ctx) ctx._cache.set(key, result);
  return result;
}

/**
 * All non-instructional dates in a range, as ISO date strings (yyyy-mm-dd).
 * Used by getWorkingDays() so alert counting excludes closures from both the
 * numerator and the denominator (BR-CAL-02).
 *
 * @returns {Promise<Set<string>>}
 */
async function nonInstructionalDatesInRange(startDate, endDate, schoolId) {
  if (!schoolId) throw new Error('CALENDAR_SCHOOL_REQUIRED');

  const rangeStart = startOfDay(startDate);
  const rangeEnd = endOfDay(endDate);
  const dates = new Set();

  try {
    const Holiday = mongoose.model('Holiday');
    const SpecialEvent = mongoose.model('SpecialEvent');

    // Same span semantics as isNonInstructionalDay: a single-day holiday
    // (endDate null) overlaps the range only if its own date is within it.
    const overlaps = {
      school: schoolId,
      date: { $lte: rangeEnd },
      $or: [
        { endDate: null, date: { $gte: rangeStart } },
        { endDate: { $gte: rangeStart } },
      ],
    };

    const [holidays, events] = await Promise.all([
      Holiday.find(overlaps).lean(),
      SpecialEvent.find({ ...overlaps, instructionSuspended: true }).lean(),
    ]);

    for (const rec of [...holidays, ...events]) {
      let cursor = startOfDay(rec.date);
      const last = startOfDay(rec.endDate || rec.date);
      while (cursor <= last) {
        if (cursor >= rangeStart && cursor <= rangeEnd) {
          dates.add(cursor.toISOString().slice(0, 10));
        }
        cursor = new Date(cursor.getTime() + 86400000);
      }
    }

    // Sundays in range. Uses UTC day-of-week to stay consistent with the UTC
    // day boundaries above (getDay() would use the server's local week on a
    // non-UTC server and mis-identify the boundary days).
    let d = new Date(rangeStart);
    while (d <= rangeEnd) {
      if (d.getUTCDay() === SUNDAY) dates.add(d.toISOString().slice(0, 10));
      d = new Date(d.getTime() + 86400000);
    }
  } catch (err) {
    const failure = new Error(
      `CALENDAR_UNAVAILABLE: could not read the academic calendar (${err.message})`
    );
    failure.code = 'CALENDAR_UNAVAILABLE';
    throw failure;
  }

  return dates;
}

/**
 * Count instructional days in an inclusive range.
 */
async function countWorkingDays(startDate, endDate, schoolId) {
  const blocked = await nonInstructionalDatesInRange(startDate, endDate, schoolId);
  let count = 0;
  let d = startOfDay(startDate);
  const last = startOfDay(endDate);
  while (d <= last) {
    if (!blocked.has(d.toISOString().slice(0, 10))) count += 1;
    d = new Date(d.getTime() + 86400000);
  }
  return count;
}

module.exports = {
  isNonInstructionalDay,
  nonInstructionalDatesInRange,
  countWorkingDays,
  createCalendarContext,
  SUNDAY,
};
