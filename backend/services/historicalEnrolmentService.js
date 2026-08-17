/**
 * historicalEnrolmentService — FP-035 · BR-SIS-04, GAP-SIS-005
 * Decisions D-005, D-006 · FINAL LLD 1.1 §19
 *
 * ── The question this answers ───────────────────────────────────────────────
 * "Which class was this student in during academic year X, and what happened
 * that year?"
 *
 * ── Why Class.students[] cannot answer it ───────────────────────────────────
 * D-002 makes Class global — one document per grade-section per school, for all
 * time, never cloned per year. D-005 therefore makes Class.students[] a
 * CURRENT-COHORT CACHE: it lists who is in that class *now*.
 *
 * Reading it for a historical question returns today's members labelled as last
 * year's. That is not a partial answer, it is a wrong one, and it would look
 * entirely plausible. So this service must NEVER read it, and the tests assert
 * that by stubbing the Class model and failing if it is touched.
 *
 * ── What it reads instead (D-006) ───────────────────────────────────────────
 *   PromotionRecord.fromClass / toClass   — the transition itself
 *   academicYearId-stamped Attendance, Result, Timetable — the year's activity
 *
 * ── First-year fallback ─────────────────────────────────────────────────────
 * In the first year of operation no PromotionRecord exists yet, because nobody
 * has been promoted. The service falls back to year-stamped records and labels
 * the result `derived` rather than `transition-backed`, so a caller can tell the
 * difference between evidence and inference.
 */
const mongoose = require('mongoose');

/** Never read by this service. Named so the intent is greppable and testable. */
const FORBIDDEN_SOURCES = Object.freeze(['Class.students']);

/**
 * The class a student occupied during a given academic year.
 *
 * @param {object} opts
 * @param {*} opts.studentId
 * @param {*} opts.academicYearId
 * @param {*} opts.schoolId
 * @returns {Promise<{classId, grade, section, provenance, evidence}>}
 *   provenance: 'transition-backed' | 'derived' | 'unknown'
 */
async function classForYear({ studentId, academicYearId, schoolId }) {
  if (!studentId) throw new Error('ENROLMENT_STUDENT_REQUIRED');
  if (!academicYearId) throw new Error('ENROLMENT_YEAR_REQUIRED');
  if (!schoolId) throw new Error('ENROLMENT_SCHOOL_REQUIRED');

  const PromotionRecord = mongoose.model('PromotionRecord');

  // A record whose fromAcademicYear is this year tells us the class the student
  // was IN during it — fromClass is where they sat, toClass is where they went.
  const outbound = await PromotionRecord.findOne({
    student: studentId,
    school: schoolId,
    fromAcademicYear: academicYearId,
  }).lean();

  if (outbound) {
    return {
      classId: outbound.fromClass,
      grade: outbound.fromGrade,
      section: outbound.fromSection,
      provenance: 'transition-backed',
      evidence: { promotionRecord: outbound._id, via: 'fromAcademicYear' },
    };
  }

  // Otherwise a record that moved them INTO this year names the class they
  // entered. Used for the most recent year, where no outbound record exists yet.
  const inbound = await PromotionRecord.findOne({
    student: studentId,
    school: schoolId,
    toAcademicYear: academicYearId,
  }).lean();

  if (inbound && inbound.toClass) {
    return {
      classId: inbound.toClass,
      grade: inbound.toGrade,
      section: inbound.toSection,
      provenance: 'transition-backed',
      evidence: { promotionRecord: inbound._id, via: 'toAcademicYear' },
    };
  }

  // ── First-year fallback ────────────────────────────────────────────────────
  // No transition exists. Derive from year-stamped Attendance, which references
  // the class directly. Labelled 'derived' so the caller knows this is inference.
  const { Attendance } = require('../models/index');
  const stamped = await Attendance.findOne({
    student: studentId,
    school: schoolId,
    academicYearId,
  })
    .select('class')
    .lean();

  if (stamped && stamped.class) {
    return {
      classId: stamped.class,
      grade: null,
      section: null,
      provenance: 'derived',
      evidence: { source: 'Attendance.academicYearId', note: 'No PromotionRecord exists for this year.' },
    };
  }

  return {
    classId: null,
    grade: null,
    section: null,
    provenance: 'unknown',
    evidence: { note: 'No transition record and no year-stamped activity found.' },
  };
}

/**
 * A student's full enrolment history, one entry per academic year, newest first.
 */
async function historyForStudent({ studentId, schoolId }) {
  if (!studentId) throw new Error('ENROLMENT_STUDENT_REQUIRED');
  if (!schoolId) throw new Error('ENROLMENT_SCHOOL_REQUIRED');

  const AcademicYear = mongoose.model('AcademicYear');
  const years = await AcademicYear.find({ school: schoolId })
    .sort({ startDate: -1 })
    .lean();

  const entries = [];
  for (const y of years) {
    const placement = await classForYear({
      studentId,
      academicYearId: y._id,
      schoolId,
    });
    if (placement.provenance === 'unknown') continue;
    entries.push({
      academicYear: { id: y._id, name: y.name, startDate: y.startDate, endDate: y.endDate },
      ...placement,
    });
  }
  return entries;
}

/**
 * Which students occupied a class during a given academic year.
 *
 * This is the query most likely to be written incorrectly, because
 * `Class.students[]` looks like exactly the right field and is not.
 */
async function rosterForClassYear({ classId, academicYearId, schoolId }) {
  if (!classId) throw new Error('ENROLMENT_CLASS_REQUIRED');
  if (!academicYearId) throw new Error('ENROLMENT_YEAR_REQUIRED');
  if (!schoolId) throw new Error('ENROLMENT_SCHOOL_REQUIRED');

  const PromotionRecord = mongoose.model('PromotionRecord');

  const outbound = await PromotionRecord.find({
    school: schoolId,
    fromClass: classId,
    fromAcademicYear: academicYearId,
  })
    .select('student fromGrade fromSection')
    .lean();

  if (outbound.length > 0) {
    return {
      provenance: 'transition-backed',
      students: outbound.map((r) => r.student),
      count: outbound.length,
    };
  }

  const inbound = await PromotionRecord.find({
    school: schoolId,
    toClass: classId,
    toAcademicYear: academicYearId,
  })
    .select('student')
    .lean();

  if (inbound.length > 0) {
    return {
      provenance: 'transition-backed',
      students: inbound.map((r) => r.student),
      count: inbound.length,
    };
  }

  // First-year fallback: distinct students with year-stamped attendance in this class.
  const { Attendance } = require('../models/index');
  const ids = await Attendance.distinct('student', {
    school: schoolId,
    class: classId,
    academicYearId,
  });

  return {
    provenance: ids.length > 0 ? 'derived' : 'unknown',
    students: ids,
    count: ids.length,
  };
}

module.exports = {
  classForYear,
  historyForStudent,
  rosterForClassYear,
  FORBIDDEN_SOURCES,
};
