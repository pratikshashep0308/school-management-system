/**
 * FP-035 — historical enrolment
 * Requirements: BR-SIS-04, GAP-SIS-005 · Decisions D-005, D-006
 * FINAL LLD 1.1 §19 · Test tier: B — UNIT, models stubbed, no database.
 *
 * The central assertion is negative: this service must NEVER read
 * Class.students[]. The Class model is stubbed to record any access, and the
 * tests fail if it is touched.
 */
const mongoose = require('mongoose');
require('../../models');
require('../../models/AcademicYear');
require('../../models/PromotionRecord');
const svc = require('../../services/historicalEnrolmentService');

const oid = () => new mongoose.Types.ObjectId();
const SCHOOL = oid(); const STUDENT = oid();
const YEAR_26 = oid(); const YEAR_27 = oid();
const CLASS_6A = oid(); const CLASS_7A = oid();

function stub({ promotionOne = [], promotionMany = [], attendanceOne = null, attendanceIds = [], years = [] } = {}) {
  const PR = mongoose.model('PromotionRecord');
  const AY = mongoose.model('AcademicYear');
  const C = mongoose.model('Class');
  const { Attendance } = require('../../models/index');
  const orig = {
    prOne: PR.findOne, prFind: PR.find, ayFind: AY.find,
    attOne: Attendance.findOne, attDist: Attendance.distinct,
    cFind: C.find, cFindOne: C.findOne, cFindById: C.findById,
  };
  const touched = { class: [] };
  let oneIdx = 0; let manyIdx = 0;

  PR.findOne = () => ({ lean: async () => promotionOne[oneIdx++] ?? null });
  PR.find = () => ({ select: () => ({ lean: async () => promotionMany[manyIdx++] ?? [] }) });
  AY.find = () => ({ sort: () => ({ lean: async () => years }) });
  Attendance.findOne = () => ({ select: () => ({ lean: async () => attendanceOne }) });
  Attendance.distinct = async () => attendanceIds;

  // Any access to the Class model is a D-005 violation.
  ['find', 'findOne', 'findById'].forEach((op) => {
    C[op] = (...args) => {
      touched.class.push({ op, args });
      return { lean: async () => null, select: () => ({ lean: async () => null }) };
    };
  });

  return {
    touched,
    restore: () => {
      PR.findOne = orig.prOne; PR.find = orig.prFind; AY.find = orig.ayFind;
      Attendance.findOne = orig.attOne; Attendance.distinct = orig.attDist;
      C.find = orig.cFind; C.findOne = orig.cFindOne; C.findById = orig.cFindById;
    },
  };
}

const outboundRecord = {
  _id: oid(), student: STUDENT, fromClass: CLASS_6A, toClass: CLASS_7A,
  fromGrade: '6', fromSection: 'A', toGrade: '7', toSection: 'A',
  fromAcademicYear: YEAR_26, toAcademicYear: YEAR_27,
};

describe('D-005 — Class.students[] is never read', () => {
  test('classForYear does not touch the Class model', async () => {
    const s = stub({ promotionOne: [outboundRecord] });
    try {
      await svc.classForYear({ studentId: STUDENT, academicYearId: YEAR_26, schoolId: SCHOOL });
      expect(s.touched.class).toEqual([]);
    } finally { s.restore(); }
  });

  test('rosterForClassYear does not touch the Class model', async () => {
    const s = stub({ promotionMany: [[{ student: STUDENT }]] });
    try {
      await svc.rosterForClassYear({ classId: CLASS_6A, academicYearId: YEAR_26, schoolId: SCHOOL });
      expect(s.touched.class).toEqual([]);
    } finally { s.restore(); }
  });

  test('the fallback path also avoids the Class model', async () => {
    const s = stub({ promotionOne: [null, null], attendanceOne: { class: CLASS_6A } });
    try {
      await svc.classForYear({ studentId: STUDENT, academicYearId: YEAR_26, schoolId: SCHOOL });
      expect(s.touched.class).toEqual([]);
    } finally { s.restore(); }
  });

  test('the forbidden source is named explicitly', () => {
    expect(svc.FORBIDDEN_SOURCES).toContain('Class.students');
  });
});

describe('D-006 — reconstruction from PromotionRecord', () => {
  test('an outbound record gives the class the student sat in that year', async () => {
    const s = stub({ promotionOne: [outboundRecord] });
    try {
      const r = await svc.classForYear({ studentId: STUDENT, academicYearId: YEAR_26, schoolId: SCHOOL });
      // fromClass is where they sat; toClass is where they went.
      expect(String(r.classId)).toBe(String(CLASS_6A));
      expect(r.grade).toBe('6');
      expect(r.section).toBe('A');
      expect(r.provenance).toBe('transition-backed');
      expect(r.evidence.via).toBe('fromAcademicYear');
    } finally { s.restore(); }
  });

  test('an inbound record resolves the most recent year', async () => {
    const s = stub({ promotionOne: [null, outboundRecord] });
    try {
      const r = await svc.classForYear({ studentId: STUDENT, academicYearId: YEAR_27, schoolId: SCHOOL });
      expect(String(r.classId)).toBe(String(CLASS_7A));
      expect(r.grade).toBe('7');
      expect(r.evidence.via).toBe('toAcademicYear');
    } finally { s.restore(); }
  });

  test('outbound takes precedence over inbound for the same year', async () => {
    const s = stub({ promotionOne: [outboundRecord] });
    try {
      const r = await svc.classForYear({ studentId: STUDENT, academicYearId: YEAR_26, schoolId: SCHOOL });
      expect(String(r.classId)).toBe(String(CLASS_6A));
    } finally { s.restore(); }
  });
});

describe('first-year fallback is labelled, not disguised', () => {
  test('with no transition, the result is derived from stamped attendance', async () => {
    const s = stub({ promotionOne: [null, null], attendanceOne: { class: CLASS_6A } });
    try {
      const r = await svc.classForYear({ studentId: STUDENT, academicYearId: YEAR_26, schoolId: SCHOOL });
      expect(String(r.classId)).toBe(String(CLASS_6A));
      // A caller must be able to tell evidence from inference.
      expect(r.provenance).toBe('derived');
      expect(r.evidence.source).toBe('Attendance.academicYearId');
    } finally { s.restore(); }
  });

  test('with no evidence at all, provenance is unknown and classId is null', async () => {
    const s = stub({ promotionOne: [null, null], attendanceOne: null });
    try {
      const r = await svc.classForYear({ studentId: STUDENT, academicYearId: YEAR_26, schoolId: SCHOOL });
      expect(r.classId).toBeNull();
      expect(r.provenance).toBe('unknown');
    } finally { s.restore(); }
  });

  test('a derived result never claims to be transition-backed', async () => {
    const s = stub({ promotionOne: [null, null], attendanceOne: { class: CLASS_6A } });
    try {
      const r = await svc.classForYear({ studentId: STUDENT, academicYearId: YEAR_26, schoolId: SCHOOL });
      expect(r.provenance).not.toBe('transition-backed');
    } finally { s.restore(); }
  });
});

describe('history and roster', () => {
  test('history returns one entry per year with evidence, newest first', async () => {
    const s = stub({
      years: [
        { _id: YEAR_27, name: '2027-28', startDate: new Date('2027-06-15'), endDate: new Date('2028-04-30') },
        { _id: YEAR_26, name: '2026-27', startDate: new Date('2026-06-15'), endDate: new Date('2027-04-30') },
      ],
      promotionOne: [null, outboundRecord, outboundRecord],
    });
    try {
      const h = await svc.historyForStudent({ studentId: STUDENT, schoolId: SCHOOL });
      expect(h.length).toBeGreaterThan(0);
      expect(h[0].academicYear.name).toBe('2027-28');
      h.forEach((e) => expect(e.provenance).not.toBe('unknown'));
    } finally { s.restore(); }
  });

  test('years with no evidence are omitted rather than reported as empty', async () => {
    const s = stub({
      years: [{ _id: YEAR_26, name: '2026-27', startDate: new Date(), endDate: new Date() }],
      promotionOne: [null, null], attendanceOne: null,
    });
    try {
      expect(await svc.historyForStudent({ studentId: STUDENT, schoolId: SCHOOL })).toEqual([]);
    } finally { s.restore(); }
  });

  test('roster resolves from transition records', async () => {
    const a = oid(); const b = oid();
    const s = stub({ promotionMany: [[{ student: a }, { student: b }]] });
    try {
      const r = await svc.rosterForClassYear({ classId: CLASS_6A, academicYearId: YEAR_26, schoolId: SCHOOL });
      expect(r.count).toBe(2);
      expect(r.provenance).toBe('transition-backed');
    } finally { s.restore(); }
  });

  test('roster falls back to distinct stamped attendance', async () => {
    const s = stub({ promotionMany: [[], []], attendanceIds: [oid(), oid(), oid()] });
    try {
      const r = await svc.rosterForClassYear({ classId: CLASS_6A, academicYearId: YEAR_26, schoolId: SCHOOL });
      expect(r.count).toBe(3);
      expect(r.provenance).toBe('derived');
    } finally { s.restore(); }
  });
});

describe('required inputs', () => {
  test.each([
    ['classForYear', { academicYearId: YEAR_26, schoolId: SCHOOL }, /STUDENT_REQUIRED/],
    ['classForYear', { studentId: STUDENT, schoolId: SCHOOL }, /YEAR_REQUIRED/],
    ['classForYear', { studentId: STUDENT, academicYearId: YEAR_26 }, /SCHOOL_REQUIRED/],
    ['rosterForClassYear', { academicYearId: YEAR_26, schoolId: SCHOOL }, /CLASS_REQUIRED/],
  ])('%s rejects missing input', async (fn, args, re) => {
    await expect(svc[fn](args)).rejects.toThrow(re);
  });
});
