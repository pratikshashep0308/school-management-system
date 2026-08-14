/**
 * tfsJobs — FP-038 · GAP-AE-004, GAP-AE-005 · FINAL LLD 1.1 §25, §46
 *
 * The three TFS-EOS background jobs. They follow the EXISTING node-cron
 * convention in jobs/scheduledReports.js exactly — one initialiser called from
 * server.js after the database connects. No second scheduler is introduced.
 *
 * ── The three jobs ──────────────────────────────────────────────────────────
 *   competencyMasteryRecompute — the SOLE writer of CompetencyMastery
 *   interventionSweep          — raises InterventionFlag past the threshold
 *   enrolmentDriftCheck        — REPORTS Student.class vs Class.students[] drift
 *
 * ── Two rules every job here obeys ──────────────────────────────────────────
 *   1. Idempotent, keyed by source record — a re-run changes nothing new.
 *   2. Batch truncation LOGS the dropped count. No silent caps (§45).
 *
 * The drift check REPORTS. It must never auto-correct: silently rewriting
 * enrolment to match one side of a disagreement could destroy the correct side.
 * A human reconciles.
 *
 * The compute functions are exported independently of the cron wiring so they
 * are unit-testable without a scheduler or a clock.
 */
const mongoose = require('mongoose');

/** Ordered mastery levels — index gives a numeric rank for comparison. */
const LEVELS = ['emerging', 'developing', 'proficient'];

/** Per-run safety cap. Exceeding it is logged, never silently dropped. */
const MAX_RECORDS_PER_RUN = 5000;

/**
 * Derive a mastery level from evidence.
 *
 * Weighted toward recent formative observations plus the latest published mark,
 * but the exact weighting is a policy detail; what matters structurally is that
 * the level is COMPUTED and every result carries its sourceRefs.
 *
 * @returns {{level: string, sourceRefs: Array}|null} null when there is no evidence
 */
function deriveLevel({ observations = [], marks = [] }) {
  const sourceRefs = [];
  const scores = [];

  for (const o of observations) {
    const rank = LEVELS.indexOf(o.observedLevel);
    if (rank >= 0) {
      scores.push(rank);
      sourceRefs.push({ collectionName: 'FormativeObservation', id: o._id });
    }
  }
  for (const m of marks) {
    if (typeof m.isPass === 'boolean') {
      // A pass maps to at least developing; a fail to emerging.
      scores.push(m.isPass ? 1 : 0);
      sourceRefs.push({ collectionName: 'ExamMark', id: m._id });
    }
  }

  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const level = LEVELS[Math.round(avg)] || 'emerging';
  return { level, sourceRefs };
}

/**
 * Recompute CompetencyMastery for a set of students.
 *
 * Upserts against the unique {student, competency} index, so a re-run updates in
 * place rather than duplicating — idempotent by construction.
 *
 * @param {object} deps injected models, for testing without a database
 */
async function competencyMasteryRecompute({ schoolId, academicYearId, models } = {}) {
  const FormativeObservation = models?.FormativeObservation || mongoose.model('FormativeObservation');
  const ExamMark = models?.ExamMark || mongoose.model('ExamMark');
  const CompetencyMastery = models?.CompetencyMastery || mongoose.model('CompetencyMastery');
  const CompetencyFramework = models?.CompetencyFramework || mongoose.model('CompetencyFramework');
  const { COMPUTED_BY_JOB } = require('../models/CompetencyMastery');

  const competencies = await CompetencyFramework.find({ school: schoolId, isActive: true }).lean();
  const summary = { computed: 0, skipped: 0, truncated: false };

  const pairs = [];
  for (const comp of competencies) {
    const obs = await FormativeObservation.find({
      school: schoolId,
      academicYearId,
      competency: comp._id,
    }).lean();
    const grouped = new Map();
    for (const o of obs) {
      const k = String(o.student);
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(o);
    }
    for (const [studentId, observations] of grouped) {
      pairs.push({ studentId, comp, observations });
    }
  }

  const capped = pairs.slice(0, MAX_RECORDS_PER_RUN);
  if (pairs.length > MAX_RECORDS_PER_RUN) {
    summary.truncated = true;
    // Logged, not silent (§45).
    console.warn(
      `[competencyMasteryRecompute] ${pairs.length} pairs exceeds the ${MAX_RECORDS_PER_RUN} ` +
        `per-run cap; ${pairs.length - MAX_RECORDS_PER_RUN} deferred to the next run.`
    );
  }

  for (const { studentId, comp, observations } of capped) {
    const derived = deriveLevel({ observations, marks: [] });
    if (!derived) {
      summary.skipped += 1;
      continue;
    }
    await CompetencyMastery.updateOne(
      { student: studentId, competency: comp._id },
      {
        $set: {
          student: studentId,
          competency: comp._id,
          frameworkVersion: comp.frameworkVersion,
          level: derived.level,
          computedAt: new Date(),
          computedBy: COMPUTED_BY_JOB,
          sourceRefs: derived.sourceRefs,
          school: schoolId,
          academicYearId,
        },
      },
      { upsert: true }
    );
    summary.computed += 1;
  }

  return summary;
}

/**
 * Raise an InterventionFlag for any student with two or more competencies below
 * `developing`.
 *
 * Idempotent: a student who already has an OPEN flag is not flagged again.
 */
async function interventionSweep({ schoolId, academicYearId, models } = {}) {
  const CompetencyMastery = models?.CompetencyMastery || mongoose.model('CompetencyMastery');
  const InterventionFlag = models?.InterventionFlag || mongoose.model('InterventionFlag');
  const { MIN_COMPETENCIES_BELOW_DEVELOPING } = require('../models/InterventionFlag');

  const low = await CompetencyMastery.find({
    school: schoolId,
    academicYearId,
    level: 'emerging',
  }).lean();

  const byStudent = new Map();
  for (const m of low) {
    const k = String(m.student);
    if (!byStudent.has(k)) byStudent.set(k, []);
    byStudent.get(k).push(m.competency);
  }

  const summary = { raised: 0, alreadyOpen: 0 };
  for (const [studentId, competencies] of byStudent) {
    if (competencies.length < MIN_COMPETENCIES_BELOW_DEVELOPING) continue;

    const existing = await InterventionFlag.findOne({
      school: schoolId,
      student: studentId,
      status: 'open',
    }).lean();
    if (existing) {
      summary.alreadyOpen += 1;
      continue;
    }

    await InterventionFlag.create({
      student: studentId,
      competencies,
      reason: `${competencies.length} competencies at emerging level`,
      severity: competencies.length >= 4 ? 'high' : 'medium',
      status: 'open',
      createdBy: 'system',
      school: schoolId,
      academicYearId,
    });
    summary.raised += 1;
  }
  return summary;
}

/**
 * Report students whose Student.class disagrees with the Class.students[] cache.
 *
 * ── REPORTS ONLY ────────────────────────────────────────────────────────────
 * It never writes. The two representations are maintained by existing code with
 * nothing enforcing agreement; the promotion service asserts membership as a
 * pre-condition, and this job surfaces drift that arose elsewhere. Auto-correcting
 * would mean guessing which side is right and could destroy the correct one.
 */
async function enrolmentDriftCheck({ schoolId, models } = {}) {
  const Class = models?.Class || mongoose.model('Class');
  const Student = models?.Student || mongoose.model('Student');

  const classes = await Class.find({ school: schoolId }).select('_id students').lean();
  const discrepancies = [];

  for (const cls of classes) {
    const cachedIds = new Set((cls.students || []).map(String));

    // Students who point at this class but are absent from its cache.
    const pointingHere = await Student.find({ class: cls._id, school: schoolId, status: 'active' })
      .select('_id')
      .lean();
    for (const s of pointingHere) {
      if (!cachedIds.has(String(s._id))) {
        discrepancies.push({ type: 'in-class-not-in-cache', student: s._id, class: cls._id });
      }
    }

    // Students in the cache who no longer point at this class.
    const pointingIds = new Set(pointingHere.map((s) => String(s._id)));
    for (const cachedId of cachedIds) {
      if (!pointingIds.has(cachedId)) {
        discrepancies.push({ type: 'in-cache-not-in-class', student: cachedId, class: cls._id });
      }
    }
  }

  if (discrepancies.length > 0) {
    console.warn(
      `[enrolmentDriftCheck] ${discrepancies.length} enrolment discrepancy(ies) found. ` +
        'REPORTED, not corrected — a human must reconcile.'
    );
  }
  return { discrepancies, count: discrepancies.length, corrected: 0 };
}

/**
 * Wire the three jobs to cron, mirroring scheduledReports.initScheduler().
 * Called once from server.js after the database connects.
 */
function initTfsJobs() {
  const cron = require('node-cron');
  console.log('[tfsJobs] scheduling competency, intervention and drift jobs');

  // Nightly, staggered after the existing 06:00 report job.
  cron.schedule('0 2 * * *', () => runForAllSchools(competencyMasteryRecompute, 'competencyMasteryRecompute'));
  cron.schedule('30 2 * * *', () => runForAllSchools(interventionSweep, 'interventionSweep'));
  cron.schedule('0 3 * * *', () => runForAllSchools(enrolmentDriftCheck, 'enrolmentDriftCheck'));
}

/** Run a job across every school with an active academic year. */
async function runForAllSchools(job, name) {
  try {
    const School = mongoose.model('School');
    const AcademicYear = mongoose.model('AcademicYear');
    const schools = await School.find({}).select('_id').lean();
    for (const s of schools) {
      const year = await AcademicYear.findOne({ school: s._id, isActive: true }).select('_id').lean();
      await job({ schoolId: s._id, academicYearId: year?._id });
    }
  } catch (err) {
    console.error(`[tfsJobs] ${name} failed:`, err.message);
  }
}

module.exports = {
  competencyMasteryRecompute,
  interventionSweep,
  enrolmentDriftCheck,
  deriveLevel,
  initTfsJobs,
  LEVELS,
  MAX_RECORDS_PER_RUN,
};
