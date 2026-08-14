/**
 * examResultProvider — FP-036 · GAP-AE-007, GAP-AE-008, GAP-SIS-006, GAP-AE-001
 * Decisions D-001, D-010, D-011 · FINAL LLD 1.1 §18.1, §18.2, §22
 *
 * ── The boundary this defines ───────────────────────────────────────────────
 * Two exam systems run in the codebase: legacy Exam/Result at /api/exams, and
 * the advanced ExamGroup/ExamSubject/ExamMark stack at /api/exams-adv. D-001
 * makes the ADVANCED module authoritative for examination, results, pass/fail
 * and promotion eligibility.
 *
 * This module is the single seam between the assessment domain and promotion.
 * Promotion never queries exam collections directly; it calls this provider.
 * That is what makes D-001 enforceable rather than aspirational — there is one
 * place to check, and one place a legacy read could be caught.
 *
 * Legacy Result is NEVER consulted here. Its rows remain historical evidence and
 * other features may still read them, but no TFS-EOS promotion decision derives
 * from them.
 *
 * ── No provider is invented ─────────────────────────────────────────────────
 * The "provider" here is an internal boundary over collections that already
 * exist. It is not an external vendor integration and requires no open ADR.
 */
const mongoose = require('mongoose');

/** D-011 blocking codes. Named so callers surface them rather than a generic 400. */
const BLOCK_GROUP_UNPUBLISHED = 'PROMOTION_BLOCKED_GROUP_UNPUBLISHED';
const BLOCK_MARKS_INCOMPLETE = 'PROMOTION_BLOCKED_MARKS_INCOMPLETE';

/** Retest policies, read from the RETEST group rather than the original. */
const RETEST_POLICIES = Object.freeze(['best', 'latest', 'original']);

/**
 * Resolve one student's mark for one subject across an original group and any
 * retest chain.
 *
 * ── Where the policy lives ──────────────────────────────────────────────────
 * On the RETEST group, not the original. A school decides "this retest counts as
 * best-of" when it schedules the retest — the original exam was set before
 * anyone knew a retest would be needed.
 *
 * ── Chained retests ─────────────────────────────────────────────────────────
 * A second retest resolves against the FULL set (original + all retests), not
 * pairwise against the previous one. Pairwise resolution of a 'best' policy
 * would discard a higher earlier mark.
 *
 * @param {object} original  ExamMark from the original group, or null
 * @param {Array}  retests   ExamMarks from retest groups, each with its group
 * @returns {{mark: object|null, policy: string|null, sourceGroup: *}}
 */
function resolveRetestChain(original, retests = []) {
  const valid = retests.filter((r) => r && r.mark);
  if (valid.length === 0) {
    return {
      mark: original || null,
      policy: null,
      sourceGroup: original ? original.examGroup : null,
    };
  }

  // Policy comes from the most recent retest group in the chain.
  const ordered = [...valid].sort(
    (a, b) => new Date(a.group.startDate || 0) - new Date(b.group.startDate || 0)
  );
  const governing = ordered[ordered.length - 1];
  const policy = RETEST_POLICIES.includes(governing.group.retestPolicy)
    ? governing.group.retestPolicy
    : 'best';

  if (policy === 'original') {
    return {
      mark: original || ordered[0].mark,
      policy,
      sourceGroup: original ? original.examGroup : ordered[0].group._id,
    };
  }

  if (policy === 'latest') {
    return { mark: governing.mark, policy, sourceGroup: governing.group._id };
  }

  // 'best' — across the FULL set including the original, not pairwise.
  const all = [
    ...(original ? [{ mark: original, group: { _id: original.examGroup } }] : []),
    ...ordered,
  ];
  const best = all.reduce((acc, cur) => {
    const a = effectiveMarks(acc.mark);
    const c = effectiveMarks(cur.mark);
    return c > a ? cur : acc;
  });
  return { mark: best.mark, policy, sourceGroup: best.group._id };
}

/** Obtained marks including grace marks. Grace is applied BEFORE evaluation. */
function effectiveMarks(mark) {
  if (!mark) return -Infinity;
  const obtained = Number(mark.marksObtained) || 0;
  const grace = Number(mark.graceMarks) || 0;
  return obtained + grace;
}

/**
 * Per-subject pass/fail for one student.
 *
 * Reads `isPass` where the advanced module has computed it, and falls back to
 * comparing effective marks against the subject's passing marks. It never
 * recomputes from legacy Result.
 */
function evaluateSubject(mark, examSubject) {
  if (!mark) {
    return { hasMark: false, isPass: null, isAbsent: false, reason: 'missing' };
  }
  // D-011: only an explicit isAbsent:true counts as absence. A missing row does not.
  if (mark.isAbsent === true) {
    return {
      hasMark: true, isPass: false, isAbsent: true, reason: 'absent',
      obtained: 0, graceMarks: Number(mark.graceMarks) || 0,
    };
  }
  const effective = effectiveMarks(mark);
  const passing = Number(examSubject && examSubject.passingMarks);
  const isPass =
    typeof mark.isPass === 'boolean'
      ? mark.isPass
      : Number.isFinite(passing)
        ? effective >= passing
        : null;

  return {
    hasMark: true,
    isPass,
    isAbsent: false,
    reason: isPass ? 'pass' : 'fail',
    obtained: Number(mark.marksObtained) || 0,
    graceMarks: Number(mark.graceMarks) || 0,
    effective,
    passingMarks: Number.isFinite(passing) ? passing : null,
  };
}

/**
 * D-011 — is this ExamGroup eligible to drive promotion?
 *
 * Both gates, in order:
 *   1. the group is published
 *   2. every student/subject pair has a PUBLISHED ExamMark
 *
 * A missing mark BLOCKS and names the gap. It is not absence and not a fail:
 * conflating "no data" with "the student failed" would retain a student because
 * a teacher had not finished data entry, and the record would look legitimate
 * afterwards.
 *
 * @returns {Promise<{eligible: boolean, code: string|null, missing: Array, message: string|null}>}
 */
async function checkEligibility({ examGroupId, studentIds, schoolId }) {
  if (!examGroupId) throw new Error('EXAM_GROUP_REQUIRED');
  if (!Array.isArray(studentIds)) throw new Error('EXAM_STUDENTS_REQUIRED');

  const ExamGroup = mongoose.model('ExamGroup');
  const ExamSubject = mongoose.model('ExamSubject');
  const ExamMark = mongoose.model('ExamMark');

  const group = await ExamGroup.findOne({ _id: examGroupId, school: schoolId }).lean();
  if (!group) throw new Error('EXAM_GROUP_NOT_FOUND');

  // ── Gate 1 ────────────────────────────────────────────────────────────────
  if (group.status !== 'published') {
    return {
      eligible: false,
      code: BLOCK_GROUP_UNPUBLISHED,
      missing: [],
      message:
        `Exam group '${group.name || examGroupId}' has status '${group.status}'. ` +
        'Final results must be announced before promotion can run.',
    };
  }

  // ── Gate 2 ────────────────────────────────────────────────────────────────
  const subjects = await ExamSubject.find({ examGroup: examGroupId }).lean();
  if (subjects.length === 0) {
    return {
      eligible: false,
      code: BLOCK_MARKS_INCOMPLETE,
      missing: [],
      message: `Exam group '${group.name || examGroupId}' has no subjects.`,
    };
  }

  const marks = await ExamMark.find({
    examGroup: examGroupId,
    student: { $in: studentIds },
    status: 'published',
  }).lean();

  const have = new Set(marks.map((m) => `${m.student}::${m.examSubject}`));
  const missing = [];
  for (const studentId of studentIds) {
    for (const subj of subjects) {
      if (!have.has(`${studentId}::${subj._id}`)) {
        missing.push({
          student: studentId,
          examSubject: subj._id,
          subjectName: subj.name || subj.subject,
        });
      }
    }
  }

  if (missing.length > 0) {
    return {
      eligible: false,
      code: BLOCK_MARKS_INCOMPLETE,
      missing,
      message:
        `${missing.length} published mark(s) are missing. A missing mark blocks ` +
        'promotion — it is not treated as absence or as a fail. Complete mark ' +
        'entry, or record an explicit absence, then re-run.',
    };
  }

  return { eligible: true, code: null, missing: [], message: null };
}

/**
 * Per-student promotion outcome for a published exam group.
 *
 * Returns the data `PromotionRecord.computedPassFail` snapshots, including the
 * provenance of each mark — which group supplied it and which retest policy was
 * applied — so a decision stays explainable after a later correction.
 */
async function resultsForPromotion({ examGroupId, studentIds, schoolId }) {
  const eligibility = await checkEligibility({ examGroupId, studentIds, schoolId });
  if (!eligibility.eligible) {
    const err = new Error(eligibility.message);
    err.code = eligibility.code;
    err.missing = eligibility.missing;
    throw err;
  }

  const ExamGroup = mongoose.model('ExamGroup');
  const ExamSubject = mongoose.model('ExamSubject');
  const ExamMark = mongoose.model('ExamMark');

  const group = await ExamGroup.findOne({ _id: examGroupId, school: schoolId }).lean();
  const subjects = await ExamSubject.find({ examGroup: examGroupId }).lean();

  // Retest groups pointing at this one, plus any chained beyond them.
  const retestGroups = await ExamGroup.find({
    school: schoolId,
    retestOf: examGroupId,
  }).lean();

  const groupIds = [examGroupId, ...retestGroups.map((g) => g._id)];
  const allMarks = await ExamMark.find({
    examGroup: { $in: groupIds },
    student: { $in: studentIds },
    status: 'published',
  }).lean();

  const byStudentSubject = new Map();
  for (const m of allMarks) {
    const key = `${m.student}::${m.examSubject}`;
    if (!byStudentSubject.has(key)) byStudentSubject.set(key, []);
    byStudentSubject.get(key).push(m);
  }
  const groupById = new Map(retestGroups.map((g) => [String(g._id), g]));

  return studentIds.map((studentId) => {
    const subjectResults = subjects.map((subj) => {
      const candidates = byStudentSubject.get(`${studentId}::${subj._id}`) || [];
      const original = candidates.find((m) => String(m.examGroup) === String(examGroupId)) || null;
      const retests = candidates
        .filter((m) => String(m.examGroup) !== String(examGroupId))
        .map((m) => ({ mark: m, group: groupById.get(String(m.examGroup)) || { _id: m.examGroup } }));

      const resolved = resolveRetestChain(original, retests);
      const evaluated = evaluateSubject(resolved.mark, subj);

      return {
        examSubject: subj._id,
        subjectName: subj.name || subj.subject,
        ...evaluated,
        sourceExamGroup: resolved.sourceGroup,
        retestPolicy: resolved.policy,
      };
    });

    const failed = subjectResults.filter((r) => r.isPass === false);
    return {
      student: studentId,
      allPassed: failed.length === 0,
      failedCount: failed.length,
      failedSubjects: failed.map((r) => r.subjectName),
      computedPassFail: {
        examGroup: examGroupId,
        examGroupName: group.name,
        retestPolicy: subjectResults.find((r) => r.retestPolicy)?.retestPolicy || null,
        subjects: subjectResults,
      },
    };
  });
}

/**
 * D-010 — announcement is GROUP-LEVEL and explicit.
 *
 * `ExamGroup.classes[]` is an array with a single group-level `status`, so
 * publishing affects every class in the group. Maharashtra State Board schools
 * announce on 1 May grade-wide, so a multi-class group is the normal case rather
 * than an edge case.
 *
 * The response therefore NAMES EVERY affected class. The administrator sees the
 * scope before confirming rather than discovering it afterwards.
 *
 * Per-class announcement is achieved by creating one ExamGroup per class — an
 * operational convention requiring no code change.
 */
async function describeAnnouncementScope({ examGroupId, schoolId }) {
  const ExamGroup = mongoose.model('ExamGroup');
  const Class = mongoose.model('Class');

  const group = await ExamGroup.findOne({ _id: examGroupId, school: schoolId }).lean();
  if (!group) throw new Error('EXAM_GROUP_NOT_FOUND');

  const classIds = Array.isArray(group.classes) ? group.classes : [];
  const classes = await Class.find({ _id: { $in: classIds } })
    .select('name grade section')
    .lean();

  return {
    examGroup: { id: group._id, name: group.name, status: group.status },
    affectedClasses: classes.map((c) => ({
      id: c._id,
      label: `${c.name || c.grade}-${c.section || ''}`.replace(/-$/, ''),
    })),
    affectedClassCount: classes.length,
    // The whole point of D-010: the scope is stated, not inferred.
    notice:
      classes.length > 1
        ? `Announcing final results publishes for ALL ${classes.length} classes in this exam group.`
        : 'Announcing final results publishes for the single class in this exam group.',
    alreadyPublished: group.status === 'published',
  };
}

module.exports = {
  checkEligibility,
  resultsForPromotion,
  describeAnnouncementScope,
  resolveRetestChain,
  evaluateSubject,
  effectiveMarks,
  RETEST_POLICIES,
  BLOCK_GROUP_UNPUBLISHED,
  BLOCK_MARKS_INCOMPLETE,
};
