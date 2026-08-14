/**
 * FP-034 — rollover service
 * Requirements: GAP-CAL-005 · Decisions D-002, D-003, D-005
 * FINAL LLD 1.1 §15 · Test tier: B — UNIT, models stubbed, no database.
 */
const mongoose = require('mongoose');
require('../../models/AcademicYear');
require('../../models/Holiday');
// Class is registered by models/index.js, not a standalone file.
require('../../models');
const svc = require('../../services/rolloverService');

const oid = () => new mongoose.Types.ObjectId();
const SCHOOL = oid();
const SOURCE_ID = oid();

const SOURCE_YEAR = {
  _id: SOURCE_ID, name: '2026-27', school: SCHOOL,
  startDate: new Date('2026-06-15'), endDate: new Date('2027-04-30'),
};
const TARGET = {
  name: '2027-28',
  startDate: new Date('2027-06-15'),
  endDate: new Date('2028-04-30'),
};

/** Stub the three models and record every write attempt, including forbidden ones. */
function stub({ holidays = [], existingTarget = null, existingInTarget = null } = {}) {
  const AY = mongoose.model('AcademicYear');
  const H = mongoose.model('Holiday');
  const C = mongoose.model('Class');
  const orig = {
    ayFind: AY.findOne, ayCreate: AY.create,
    hFind: H.find, hFindOne: H.findOne, hCreate: H.create,
    cFind: C.find, cCreate: C.create, cUpd: C.updateOne, cUpdM: C.updateMany,
  };
  const writes = { academicYears: [], holidays: [], forbidden: [] };

  AY.findOne = (q) => ({
    lean: async () => (q && q._id ? SOURCE_YEAR : existingTarget),
  });
  AY.create = async (doc) => {
    writes.academicYears.push(doc);
    return { toObject: () => ({ ...doc, _id: oid() }) };
  };
  H.find = () => ({ lean: async () => holidays });
  H.findOne = () => ({ lean: async () => existingInTarget });
  H.create = async (doc) => { writes.holidays.push(doc); return doc; };

  // Any write to Class is a D-002/D-003 violation. Record rather than throw so
  // the test asserts on evidence.
  ['create', 'updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne'].forEach((op) => {
    C[op] = async (...args) => { writes.forbidden.push({ model: 'Class', op, args }); };
  });

  return {
    writes,
    restore: () => {
      AY.findOne = orig.ayFind; AY.create = orig.ayCreate;
      H.find = orig.hFind; H.findOne = orig.hFindOne; H.create = orig.hCreate;
      C.find = orig.cFind; C.create = orig.cCreate;
      C.updateOne = orig.cUpd; C.updateMany = orig.cUpdM;
    },
  };
}

const holiday = (label, date, over = {}) => ({
  _id: oid(), label, date: new Date(date), endDate: null,
  recurringAnnually: false, type: 'school', ...over,
});

const run = (opts = {}) =>
  svc.rollover({ schoolId: SCHOOL, sourceYearId: SOURCE_ID, targetYear: TARGET, ...opts });

describe('D-003 — rollover carries forward exactly two things', () => {
  test('the new academic year is created as draft, not active', async () => {
    const s = stub();
    try {
      const m = await run();
      expect(s.writes.academicYears).toHaveLength(1);
      // Promotion needs the year to exist before it can point toAcademicYear at
      // it, but it must not become active until it begins.
      expect(s.writes.academicYears[0].status).toBe('draft');
      expect(s.writes.academicYears[0].isActive).toBe(false);
      expect(m.carriedForward.academicYear.name).toBe('2027-28');
    } finally { s.restore(); }
  });

  test('recurring holidays ARE carried forward', async () => {
    const s = stub({ holidays: [
      holiday('Independence Day', '2026-08-15', { recurringAnnually: true }),
      holiday('Republic Day', '2027-01-26', { recurringAnnually: true }),
    ] });
    try {
      const m = await run();
      expect(s.writes.holidays).toHaveLength(2);
      expect(m.carriedForward.holidays.map((h) => h.label).sort())
        .toEqual(['Independence Day', 'Republic Day']);
    } finally { s.restore(); }
  });

  test('non-recurring holidays are NOT carried forward', async () => {
    const s = stub({ holidays: [
      holiday('Diwali break', '2026-11-06', { recurringAnnually: false }),
      holiday('Weather day', '2026-07-20', { recurringAnnually: false }),
      holiday('Republic Day', '2027-01-26', { recurringAnnually: true }),
    ] });
    try {
      const m = await run();
      expect(s.writes.holidays).toHaveLength(1);
      expect(s.writes.holidays[0].label).toBe('Republic Day');
      expect(m.notCarriedForward.nonRecurringHolidays.sort())
        .toEqual(['Diwali break', 'Weather day']);
    } finally { s.restore(); }
  });
});

describe('D-002 — rollover never touches Class or enrolment', () => {
  test('NO write reaches the Class collection', async () => {
    const s = stub({ holidays: [holiday('R', '2026-08-15', { recurringAnnually: true })] });
    try {
      await run();
      // Class is global. Cloning it, or copying students[], is a defect.
      expect(s.writes.forbidden).toEqual([]);
    } finally { s.restore(); }
  });

  test('the manifest states explicitly what was not carried', async () => {
    const s = stub();
    try {
      const m = await run();
      expect(m.notCarriedForward.classes).toMatch(/never cloned/i);
      expect(m.notCarriedForward.classStudents).toMatch(/current-cohort cache/i);
      expect(m.notCarriedForward.enrolments).toMatch(/Promotion re-points/i);
      expect(m.notCarriedForward.specialEvents).toMatch(/never rollover-eligible/i);
    } finally { s.restore(); }
  });

  test('the forbidden-write list names every enrolment-bearing model', () => {
    expect(svc.FORBIDDEN_WRITES).toEqual(
      expect.arrayContaining(['Class', 'Student', 'Attendance', 'Result', 'Timetable'])
    );
  });
});

describe('date shifting across the Maharashtra year boundary', () => {
  test('a June holiday lands in the start calendar year', () => {
    // 2027-28 runs 15 Jun 2027 – 30 Apr 2028.
    expect(svc.targetCalendarYear(new Date('2026-08-15'), { startDate: TARGET.startDate }))
      .toBe(2027);
  });

  test('a January holiday lands in the FOLLOWING calendar year', () => {
    expect(svc.targetCalendarYear(new Date('2027-01-26'), { startDate: TARGET.startDate }))
      .toBe(2028);
  });

  test('Republic Day shifts to the correct side of the boundary', async () => {
    const s = stub({ holidays: [holiday('Republic Day', '2027-01-26', { recurringAnnually: true })] });
    try {
      await run();
      expect(s.writes.holidays[0].date.toISOString().slice(0, 10)).toBe('2028-01-26');
    } finally { s.restore(); }
  });

  test('29 February is clamped in a non-leap year and reported', () => {
    const r = svc.shiftToYear(new Date('2028-02-29'), 2029);
    // Silently becoming 1 March would move a school closure by a day.
    expect(r.clamped).toBe(true);
    expect(r.date.toISOString().slice(0, 10)).toBe('2029-02-28');
  });

  test('29 February is preserved in a leap year', () => {
    const r = svc.shiftToYear(new Date('2028-02-29'), 2032);
    expect(r.clamped).toBe(false);
    expect(r.date.toISOString().slice(0, 10)).toBe('2032-02-29');
  });

  test('a multi-day range keeps its span after shifting', async () => {
    const s = stub({ holidays: [
      holiday('Winter break', '2026-12-24', { recurringAnnually: true, endDate: new Date('2027-01-01') }),
    ] });
    try {
      await run();
      const w = s.writes.holidays[0];
      const span = Math.round((w.endDate - w.date) / 86400000);
      expect(span).toBe(8);
    } finally { s.restore(); }
  });
});

describe('idempotency and safety', () => {
  test('a holiday already present in the target year is skipped', async () => {
    const s = stub({
      holidays: [holiday('Republic Day', '2027-01-26', { recurringAnnually: true })],
      existingInTarget: { _id: oid(), label: 'Republic Day' },
    });
    try {
      const m = await run();
      expect(s.writes.holidays).toHaveLength(0);
      expect(m.skipped.join(' ')).toMatch(/already present/);
    } finally { s.restore(); }
  });

  test('an existing target year is reused, not duplicated', async () => {
    const s = stub({ existingTarget: { _id: oid(), name: '2027-28', status: 'draft' } });
    try {
      const m = await run();
      expect(s.writes.academicYears).toHaveLength(0);
      expect(m.skipped.join(' ')).toMatch(/already exists/);
    } finally { s.restore(); }
  });

  test('dryRun writes nothing but reports what would happen', async () => {
    const s = stub({ holidays: [holiday('R', '2026-08-15', { recurringAnnually: true })] });
    try {
      const m = await run({ dryRun: true });
      expect(s.writes.academicYears).toHaveLength(0);
      expect(s.writes.holidays).toHaveLength(0);
      expect(m.dryRun).toBe(true);
      expect(m.carriedForward.holidays).toHaveLength(1);
    } finally { s.restore(); }
  });

  test('a holiday shifting outside the target year is skipped, not clamped in', async () => {
    const s = stub({ holidays: [holiday('May Day', '2027-05-05', { recurringAnnually: true })] });
    try {
      const m = await run();
      // 2027-28 ends 30 Apr 2028, so a 5 May holiday has no home in it.
      expect(s.writes.holidays).toHaveLength(0);
      expect(m.skipped.join(' ')).toMatch(/outside 2027-28/);
    } finally { s.restore(); }
  });
});

describe('required inputs are never defaulted', () => {
  test('target year dates must be supplied', async () => {
    await expect(svc.rollover({ schoolId: SCHOOL, sourceYearId: SOURCE_ID, targetYear: { name: 'x' } }))
      .rejects.toThrow(/never defaulted/);
  });

  test('school and source year are required', async () => {
    await expect(svc.rollover({ sourceYearId: SOURCE_ID, targetYear: TARGET }))
      .rejects.toThrow(/ROLLOVER_SCHOOL_REQUIRED/);
    await expect(svc.rollover({ schoolId: SCHOOL, targetYear: TARGET }))
      .rejects.toThrow(/ROLLOVER_SOURCE_YEAR_REQUIRED/);
  });

  test('an inverted target range is rejected', async () => {
    const s = stub();
    try {
      await expect(run({ targetYear: { name: 'x', startDate: TARGET.endDate, endDate: TARGET.startDate } }))
        .rejects.toThrow(/ROLLOVER_INVALID_RANGE/);
    } finally { s.restore(); }
  });
});
