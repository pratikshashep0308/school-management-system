// backend/services/examResultService.js
//
// Result history, re-test resolution and mark corrections.
//
// ─── WHAT THIS ADDS TO THE EXISTING MODULE ───────────────────────────────────
// The exam module already creates exams, schedules subjects, takes marks,
// calculates grades and publishes results. Three things it could not do:
//
//   · show a student's results across academic years, not just one exam
//   · run a re-test without destroying the original attempt
//   · change a published mark and leave a record of what it was
//
// ─── A NOTE ON THE DATA ──────────────────────────────────────────────────────
// As at 13 Aug 2026 the school has 9 exam types and 1 grading scheme configured
// and ZERO exam groups, subjects or marks. Nothing has been run through the
// module yet. Every function here is written against the real schemas, but none
// has been exercised against real marks — the first exam will be the test.

const mongoose = require('mongoose');
const { ExamGroup, ExamSubject, ExamMark } = require('../models/examModels');

/**
 * Every result a student has, newest first, grouped by exam.
 *
 * Crosses academic years deliberately: "how has this child done over time" is a
 * different question from "how did they do in the Term 1 exam", and the second
 * is already answered elsewhere.
 *
 * Only PUBLISHED results, unless the caller is staff. A parent seeing a mark
 * before the school has released it undermines the point of publishing.
 */
async function studentHistory(school, studentId, { includeUnpublished = false } = {}) {
  const match = {
    school: new mongoose.Types.ObjectId(school),
    student: new mongoose.Types.ObjectId(studentId),
  };
  if (!includeUnpublished) match.status = 'published';

  const marks = await ExamMark.find(match)
    .populate({ path: 'examGroup', select: 'name academicYear examType startDate status isRetest retestOf' })
    .populate({ path: 'examSubject', select: 'subject', populate: { path: 'subject', select: 'name code' } })
    .sort({ createdAt: -1 })
    .lean();

  // Group by exam, so the caller gets one entry per exam rather than a flat
  // list of subject rows they would have to assemble themselves.
  const byGroup = new Map();

  for (const m of marks) {
    const g = m.examGroup;
    if (!g) continue;                       // orphaned mark — skip rather than crash
    const key = String(g._id);

    if (!byGroup.has(key)) {
      byGroup.set(key, {
        examGroupId: g._id,
        examName: g.name,
        academicYear: g.academicYear || '(not set)',
        startDate: g.startDate,
        isRetest: Boolean(g.isRetest),
        retestOf: g.retestOf || null,
        subjects: [],
        obtained: 0,
        maxMarks: 0,
        subjectsPassed: 0,
        subjectsFailed: 0,
        absent: 0,
      });
    }

    const entry = byGroup.get(key);
    entry.subjects.push({
      subject: m.examSubject?.subject?.name || '(subject removed)',
      obtained: m.obtained,
      maxMarks: m.maxMarks,
      percentage: m.percentage,
      grade: m.grade,
      isPass: m.isPass,
      isAbsent: m.isAbsent,
      remarks: m.remarks,
      // Surfaced so a reader can see a mark was changed without opening it.
      corrected: (m.corrections || []).length > 0,
    });

    // An absent subject contributes nothing to the total and is counted
    // separately — averaging a zero for an absence would misrepresent the
    // student's performance in the subjects they actually sat.
    if (m.isAbsent) { entry.absent += 1; continue; }

    entry.obtained += m.obtained || 0;
    entry.maxMarks += m.maxMarks || 0;
    if (m.isPass) entry.subjectsPassed += 1; else entry.subjectsFailed += 1;
  }

  const exams = [...byGroup.values()].map((e) => ({
    ...e,
    percentage: e.maxMarks > 0
      ? Math.round((e.obtained / e.maxMarks) * 1000) / 10
      : null,
    // Null rather than 0 where nothing was sat: "no result" and "scored zero"
    // are different facts and a trend chart must not treat them alike.
    overallPass: e.subjectsFailed === 0 && e.subjectsPassed > 0,
  }));

  exams.sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));

  // Year-by-year rollup for the trend view.
  const byYear = {};
  for (const e of exams) {
    if (e.percentage === null) continue;
    if (!byYear[e.academicYear]) byYear[e.academicYear] = { exams: 0, totalPct: 0 };
    byYear[e.academicYear].exams += 1;
    byYear[e.academicYear].totalPct += e.percentage;
  }
  const trend = Object.entries(byYear).map(([year, v]) => ({
    academicYear: year,
    exams: v.exams,
    averagePercentage: Math.round((v.totalPct / v.exams) * 10) / 10,
  })).sort((a, b) => String(a.academicYear).localeCompare(String(b.academicYear)));

  return { exams, trend, examCount: exams.length };
}

/**
 * Correct a mark, keeping what it was.
 *
 * A reason is required. "Corrected by the office" with no explanation is the
 * sort of entry that satisfies nobody reading it a year later.
 */
async function correctMark(school, markId, { obtained, grade, reason, user }) {
  if (!reason || !String(reason).trim()) {
    const e = new Error('A reason is required to correct a mark');
    e.status = 400;
    throw e;
  }

  const mark = await ExamMark.findOne({ _id: markId, school });
  if (!mark) {
    const e = new Error('Mark not found');
    e.status = 404;
    throw e;
  }

  const group = await ExamGroup.findById(mark.examGroup).select('status').lean();
  const afterPublish = mark.status === 'published' || group?.status === 'published';

  mark.corrections.push({
    at: new Date(),
    by: user?._id,
    byName: user?.name,
    fromObtained: mark.obtained,
    toObtained: obtained,
    fromGrade: mark.grade,
    toGrade: grade,
    reason: String(reason).trim(),
    afterPublish,
  });

  if (obtained !== undefined) mark.obtained = obtained;
  if (grade !== undefined) mark.grade = grade;
  if (mark.maxMarks > 0) {
    mark.percentage = Math.round((mark.obtained / mark.maxMarks) * 1000) / 10;
  }

  await mark.save();
  return mark;
}

/**
 * Which attempt counts, where a re-test exists.
 *
 * Applies the group's own policy rather than a global rule, because schools
 * differ: some take the better of the two, some let a re-sit supersede outright.
 */
function resolveAttempt(originalMark, retestMark, policy = 'best') {
  if (!retestMark) return originalMark;
  if (!originalMark) return retestMark;

  if (policy === 'latest') return retestMark;
  if (policy === 'original') return originalMark;

  // 'best' — compare on percentage, since the two attempts may be out of
  // different totals.
  return (retestMark.percentage || 0) > (originalMark.percentage || 0)
    ? retestMark
    : originalMark;
}

module.exports = { studentHistory, correctMark, resolveAttempt };
