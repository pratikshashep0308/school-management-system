/**
 * FP-037 — transactional promotion
 * Requirements: GAP-SIS-005…009 · Decisions D-001, D-002, D-004, D-011
 * FINAL LLD 1.1 §18.3
 *
 * Test tier: B — UNIT with a MOCKED session. These prove the call sequence and
 * the invariants. They do NOT prove MongoDB honoured the transaction — that is
 * ENVIRONMENT VALIDATION PENDING under U-08 and belongs to tier D.
 *
 * Covers the ten mandated data-integrity checks.
 */
const mongoose = require('mongoose');
require('../../models');
require('../../models/Student');
require('../../models/PromotionRecord');
const svc = require('../../services/promotionService');

const oid = () => new mongoose.Types.ObjectId();
const SCHOOL = oid(); const ACTOR = oid();
const SRC = oid(); const TGT = oid();
const Y26 = oid(); const Y27 = oid();
const A = oid(); const B = oid(); const C = oid();

/** Records every write in order, so atomicity and sequencing are inspectable. */
function harness({ sourceMembers = [A, B, C], existingBatch = null, failAt = null } = {}) {
  const Student = mongoose.model('Student');
  const Class = mongoose.model('Class');
  const PR = mongoose.model('PromotionRecord');
  const orig = {
    sBulk: Student.bulkWrite, cUpd: Class.updateOne, cById: Class.findById,
    prIns: PR.insertMany, prOne: PR.findOne,
  };
  const ops = [];
  let committed = false;

  const session = {
    withTransaction: async (fn) => {
      try {
        await fn();
        committed = true;
      } catch (e) {
        // Roll back: discard everything the aborted attempt recorded.
        ops.length = 0;
        committed = false;
        throw e;
      }
    },
    endSession: async () => {},
  };

  PR.findOne = () => ({ lean: async () => existingBatch });
  PR.insertMany = async (docs) => {
    if (failAt === 'promotionRecord') throw new Error('forced failure');
    ops.push({ op: 'PromotionRecord.insertMany', count: docs.length, docs });
    return docs;
  };
  Student.bulkWrite = async (writes) => {
    if (failAt === 'student') throw new Error('forced failure');
    ops.push({ op: 'Student.bulkWrite', count: writes.length, writes });
  };
  Class.findById = () => ({
    select: () => ({ session: () => ({ lean: async () => ({ _id: SRC, students: sourceMembers }) }) }),
  });
  Class.updateOne = async (filter, update) => {
    if (failAt === 'class') throw new Error('forced failure');
    ops.push({ op: 'Class.updateOne', classId: String(filter._id), update });
  };

  return {
    ops, session, isCommitted: () => committed,
    restore: () => {
      Student.bulkWrite = orig.sBulk; Class.updateOne = orig.cUpd;
      Class.findById = orig.cById; PR.insertMany = orig.prIns; PR.findOne = orig.prOne;
    },
  };
}

const row = (student, decision = 'promoted', over = {}) => ({
  student, decision, allPassed: decision === 'promoted', failedSubjects: [],
  retentionReason: decision === 'retained' ? 'Did not pass: Maths' : null,
  computedPassFail: { examGroup: oid(), subjects: [] },
  targetClass: decision === 'promoted' ? TGT : null, ...over,
});

const previewResult = (rows) => ({
  sourceClass: { id: SRC, grade: 6, section: 'A' },
  targetClass: { id: TGT, grade: 7, section: 'A' },
  academicYearId: Y26, toAcademicYearId: Y27,
  counts: {}, rows,
});

const confirm = (h, rows, extra = {}) =>
  svc.confirm({
    previewResult: previewResult(rows), batchId: 'BATCH-1',
    schoolId: SCHOOL, actorId: ACTOR, session: h.session, ...extra,
  });

// ═══════════════ 1. Promotion succeeds atomically ═══════════════
describe('1 — promotion succeeds atomically', () => {
  test('all writes occur inside one transaction and commit together', async () => {
    const h = harness();
    try {
      const r = await confirm(h, [row(A), row(B)]);
      expect(h.isCommitted()).toBe(true);
      expect(r.promoted).toBe(2);
      // One PromotionRecord insert, one Student bulkWrite, two Class updates.
      expect(h.ops.map((o) => o.op)).toEqual([
        'PromotionRecord.insertMany', 'Student.bulkWrite',
        'Class.updateOne', 'Class.updateOne',
      ]);
    } finally { h.restore(); }
  });
});

// ═══════════════ 2. Student.class changes correctly ═══════════════
describe('2 — Student.class changes correctly', () => {
  test('promoted students are re-pointed at the target class', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A), row(B)]);
      const bulk = h.ops.find((o) => o.op === 'Student.bulkWrite');
      bulk.writes.forEach((w) => {
        expect(String(w.updateOne.update.$set.class)).toBe(String(TGT));
      });
    } finally { h.restore(); }
  });

  test('Student.grade is NEVER written — the field does not exist', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A)]);
      const bulk = h.ops.find((o) => o.op === 'Student.bulkWrite');
      bulk.writes.forEach((w) => {
        expect(Object.keys(w.updateOne.update.$set)).not.toContain('grade');
      });
    } finally { h.restore(); }
  });

  test('a retained student is not re-pointed', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A, 'retained')]);
      expect(h.ops.find((o) => o.op === 'Student.bulkWrite')).toBeUndefined();
    } finally { h.restore(); }
  });

  test('a graduated student becomes alumni', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A, 'graduated')]);
      const bulk = h.ops.find((o) => o.op === 'Student.bulkWrite');
      expect(bulk.writes[0].updateOne.update.$set.status).toBe('alumni');
    } finally { h.restore(); }
  });
});

// ═══════════════ 3 & 4. Both Class.students[] arrays maintained ═══════════════
describe('3 & 4 — both Class.students[] arrays are maintained', () => {
  test('source uses ONE $pull and target ONE $addToSet', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A), row(B), row(C)]);
      const updates = h.ops.filter((o) => o.op === 'Class.updateOne');
      // One write per class pair — not one per student, which would produce
      // write conflicts on the same document.
      expect(updates).toHaveLength(2);
      const pull = updates.find((u) => u.classId === String(SRC));
      const add = updates.find((u) => u.classId === String(TGT));
      expect(pull.update.$pull.students.$in).toHaveLength(3);
      expect(add.update.$addToSet.students.$each).toHaveLength(3);
    } finally { h.restore(); }
  });

  test('a retained student leaves neither array', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A), row(B, 'retained')]);
      const pull = h.ops.find((o) => o.op === 'Class.updateOne' && o.classId === String(SRC));
      expect(pull.update.$pull.students.$in.map(String)).toEqual([String(A)]);
    } finally { h.restore(); }
  });

  test('a graduated student leaves the source but joins no target', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A, 'graduated')]);
      const updates = h.ops.filter((o) => o.op === 'Class.updateOne');
      expect(updates).toHaveLength(1);
      expect(updates[0].classId).toBe(String(SRC));
    } finally { h.restore(); }
  });
});

// ═══════════════ 5. PromotionRecord is created ═══════════════
describe('5 — PromotionRecord is created for every decision', () => {
  test('promoted, retained and graduated all produce a record', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A), row(B, 'retained'), row(C, 'graduated')]);
      const ins = h.ops.find((o) => o.op === 'PromotionRecord.insertMany');
      expect(ins.count).toBe(3);
      expect(ins.docs.map((d) => d.decision).sort())
        .toEqual(['graduated', 'promoted', 'retained']);
    } finally { h.restore(); }
  });

  test('a retained record carries its reason', async () => {
    const h = harness();
    try {
      await confirm(h, [row(B, 'retained')]);
      const doc = h.ops[0].docs[0];
      expect(doc.retentionReason).toMatch(/Did not pass/);
      expect(doc.toClass).toBeNull();
    } finally { h.restore(); }
  });

  test('an override records the reason and the flag', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A, 'retained')], {
        overrides: { [String(A)]: { decision: 'promoted', overrideReason: 'Principal approved' } },
      });
      const doc = h.ops[0].docs[0];
      expect(doc.decision).toBe('promoted');
      expect(doc.overridden).toBe(true);
      expect(doc.overrideReason).toBe('Principal approved');
    } finally { h.restore(); }
  });
});

// ═══════════════ 6. History remains reconstructable ═══════════════
describe('6 — history remains reconstructable from PromotionRecord', () => {
  test('each record carries class identity AND both academic years', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A)]);
      const doc = h.ops[0].docs[0];
      // D-006 resolves history from these, never from Class.students[].
      expect(String(doc.fromClass)).toBe(String(SRC));
      expect(String(doc.toClass)).toBe(String(TGT));
      expect(String(doc.fromAcademicYear)).toBe(String(Y26));
      expect(String(doc.toAcademicYear)).toBe(String(Y27));
    } finally { h.restore(); }
  });

  test('computedPassFail is snapshotted so the decision stays explainable', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A)]);
      expect(h.ops[0].docs[0].computedPassFail).toBeDefined();
    } finally { h.restore(); }
  });
});

// ═══════════════ 7. No partial promotion on failure ═══════════════
describe('7 — a failure leaves NO partial promotion', () => {
  test.each(['promotionRecord', 'student', 'class'])(
    'failure at the %s write rolls everything back', async (stage) => {
      const h = harness({ failAt: stage });
      try {
        await expect(confirm(h, [row(A), row(B)])).rejects.toThrow(/forced failure/);
        expect(h.isCommitted()).toBe(false);
        expect(h.ops).toEqual([]);
      } finally { h.restore(); }
    }
  );

  test('neither forbidden intermediate state can persist', async () => {
    // Student.class = target while source still lists them, or target does not.
    const h = harness({ failAt: 'class' });
    try {
      await expect(confirm(h, [row(A)])).rejects.toThrow();
      expect(h.ops.filter((o) => o.op === 'Student.bulkWrite')).toEqual([]);
    } finally { h.restore(); }
  });
});

// ═══════════════ 8. Duplicate promotion cannot corrupt enrolment ═══════════════
describe('8 — duplicate promotion cannot corrupt enrolment', () => {
  test('a re-run of the same batchId is a no-op', async () => {
    const h = harness({ existingBatch: { _id: oid(), batchId: 'BATCH-1' } });
    try {
      const r = await confirm(h, [row(A), row(B)]);
      expect(r.alreadyApplied).toBe(true);
      expect(r.written).toBe(0);
      expect(h.ops).toEqual([]);
    } finally { h.restore(); }
  });

  test('$addToSet makes a repeated target write idempotent by construction', async () => {
    const h = harness();
    try {
      await confirm(h, [row(A)]);
      const add = h.ops.find((o) => o.op === 'Class.updateOne' && o.classId === String(TGT));
      // $push would duplicate; $addToSet cannot.
      expect(add.update.$addToSet).toBeDefined();
      expect(add.update.$push).toBeUndefined();
    } finally { h.restore(); }
  });

  test('a batchId is mandatory', async () => {
    const h = harness();
    try {
      await expect(svc.confirm({
        previewResult: previewResult([row(A)]), schoolId: SCHOOL, session: h.session,
      })).rejects.toThrow(/BATCH_ID_REQUIRED/);
    } finally { h.restore(); }
  });
});

// ═══════════════ 9. Existing next-grade Class is reused ═══════════════
describe('9 — the existing next-grade Class is located, never created', () => {
  test('same grade + 1 and same section is preferred', async () => {
    const Class = mongoose.model('Class');
    const orig = Class.findOne; const created = [];
    const origCreate = Class.create;
    Class.create = async (d) => { created.push(d); };
    Class.findOne = (q) => ({ lean: async () => (q.grade === 7 && q.section === 'A' ? { _id: TGT, grade: 7, section: 'A' } : null) });
    try {
      const t = await svc.locateTargetClass({ sourceClass: { grade: 6, section: 'A' }, schoolId: SCHOOL });
      expect(String(t._id)).toBe(String(TGT));
      // D-002: creating one would violate the unique index or invent a class
      // nobody timetabled.
      expect(created).toEqual([]);
    } finally { Class.findOne = orig; Class.create = origCreate; }
  });

  test('falls back to any section at the next grade before concluding graduation', async () => {
    const Class = mongoose.model('Class');
    const orig = Class.findOne;
    let call = 0;
    Class.findOne = () => ({ lean: async () => (++call === 1 ? null : { _id: TGT, grade: 7, section: 'B' }) });
    try {
      const t = await svc.locateTargetClass({ sourceClass: { grade: 6, section: 'A' }, schoolId: SCHOOL });
      expect(t.section).toBe('B');
    } finally { Class.findOne = orig; }
  });

  test('no next grade returns null — the student has graduated', async () => {
    const Class = mongoose.model('Class');
    const orig = Class.findOne;
    Class.findOne = () => ({ lean: async () => null });
    try {
      expect(await svc.locateTargetClass({ sourceClass: { grade: 12, section: 'A' }, schoolId: SCHOOL }))
        .toBeNull();
    } finally { Class.findOne = orig; }
  });
});

// ═══════════════ 10. Rollover does not clone Class ═══════════════
describe('10 — rollover does not clone Class records', () => {
  test('the rollover service asserts this independently (FP-034)', () => {
    const rollover = require('../../services/rolloverService');
    expect(rollover.FORBIDDEN_WRITES).toContain('Class');
    expect(rollover.FORBIDDEN_WRITES).toContain('Student');
  });
});

// ═══════════════ Additional invariants ═══════════════
describe('drift pre-condition and transaction requirement', () => {
  test('a student absent from the source roster BLOCKS with a named error', async () => {
    // Without this, $pull silently no-ops and the promotion reports success over
    // inconsistent data.
    const h = harness({ sourceMembers: [A] });
    try {
      await expect(confirm(h, [row(A), row(B)]))
        .rejects.toThrow(/PROMOTION_SOURCE_MEMBERSHIP_MISMATCH/);
      expect(h.ops).toEqual([]);
    } finally { h.restore(); }
  });

  test('a retained-only batch does not require source membership', async () => {
    const h = harness({ sourceMembers: [] });
    try {
      await expect(confirm(h, [row(A, 'retained')])).resolves.toBeDefined();
    } finally { h.restore(); }
  });

  test('promotion refuses when the target academic year is missing', async () => {
    const h = harness();
    try {
      await expect(svc.confirm({
        previewResult: { ...previewResult([row(A)]), toAcademicYearId: null },
        batchId: 'B2', schoolId: SCHOOL, session: h.session,
      })).rejects.toThrow(/TARGET_YEAR_MISSING/);
    } finally { h.restore(); }
  });

  test('a missing transaction capability THROWS rather than degrading', async () => {
    // Behavioural, not textual: force startSession() to fail and assert the
    // service refuses rather than falling back to sequential writes, whose
    // failure mode is inconsistent enrolment data that looks correct.
    const orig = mongoose.startSession;
    mongoose.startSession = async () => { throw new Error('Transaction numbers are only allowed on a replica set'); };
    const h = harness();
    try {
      await expect(svc.confirm({
        previewResult: previewResult([row(A)]),
        batchId: 'BATCH-NO-TXN', schoolId: SCHOOL, actorId: ACTOR,
      })).rejects.toThrow(/TRANSACTIONS_UNAVAILABLE/);
      // Nothing was written on the way to failing.
      expect(h.ops).toEqual([]);
    } finally { mongoose.startSession = orig; h.restore(); }
  });

  test('the failure message names the remedy, not just the fault', async () => {
    const orig = mongoose.startSession;
    mongoose.startSession = async () => { throw new Error('not a replica set'); };
    const h = harness();
    try {
      await expect(svc.confirm({
        previewResult: previewResult([row(A)]),
        batchId: 'BATCH-NO-TXN-2', schoolId: SCHOOL,
      })).rejects.toThrow(/single-node replica set is sufficient/);
    } finally { mongoose.startSession = orig; h.restore(); }
  });

  test('the batch cap is a named constant', () => {
    expect(svc.MAX_BATCH_SIZE).toBe(200);
  });
});
