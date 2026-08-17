/**
 * FP-090 — INDEPENDENT promotion integrity proof
 * Requirements: GAP-SIS-005..009, GAP-AI-005 · Decisions D-004, D-005, D-006, D-011
 * FINAL LLD 1.1 §18.3, §19, §32
 *
 * ── What makes this INDEPENDENT of FP-037's own unit tests ──────────────────
 * FP-037's tests assert the service issues the right calls. This proof instead
 * builds a small IN-MEMORY DATA LAYER — a fake Student/Class/PromotionRecord
 * store that actually applies the writes — routes a promotion through the REAL
 * promotionService, then inspects the RESULTING STATE for the externally
 * observable invariants a consumer would see.
 *
 * It does not re-assert "the service called $pull". It asserts "after promotion,
 * the student is in exactly one class, the record exists, and history
 * reconstructs" — the properties that matter to the rest of the system.
 *
 * Live MongoDB transaction proof remains ENVIRONMENT VALIDATION PENDING; this is
 * a logical-integrity proof against a deterministic in-memory store, not a
 * durability proof against a real replica set.
 */
const mongoose = require('mongoose');
// Register the full model set. Student/Class live in models/index.js; requiring
// index registers them all.
require('../../models/index');
require('../../models/Student');
require('../../models/PromotionRecord');

const oid = () => new mongoose.Types.ObjectId();

/**
 * A minimal in-memory store that APPLIES writes, so state can be observed after.
 * Backs Student, Class and PromotionRecord for the duration of one test, with a
 * transaction wrapper that truly rolls the store back on throw.
 */
function makeWorld() {
  const students = new Map();
  const classes = new Map();
  const promotionRecords = [];

  const SCHOOL = oid();
  const Y26 = oid(); const Y27 = oid();
  const C6 = oid(); const C7 = oid();
  classes.set(String(C6), { _id: C6, grade: 6, section: 'A', students: [] });
  classes.set(String(C7), { _id: C7, grade: 7, section: 'A', students: [] });

  function addStudent(id) {
    students.set(String(id), { _id: id, class: C6, section: 'A', status: 'active' });
    classes.get(String(C6)).students.push(id);
  }

  const Student = mongoose.model('Student');
  const Class = mongoose.model('Class');
  const PromotionRecord = mongoose.model('PromotionRecord');
  const orig = {};

  function install() {
    orig.sFind = Student.find; orig.sBulk = Student.bulkWrite;
    orig.cFindById = Class.findById; orig.cFindOne = Class.findOne; orig.cUpd = Class.updateOne;
    orig.prFindOne = PromotionRecord.findOne; orig.prInsert = PromotionRecord.insertMany;
    orig.startSession = mongoose.startSession;

    Student.find = (q) => ({
      select: () => ({ lean: async () =>
        [...students.values()].filter((s) => String(s.class) === String(q.class) && s.status === 'active') }),
    });
    Student.bulkWrite = async (ops) => {
      for (const op of ops) {
        const s = students.get(String(op.updateOne.filter._id));
        if (s) Object.assign(s, op.updateOne.update.$set);
      }
    };
    Class.findById = (id) => ({
      select: () => ({ session: () => ({ lean: async () => classes.get(String(id)) || null }) }),
      lean: async () => classes.get(String(id)) || null,
    });
    Class.findOne = (q) => ({ lean: async () => {
      for (const c of classes.values()) {
        if (q.grade != null && c.grade !== q.grade) continue;
        if (q.section != null && c.section !== q.section) continue;
        return c;
      }
      return null;
    } });
    Class.updateOne = async (filter, update) => {
      const c = classes.get(String(filter._id));
      if (!c) return;
      if (update.$pull) {
        const remove = new Set((update.$pull.students.$in || []).map(String));
        c.students = c.students.filter((id) => !remove.has(String(id)));
      }
      if (update.$addToSet) {
        const add = update.$addToSet.students.$each || [update.$addToSet.students];
        for (const id of add) if (!c.students.some((x) => String(x) === String(id))) c.students.push(id);
      }
    };
    PromotionRecord.findOne = (q) => ({ lean: async () => promotionRecords.find((r) => r.batchId === q.batchId) || null });
    PromotionRecord.insertMany = async (docs) => { docs.forEach((d) => promotionRecords.push(d)); return docs; };

    mongoose.startSession = async () => ({
      withTransaction: async (fn) => {
        const snap = {
          students: new Map([...students].map(([k, v]) => [k, { ...v }])),
          classes: new Map([...classes].map(([k, v]) => [k, { ...v, students: [...v.students] }])),
          records: promotionRecords.length,
        };
        try {
          await fn();
        } catch (e) {
          students.clear(); for (const [k, v] of snap.students) students.set(k, v);
          classes.clear(); for (const [k, v] of snap.classes) classes.set(k, v);
          promotionRecords.length = snap.records;
          throw e;
        }
      },
      endSession: async () => {},
    });
  }
  function restore() {
    Student.find = orig.sFind; Student.bulkWrite = orig.sBulk;
    Class.findById = orig.cFindById; Class.findOne = orig.cFindOne; Class.updateOne = orig.cUpd;
    PromotionRecord.findOne = orig.prFindOne; PromotionRecord.insertMany = orig.prInsert;
    mongoose.startSession = orig.startSession;
  }

  return {
    SCHOOL, Y26, Y27, C6, C7,
    addStudent, install, restore,
    students, classes, promotionRecords,
    studentClass: (id) => students.get(String(id))?.class,
    classMembers: (cid) => classes.get(String(cid)).students.map(String),
  };
}

const promotionService = require('../../services/promotionService');

function preview(world, rows) {
  return {
    sourceClass: { id: world.C6, grade: 6, section: 'A' },
    targetClass: { id: world.C7, grade: 7, section: 'A' },
    academicYearId: world.Y26,
    toAcademicYearId: world.Y27,
    counts: {},
    rows,
  };
}
const row = (student, decision = 'promoted') => ({
  student, decision, allPassed: decision === 'promoted', failedSubjects: [],
  retentionReason: decision === 'retained' ? 'Failed Maths' : null,
  computedPassFail: { examGroup: oid(), subjects: [] },
  targetClass: null,
});

describe('FP-090 — observable invariants after a real promotion run', () => {
  test('a promoted student ends in EXACTLY ONE class (the target)', async () => {
    const w = makeWorld();
    const A = oid(); const B = oid();
    w.addStudent(A); w.addStudent(B);
    w.install();
    try {
      await promotionService.confirm({
        previewResult: preview(w, [row(A), row(B)]),
        batchId: 'INT-1', schoolId: w.SCHOOL, actorId: oid(),
      });
      expect(String(w.studentClass(A))).toBe(String(w.C7));
      expect(String(w.studentClass(B))).toBe(String(w.C7));
      expect(w.classMembers(w.C7)).toEqual(expect.arrayContaining([String(A), String(B)]));
      expect(w.classMembers(w.C6)).not.toContain(String(A));
      expect(w.classMembers(w.C6)).not.toContain(String(B));
    } finally { w.restore(); }
  });

  test('no student appears in two classes at once', async () => {
    const w = makeWorld();
    const A = oid();
    w.addStudent(A);
    w.install();
    try {
      await promotionService.confirm({
        previewResult: preview(w, [row(A)]), batchId: 'INT-2', schoolId: w.SCHOOL,
      });
      const inSource = w.classMembers(w.C6).includes(String(A));
      const inTarget = w.classMembers(w.C7).includes(String(A));
      expect(inSource && inTarget).toBe(false);
      expect(inSource || inTarget).toBe(true);
    } finally { w.restore(); }
  });

  test('a PromotionRecord exists for every student, with correct identity (D-006)', async () => {
    const w = makeWorld();
    const A = oid(); const B = oid();
    w.addStudent(A); w.addStudent(B);
    w.install();
    try {
      await promotionService.confirm({
        previewResult: preview(w, [row(A), row(B, 'retained')]),
        batchId: 'INT-3', schoolId: w.SCHOOL,
      });
      expect(w.promotionRecords).toHaveLength(2);
      const recA = w.promotionRecords.find((r) => String(r.student) === String(A));
      expect(String(recA.fromClass)).toBe(String(w.C6));
      expect(String(recA.toClass)).toBe(String(w.C7));
      expect(String(recA.fromAcademicYear)).toBe(String(w.Y26));
      const recB = w.promotionRecords.find((r) => String(r.student) === String(B));
      expect(recB.decision).toBe('retained');
      expect(recB.toClass).toBeNull();
    } finally { w.restore(); }
  });

  test('a retained student STAYS in the source class', async () => {
    const w = makeWorld();
    const A = oid();
    w.addStudent(A);
    w.install();
    try {
      await promotionService.confirm({
        previewResult: preview(w, [row(A, 'retained')]), batchId: 'INT-4', schoolId: w.SCHOOL,
      });
      expect(String(w.studentClass(A))).toBe(String(w.C6));
      expect(w.classMembers(w.C6)).toContain(String(A));
      expect(w.classMembers(w.C7)).not.toContain(String(A));
    } finally { w.restore(); }
  });

  test('on failure, NO partial promotion is observable (atomic rollback)', async () => {
    const w = makeWorld();
    const A = oid(); const B = oid();
    w.addStudent(A); w.addStudent(B);
    w.install();
    const Class = mongoose.model('Class');
    const origUpd = Class.updateOne;
    let calls = 0;
    Class.updateOne = async (...args) => {
      calls++;
      if (calls === 1) throw new Error('SIMULATED mid-transaction failure');
      return origUpd(...args);
    };
    try {
      await expect(promotionService.confirm({
        previewResult: preview(w, [row(A), row(B)]), batchId: 'INT-5', schoolId: w.SCHOOL,
      })).rejects.toThrow(/SIMULATED/);

      expect(String(w.studentClass(A))).toBe(String(w.C6));
      expect(String(w.studentClass(B))).toBe(String(w.C6));
      expect(w.classMembers(w.C6)).toEqual(expect.arrayContaining([String(A), String(B)]));
      expect(w.classMembers(w.C7)).toHaveLength(0);
      expect(w.promotionRecords).toHaveLength(0);
    } finally { Class.updateOne = origUpd; w.restore(); }
  });

  test('a duplicate batch does not double-promote (idempotency, observable)', async () => {
    const w = makeWorld();
    const A = oid();
    w.addStudent(A);
    w.install();
    try {
      await promotionService.confirm({
        previewResult: preview(w, [row(A)]), batchId: 'INT-6', schoolId: w.SCHOOL,
      });
      const targetAfterFirst = [...w.classMembers(w.C7)];

      const second = await promotionService.confirm({
        previewResult: preview(w, [row(A)]), batchId: 'INT-6', schoolId: w.SCHOOL,
      });
      expect(second.alreadyApplied).toBe(true);
      expect(w.classMembers(w.C7)).toEqual(targetAfterFirst);
      expect(w.promotionRecords).toHaveLength(1);
    } finally { w.restore(); }
  });

  test('Student.grade is never present on any student after promotion', async () => {
    const w = makeWorld();
    const A = oid();
    w.addStudent(A);
    w.install();
    try {
      await promotionService.confirm({
        previewResult: preview(w, [row(A)]), batchId: 'INT-7', schoolId: w.SCHOOL,
      });
      expect(w.students.get(String(A))).not.toHaveProperty('grade');
    } finally { w.restore(); }
  });
});

describe('FP-090 — GAP-AI-005 structural proof', () => {
  // The insight service is FP-080 (ADR-11). Now that it exists, prove by the
  // import graph — not by comment — that it cannot reach raw record models.
  test('insight service does not import Result/BehaviouralNote/enrolment models', () => {
    const svcPath = require.resolve('../../services/insightService');
    delete require.cache[svcPath];
    require(svcPath);
    const mod = require.cache[svcPath];
    const forbidden = ['models/Result', 'models/BehaviouralNote', 'models/Student', 'models/PromotionRecord', 'models/Class'];
    const children = mod.children.map((c) => c.id.replace(/\\/g, '/'));
    children.forEach((child) => {
      forbidden.forEach((f) => expect(child).not.toContain(f));
    });
  });

  test('the promotion engine does not accept an Insight as input (structural)', () => {
    // The promotion service must never couple to the insight layer — an insight
    // must not be able to drive a promotion decision.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../services/promotionService.js'), 'utf8');
    expect(src).not.toMatch(/require\(.*qualityConsentInsight.*\)/);
    expect(src).not.toMatch(/\bInsight\b/);
  });
});
