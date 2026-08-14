/**
 * promotionService — FP-037 · GAP-SIS-005…009 · Decisions D-001, D-004, D-011
 * FINAL LLD 1.1 §18.3 · U-08 ENVIRONMENT VALIDATION PENDING
 *
 * ── The invariant ───────────────────────────────────────────────────────────
 * `Student.class`, `sourceClass.students[]` and `targetClass.students[]` are
 * three representations of ONE fact: which class a student is in. A partial
 * write leaves a state no read path can interpret, and the divergence is silent
 * — nothing in the existing codebase enforces agreement between them.
 *
 * So every change in a batch commits together or none does. D-004.
 *
 * ── Batch-level, not per-student ────────────────────────────────────────────
 * Forty per-student transactions each mutating the same `Class.students[]`
 * document produce write conflicts. One transaction per BATCH with a single
 * `$pull` and `$addToSet` per class pair satisfies D-004 in full: every change
 * commits or rolls back together. D-004 mandates atomicity, not per-student
 * granularity.
 *
 * ── Student.grade is never written ──────────────────────────────────────────
 * It does not exist. Promotion re-points `Student.class` at an EXISTING target
 * Class, located by grade + 1. Creating a second representation of current class
 * is forbidden.
 *
 * ── Transactions are required, and there is no fallback ─────────────────────
 * `startSession()` throws on a standalone mongod. This module does NOT degrade
 * to sequential writes: that failure mode is inconsistent enrolment data that
 * looks correct. Startup catches the missing capability (FP-001); this module
 * fails loudly if it is reached anyway.
 *
 * LIVE VALIDATION AGAINST A REAL DEPLOYMENT: ENVIRONMENT VALIDATION PENDING.
 * The unit tests below use a mocked session and prove the call sequence, not
 * that MongoDB honoured it.
 */
const mongoose = require('mongoose');
const examResultProvider = require('./examResultProvider');

/** GAP-SIS-009 — batch cap. A named constant, not a literal at the call site. */
const MAX_BATCH_SIZE = 200;

const ERR = {
  NO_TARGET: 'PROMOTION_NO_TARGET_CLASS',
  MEMBERSHIP: 'PROMOTION_SOURCE_MEMBERSHIP_MISMATCH',
  BATCH_TOO_LARGE: 'PROMOTION_BATCH_TOO_LARGE',
  NO_TRANSACTIONS: 'TRANSACTIONS_UNAVAILABLE',
  YEAR_MISSING: 'PROMOTION_TARGET_YEAR_MISSING',
};

/**
 * Locate — never create — the next class.
 *
 * D-002 keeps Class global with a unique index on {name, section, school}.
 * Creating a target here would either violate that index or silently invent a
 * class nobody timetabled.
 *
 * @returns {Promise<object|null>} null means the student is at the highest grade
 */
async function locateTargetClass({ sourceClass, schoolId, sectionPolicy = 'same' }) {
  const Class = mongoose.model('Class');
  const nextGrade = Number(sourceClass.grade) + 1;

  const query = { school: schoolId, grade: nextGrade };
  if (sectionPolicy === 'same' && sourceClass.section) {
    query.section = sourceClass.section;
  }

  let target = await Class.findOne(query).lean();

  // Same-section preferred, but a school may not run every section at every
  // grade. Fall back to any section at the next grade before concluding the
  // student has graduated.
  if (!target && sectionPolicy === 'same') {
    target = await Class.findOne({ school: schoolId, grade: nextGrade }).lean();
  }
  return target || null;
}

/**
 * Preview promotion outcomes without writing anything.
 *
 * Runs the D-011 eligibility gates first, so an incomplete mark set surfaces as
 * a named blocker here rather than as a wrong outcome later.
 */
async function preview({ classId, examGroupId, academicYearId, toAcademicYearId, schoolId, sectionPolicy = 'same' }) {
  const Class = mongoose.model('Class');
  const Student = mongoose.model('Student');

  const sourceClass = await Class.findOne({ _id: classId, school: schoolId }).lean();
  if (!sourceClass) throw new Error('PROMOTION_SOURCE_CLASS_NOT_FOUND');

  const students = await Student.find({
    class: classId,
    school: schoolId,
    status: 'active',
  })
    .select('_id rollNumber user')
    .lean();

  if (students.length > MAX_BATCH_SIZE) {
    const err = new Error(
      `${ERR.BATCH_TOO_LARGE}: ${students.length} students exceeds the ${MAX_BATCH_SIZE} cap. ` +
        'Split the promotion into smaller batches.'
    );
    err.code = ERR.BATCH_TOO_LARGE;
    throw err;
  }

  const studentIds = students.map((s) => s._id);

  // D-011 — throws with a named code and the missing pairs if either gate fails.
  const results = await examResultProvider.resultsForPromotion({
    examGroupId,
    studentIds,
    schoolId,
  });

  const targetClass = await locateTargetClass({ sourceClass, schoolId, sectionPolicy });

  const rows = results.map((r) => {
    // No next class means the student is at the highest grade — graduated, not
    // an error.
    if (!targetClass) {
      return {
        student: r.student,
        decision: 'graduated',
        allPassed: r.allPassed,
        failedSubjects: r.failedSubjects,
        computedPassFail: r.computedPassFail,
        targetClass: null,
      };
    }
    return {
      student: r.student,
      decision: r.allPassed ? 'promoted' : 'retained',
      allPassed: r.allPassed,
      failedSubjects: r.failedSubjects,
      retentionReason: r.allPassed
        ? null
        : `Did not pass: ${r.failedSubjects.join(', ')}`,
      computedPassFail: r.computedPassFail,
      targetClass: targetClass._id,
    };
  });

  return {
    sourceClass: { id: sourceClass._id, grade: sourceClass.grade, section: sourceClass.section },
    targetClass: targetClass
      ? { id: targetClass._id, grade: targetClass.grade, section: targetClass.section }
      : null,
    academicYearId,
    toAcademicYearId,
    counts: {
      total: rows.length,
      promoted: rows.filter((r) => r.decision === 'promoted').length,
      retained: rows.filter((r) => r.decision === 'retained').length,
      graduated: rows.filter((r) => r.decision === 'graduated').length,
    },
    rows,
  };
}

/**
 * Confirm a previewed promotion. ONE transaction for the whole batch.
 *
 * @param {object} opts
 * @param {object} opts.previewResult   output of preview()
 * @param {string} opts.batchId         idempotency key
 * @param {object} [opts.overrides]     { [studentId]: {decision, overrideReason} }
 * @param {*} [opts.session]            injected for unit testing
 */
async function confirm({ previewResult, batchId, schoolId, actorId, overrides = {}, session: injected }) {
  if (!batchId) throw new Error('PROMOTION_BATCH_ID_REQUIRED');
  if (!previewResult || !Array.isArray(previewResult.rows)) {
    throw new Error('PROMOTION_PREVIEW_REQUIRED');
  }
  if (!previewResult.toAcademicYearId &&
      previewResult.rows.some((r) => r.decision === 'promoted')) {
    throw new Error(
      `${ERR.YEAR_MISSING}: the target academic year must exist before promotion runs. ` +
        'Run rollover first — PromotionRecord carries toAcademicYear.'
    );
  }

  const Student = mongoose.model('Student');
  const Class = mongoose.model('Class');
  const PromotionRecord = mongoose.model('PromotionRecord');

  // Idempotency (GAP-SIS-009): a re-run of the same batch is a no-op, not a
  // duplicate promotion.
  const existing = await PromotionRecord.findOne({ school: schoolId, batchId }).lean();
  if (existing) {
    return { alreadyApplied: true, batchId, written: 0 };
  }

  let session = injected;
  let ownsSession = false;
  if (!session) {
    try {
      session = await mongoose.startSession();
      ownsSession = true;
    } catch (err) {
      // No silent fallback. A sequential write path would produce inconsistent
      // enrolment data that looks correct.
      const e = new Error(
        `${ERR.NO_TRANSACTIONS}: this deployment does not support multi-document ` +
          'transactions, which promotion requires (D-004). A single-node replica set ' +
          `is sufficient. Underlying error: ${err.message}`
      );
      e.code = ERR.NO_TRANSACTIONS;
      throw e;
    }
  }

  const summary = { batchId, promoted: 0, retained: 0, graduated: 0, written: 0 };

  try {
    await session.withTransaction(async () => {
      const rows = previewResult.rows.map((r) => {
        const o = overrides[String(r.student)];
        if (!o) return r;
        return {
          ...r,
          decision: o.decision || r.decision,
          overridden: true,
          overrideReason: o.overrideReason,
          retentionReason:
            (o.decision || r.decision) === 'retained'
              ? o.overrideReason || r.retentionReason
              : null,
        };
      });

      const promoted = rows.filter((r) => r.decision === 'promoted');
      const graduated = rows.filter((r) => r.decision === 'graduated');
      const src = previewResult.sourceClass.id;
      const tgt = previewResult.targetClass ? previewResult.targetClass.id : null;

      // ── Pre-condition: the student must actually be in the source cohort ──
      // Student.class and Class.students[] are maintained by existing code with
      // nothing enforcing agreement. Without this check a `$pull` would silently
      // no-op and the promotion would report success over inconsistent data.
      const moving = [...promoted, ...graduated].map((r) => r.student);
      if (moving.length > 0) {
        const sourceDoc = await Class.findById(src).select('students').session(session).lean();
        const members = new Set((sourceDoc?.students || []).map(String));
        const absent = moving.filter((id) => !members.has(String(id)));
        if (absent.length > 0) {
          const e = new Error(
            `${ERR.MEMBERSHIP}: ${absent.length} student(s) are not present in the source ` +
              'class roster. Enrolment has drifted; reconcile before promoting.'
          );
          e.code = ERR.MEMBERSHIP;
          e.students = absent;
          throw e;
        }
      }

      // ── 1. PromotionRecord for EVERY decision, including retention ─────────
      const records = rows.map((r) => ({
        student: r.student,
        fromClass: src,
        toClass: r.decision === 'promoted' ? tgt : null,
        fromGrade: String(previewResult.sourceClass.grade ?? ''),
        fromSection: previewResult.sourceClass.section,
        toGrade: r.decision === 'promoted' ? String(previewResult.targetClass.grade ?? '') : undefined,
        toSection: r.decision === 'promoted' ? previewResult.targetClass.section : undefined,
        fromAcademicYear: previewResult.academicYearId,
        toAcademicYear: r.decision === 'promoted' ? previewResult.toAcademicYearId : null,
        decision: r.decision,
        retentionReason: r.decision === 'retained' ? r.retentionReason : null,
        overridden: Boolean(r.overridden),
        overrideReason: r.overrideReason || null,
        computedPassFail: r.computedPassFail,
        decidedBy: actorId,
        batchId,
        school: schoolId,
      }));
      await PromotionRecord.insertMany(records, { session, ordered: true });
      summary.written = records.length;

      // ── 2. Student.class — the authoritative current class ────────────────
      // Student.grade is NEVER written. It does not exist.
      if (promoted.length > 0) {
        await Student.bulkWrite(
          promoted.map((r) => ({
            updateOne: {
              filter: { _id: r.student, school: schoolId },
              update: { $set: { class: tgt, section: previewResult.targetClass.section } },
            },
          })),
          { session }
        );
      }
      if (graduated.length > 0) {
        await Student.bulkWrite(
          graduated.map((r) => ({
            updateOne: {
              filter: { _id: r.student, school: schoolId },
              update: { $set: { status: 'alumni', isActive: false } },
            },
          })),
          { session }
        );
      }

      // ── 3. Class.students[] — ONE write per class, not one per student ────
      const leaving = moving;
      if (leaving.length > 0) {
        await Class.updateOne(
          { _id: src },
          { $pull: { students: { $in: leaving } } },
          { session }
        );
      }
      if (promoted.length > 0 && tgt) {
        await Class.updateOne(
          { _id: tgt },
          { $addToSet: { students: { $each: promoted.map((r) => r.student) } } },
          { session }
        );
      }

      summary.promoted = promoted.length;
      summary.graduated = graduated.length;
      summary.retained = rows.filter((r) => r.decision === 'retained').length;
    });
  } finally {
    if (ownsSession && session.endSession) await session.endSession();
  }

  return { alreadyApplied: false, ...summary };
}

module.exports = {
  preview,
  confirm,
  locateTargetClass,
  MAX_BATCH_SIZE,
  ERR,
};
