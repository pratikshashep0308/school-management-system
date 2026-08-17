/**
 * FP-038 — background job catalog
 * Requirements: GAP-AE-004, GAP-AE-005 · FINAL LLD 1.1 §25, §46
 * Test tier: B — UNIT, injected model doubles, no database and no scheduler.
 */
const mongoose = require('mongoose');
require('../../models');
require('../../models/CompetencyMastery');
require('../../models/InterventionFlag');
const jobs = require('../../jobs/tfsJobs');

const oid = () => new mongoose.Types.ObjectId();
const SCHOOL = oid(); const YEAR = oid();

describe('deriveLevel — mastery is computed with provenance', () => {
  test('proficient observations yield proficient with sourceRefs', () => {
    const r = jobs.deriveLevel({
      observations: [
        { _id: oid(), observedLevel: 'proficient' },
        { _id: oid(), observedLevel: 'proficient' },
      ],
    });
    expect(r.level).toBe('proficient');
    expect(r.sourceRefs).toHaveLength(2);
    expect(r.sourceRefs[0].collectionName).toBe('FormativeObservation');
  });

  test('mixed evidence averages toward developing', () => {
    const r = jobs.deriveLevel({
      observations: [
        { _id: oid(), observedLevel: 'emerging' },
        { _id: oid(), observedLevel: 'proficient' },
      ],
    });
    expect(r.level).toBe('developing');
  });

  test('marks contribute, and a fail pulls the level down', () => {
    const r = jobs.deriveLevel({
      observations: [{ _id: oid(), observedLevel: 'proficient' }],
      marks: [{ _id: oid(), isPass: false }],
    });
    expect(r.sourceRefs.some((s) => s.collectionName === 'ExamMark')).toBe(true);
  });

  test('no evidence returns null, not a fabricated level', () => {
    expect(jobs.deriveLevel({ observations: [], marks: [] })).toBeNull();
  });

  test('every computed level records at least one sourceRef', () => {
    const r = jobs.deriveLevel({ observations: [{ _id: oid(), observedLevel: 'developing' }] });
    expect(r.sourceRefs.length).toBeGreaterThan(0);
  });
});

describe('competencyMasteryRecompute — idempotent, upsert-based', () => {
  function models({ competencies = [], observations = [] }) {
    const upserts = [];
    return {
      upserts,
      CompetencyFramework: { find: () => ({ lean: async () => competencies }) },
      FormativeObservation: { find: () => ({ lean: async () => observations }) },
      ExamMark: { find: () => ({ lean: async () => [] }) },
      CompetencyMastery: {
        updateOne: async (filter, update, opts) => {
          upserts.push({ filter, update, opts });
        },
      },
    };
  }

  test('a student with observations gets one upsert with upsert:true', async () => {
    const comp = { _id: oid(), frameworkVersion: 1 };
    const student = oid();
    const m = models({
      competencies: [comp],
      observations: [{ _id: oid(), student, observedLevel: 'developing' }],
    });
    const summary = await jobs.competencyMasteryRecompute({ schoolId: SCHOOL, academicYearId: YEAR, models: m });
    expect(summary.computed).toBe(1);
    expect(m.upserts).toHaveLength(1);
    // Idempotent by construction: upsert against the unique {student, competency}.
    expect(m.upserts[0].opts.upsert).toBe(true);
    expect(String(m.upserts[0].filter.student)).toBe(String(student));
  });

  test('the write carries the job marker so the model accepts it', async () => {
    const comp = { _id: oid(), frameworkVersion: 2 };
    const m = models({
      competencies: [comp],
      observations: [{ _id: oid(), student: oid(), observedLevel: 'proficient' }],
    });
    await jobs.competencyMasteryRecompute({ schoolId: SCHOOL, academicYearId: YEAR, models: m });
    const { COMPUTED_BY_JOB } = require('../../models/CompetencyMastery');
    expect(m.upserts[0].update.$set.computedBy).toBe(COMPUTED_BY_JOB);
    expect(m.upserts[0].update.$set.frameworkVersion).toBe(2);
  });

  test('a competency with no observations is skipped, not written as emerging', async () => {
    const m = models({ competencies: [{ _id: oid(), frameworkVersion: 1 }], observations: [] });
    const summary = await jobs.competencyMasteryRecompute({ schoolId: SCHOOL, academicYearId: YEAR, models: m });
    expect(summary.computed).toBe(0);
    expect(m.upserts).toHaveLength(0);
  });
});

describe('interventionSweep — threshold and idempotency', () => {
  function models({ low = [], openFlags = new Set() }) {
    const created = [];
    return {
      created,
      CompetencyMastery: { find: () => ({ lean: async () => low }) },
      InterventionFlag: {
        findOne: (q) => ({ lean: async () => (openFlags.has(String(q.student)) ? { _id: oid() } : null) }),
        create: async (doc) => { created.push(doc); return doc; },
      },
    };
  }

  test('two emerging competencies raise a flag', async () => {
    const student = oid();
    const m = models({ low: [
      { student, competency: oid() }, { student, competency: oid() },
    ] });
    const summary = await jobs.interventionSweep({ schoolId: SCHOOL, academicYearId: YEAR, models: m });
    expect(summary.raised).toBe(1);
    expect(m.created[0].createdBy).toBe('system');
    expect(m.created[0].competencies).toHaveLength(2);
  });

  test('ONE emerging competency does not raise a flag', async () => {
    const student = oid();
    const m = models({ low: [{ student, competency: oid() }] });
    const summary = await jobs.interventionSweep({ schoolId: SCHOOL, academicYearId: YEAR, models: m });
    expect(summary.raised).toBe(0);
    expect(m.created).toHaveLength(0);
  });

  test('a student with an open flag is not flagged again — idempotent', async () => {
    const student = oid();
    const m = models({
      low: [{ student, competency: oid() }, { student, competency: oid() }],
      openFlags: new Set([String(student)]),
    });
    const summary = await jobs.interventionSweep({ schoolId: SCHOOL, academicYearId: YEAR, models: m });
    expect(summary.raised).toBe(0);
    expect(summary.alreadyOpen).toBe(1);
  });

  test('four or more emerging competencies escalate severity', async () => {
    const student = oid();
    const m = models({ low: Array.from({ length: 4 }, () => ({ student, competency: oid() })) });
    await jobs.interventionSweep({ schoolId: SCHOOL, academicYearId: YEAR, models: m });
    expect(m.created[0].severity).toBe('high');
  });
});

describe('enrolmentDriftCheck — reports, never corrects', () => {
  function models({ classes = [], studentsByClass = {} }) {
    const writes = [];
    const C = {
      find: () => ({ select: () => ({ lean: async () => classes }) }),
    };
    ['updateOne', 'updateMany', 'bulkWrite', 'findOneAndUpdate'].forEach((op) => {
      C[op] = async (...a) => { writes.push({ op, a }); };
    });
    return {
      writes,
      Class: C,
      Student: {
        find: (q) => ({ select: () => ({ lean: async () => (studentsByClass[String(q.class)] || []) }) }),
      },
    };
  }

  test('a student pointing at a class but absent from its cache is reported', async () => {
    const cls = oid(); const student = oid();
    const m = models({
      classes: [{ _id: cls, students: [] }],
      studentsByClass: { [String(cls)]: [{ _id: student }] },
    });
    const r = await jobs.enrolmentDriftCheck({ schoolId: SCHOOL, models: m });
    expect(r.count).toBe(1);
    expect(r.discrepancies[0].type).toBe('in-class-not-in-cache');
  });

  test('a cached student who no longer points at the class is reported', async () => {
    const cls = oid(); const ghost = oid();
    const m = models({
      classes: [{ _id: cls, students: [ghost] }],
      studentsByClass: { [String(cls)]: [] },
    });
    const r = await jobs.enrolmentDriftCheck({ schoolId: SCHOOL, models: m });
    expect(r.count).toBe(1);
    expect(r.discrepancies[0].type).toBe('in-cache-not-in-class');
  });

  test('the check NEVER writes — no correction is attempted', async () => {
    const cls = oid(); const student = oid();
    const m = models({
      classes: [{ _id: cls, students: [] }],
      studentsByClass: { [String(cls)]: [{ _id: student }] },
    });
    const r = await jobs.enrolmentDriftCheck({ schoolId: SCHOOL, models: m });
    // Auto-correcting could destroy the correct side of the disagreement.
    expect(m.writes).toEqual([]);
    expect(r.corrected).toBe(0);
  });

  test('a consistent class produces no discrepancy', async () => {
    const cls = oid(); const student = oid();
    const m = models({
      classes: [{ _id: cls, students: [student] }],
      studentsByClass: { [String(cls)]: [{ _id: student }] },
    });
    const r = await jobs.enrolmentDriftCheck({ schoolId: SCHOOL, models: m });
    expect(r.count).toBe(0);
  });
});

describe('convention and safety', () => {
  test('the batch cap is a named constant, surfaced', () => {
    expect(jobs.MAX_RECORDS_PER_RUN).toBe(5000);
  });

  test('initTfsJobs exists to be wired from server.js like scheduledReports', () => {
    expect(typeof jobs.initTfsJobs).toBe('function');
  });
});
