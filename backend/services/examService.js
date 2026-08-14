// backend/services/examService.js
// Shared calculation logic for the advanced exam module. Keeping it here (not
// in a pre-save hook) means report cards, analytics and bulk entry all agree,
// and the rules stay testable.

const COMPONENTS = ['theory', 'practical', 'internal', 'project', 'oral', 'assignment'];

// Marks available for a subject, counting only the components in use.
function maxMarksFor(examSubject) {
  const c = examSubject?.components || {};
  return COMPONENTS.reduce((sum, k) => sum + (c[k]?.enabled ? Number(c[k].max || 0) : 0), 0);
}

// Sum of what the student scored, plus any grace marks.
function obtainedFor(markDoc, examSubject) {
  if (markDoc.isAbsent) return 0;
  const c = examSubject?.components || {};
  const m = markDoc.marks || {};
  const raw = COMPONENTS.reduce((sum, k) => {
    if (!c[k]?.enabled) return sum;              // ignore unused components
    const v = m[k];
    return sum + (v == null || isNaN(v) ? 0 : Number(v));
  }, 0);
  return raw + Number(markDoc.graceMarks || 0);
}

// Validate that no component exceeds its maximum. Returns an array of problems.
function validateMarks(markDoc, examSubject) {
  const errors = [];
  const c = examSubject?.components || {};
  const m = markDoc.marks || {};
  COMPONENTS.forEach(k => {
    if (!c[k]?.enabled) return;
    const v = m[k];
    if (v == null || v === '') return;           // blank is allowed (not yet entered)
    const n = Number(v);
    if (isNaN(n))        errors.push(`${k}: not a number`);
    else if (n < 0)      errors.push(`${k}: cannot be negative`);
    else if (n > c[k].max) errors.push(`${k}: exceeds maximum of ${c[k].max}`);
  });
  return errors;
}

// Resolve a percentage against a grading scheme. Falls back to a sensible
// default when a school hasn't configured one yet, so results never break.
const FALLBACK_BANDS = [
  { grade: 'A+', minPercent: 90, maxPercent: 100, gradePoint: 10, isFail: false },
  { grade: 'A',  minPercent: 80, maxPercent: 89.99, gradePoint: 9,  isFail: false },
  { grade: 'B+', minPercent: 70, maxPercent: 79.99, gradePoint: 8,  isFail: false },
  { grade: 'B',  minPercent: 60, maxPercent: 69.99, gradePoint: 7,  isFail: false },
  { grade: 'C',  minPercent: 50, maxPercent: 59.99, gradePoint: 6,  isFail: false },
  { grade: 'D',  minPercent: 35, maxPercent: 49.99, gradePoint: 5,  isFail: false },
  { grade: 'F',  minPercent: 0,  maxPercent: 34.99, gradePoint: 0,  isFail: true  },
];

function gradeFor(percentage, scheme) {
  const bands = (scheme?.bands?.length ? scheme.bands : FALLBACK_BANDS);
  const band = bands.find(b => percentage >= b.minPercent && percentage <= b.maxPercent);
  return band || null;
}

// Compute every derived field for a single mark row.
function computeMark(markDoc, examSubject, scheme) {
  const maxMarks = maxMarksFor(examSubject);
  const obtained = obtainedFor(markDoc, examSubject);
  const percentage = maxMarks > 0
    ? Math.round((obtained / maxMarks) * 10000) / 100   // 2 decimals
    : 0;

  const band = gradeFor(percentage, scheme);
  const passMark = scheme?.passMark ?? examSubject?.passingMarks ?? 35;

  return {
    obtained,
    maxMarks,
    percentage,
    grade:      band?.grade || '',
    gradePoint: band?.gradePoint || 0,
    // An absent student never passes, regardless of grace marks.
    isPass: markDoc.isAbsent ? false : (band?.isFail ? false : percentage >= passMark),
  };
}

// Aggregate a student's subject marks into an overall result.
function computeStudentResult(markDocs, scheme) {
  const valid = markDocs.filter(m => m.maxMarks > 0);
  const totalObtained = valid.reduce((s, m) => s + (m.obtained || 0), 0);
  const totalMax      = valid.reduce((s, m) => s + (m.maxMarks || 0), 0);
  const percentage    = totalMax > 0
    ? Math.round((totalObtained / totalMax) * 10000) / 100
    : 0;

  const band = gradeFor(percentage, scheme);
  // Failing any single subject fails the overall result — the usual convention.
  const failedSubjects = valid.filter(m => !m.isPass).length;

  const gradePoints = valid.map(m => m.gradePoint || 0);
  const gpa = gradePoints.length
    ? Math.round((gradePoints.reduce((a, b) => a + b, 0) / gradePoints.length) * 100) / 100
    : 0;

  return {
    totalObtained,
    totalMax,
    percentage,
    grade: band?.grade || '',
    gpa,
    subjectCount:  valid.length,
    failedSubjects,
    isPass: valid.length > 0 && failedSubjects === 0,
  };
}

// Rank students by percentage. Equal percentages share a rank, and the next
// rank skips accordingly (1,2,2,4) — standard competition ranking.
function assignRanks(studentResults) {
  const sorted = [...studentResults].sort((a, b) => b.percentage - a.percentage);
  let lastPct = null, lastRank = 0;
  return sorted.map((r, i) => {
    const rank = (r.percentage === lastPct) ? lastRank : i + 1;
    lastPct = r.percentage; lastRank = rank;
    return { ...r, rank };
  });
}

module.exports = {
  COMPONENTS,
  FALLBACK_BANDS,
  maxMarksFor,
  obtainedFor,
  validateMarks,
  gradeFor,
  computeMark,
  computeStudentResult,
  assignRanks,
};