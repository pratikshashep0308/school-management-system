/**
 * FP-050 / FP-051 — academic calendar API and timetable term validation
 * Requirements: GAP-CAL-002..009, GAP-MTP-002 · FINAL LLD 1.1 §17, §20
 * Test tier: B — UNIT, stubbed models and calendarService.
 */
const mongoose = require('mongoose');
require('../../models');
require('../../models/AcademicYear');
require('../../models/Holiday');
const calCtrl = require('../../controllers/academicCalendarController');
const termValidation = require('../../services/timetableTermValidation');
const calendarService = require('../../services/calendarService');

const oid = () => new mongoose.Types.ObjectId();
function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
const req = (over = {}) => ({ user: { _id: oid(), role: 'schoolAdmin', school: oid() }, body: {}, params: {}, query: {}, ...over });

describe('FP-050 — createYear validation', () => {
  test('requires name, startDate and endDate', async () => {
    const res = mockRes();
    await calCtrl.createYear(req({ body: { name: '2027-28' } }), res);
    expect(res.statusCode).toBe(400);
  });

  test('rejects a start date on or after the end date', async () => {
    const res = mockRes();
    await calCtrl.createYear(req({
      body: { name: 'x', startDate: '2028-04-30', endDate: '2027-06-15' },
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/before/);
  });
});

describe('FP-050 — createHoliday validation', () => {
  test('requires label, date and academicYearId', async () => {
    const res = mockRes();
    await calCtrl.createHoliday(req({ body: { label: 'Diwali' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('FP-050 — dayStatus delegates to calendarService', () => {
  test('returns the service verdict for a date', async () => {
    const orig = calendarService.isNonInstructionalDay;
    calendarService.isNonInstructionalDay = async () => ({ nonInstructional: true, reason: 'Sunday' });
    try {
      const res = mockRes();
      await calCtrl.dayStatus(req({ query: { date: '2026-06-21' } }), res);
      expect(res.body.nonInstructional).toBe(true);
      expect(res.body.reason).toBe('Sunday');
    } finally { calendarService.isNonInstructionalDay = orig; }
  });

  test('requires a date', async () => {
    const res = mockRes();
    await calCtrl.dayStatus(req({ query: {} }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('FP-051 — timetable term validation', () => {
  const YEAR = { _id: oid(), name: '2026-27', status: 'active',
    startDate: new Date('2026-06-15'), endDate: new Date('2027-04-30') };

  function stubYear(year) {
    const AY = mongoose.model('AcademicYear');
    const orig = AY.findOne;
    AY.findOne = () => ({ lean: async () => year });
    return () => { AY.findOne = orig; };
  }

  test('isWithinYear respects the Maharashtra boundary', () => {
    expect(termValidation.isWithinYear(new Date('2026-08-15'), YEAR)).toBe(true);
    // 1 May – 14 Jun belongs to no year (DEP-02).
    expect(termValidation.isWithinYear(new Date('2027-05-10'), YEAR)).toBe(false);
    expect(termValidation.isWithinYear(new Date('2026-06-01'), YEAR)).toBe(false);
  });

  test('a date outside the year is rejected with a clear code', async () => {
    const restore = stubYear(YEAR);
    try {
      const r = await termValidation.validatePlanDate({
        date: new Date('2027-05-10'), academicYearId: YEAR._id, schoolId: oid(),
      });
      expect(r.valid).toBe(false);
      expect(r.code).toBe('TIMETABLE_DATE_OUTSIDE_YEAR');
      expect(r.message).toMatch(/1 May . 14 Jun/);
    } finally { restore(); }
  });

  test('a non-instructional date is rejected via the shared calendar helper', async () => {
    const restore = stubYear(YEAR);
    const origCal = calendarService.isNonInstructionalDay;
    calendarService.isNonInstructionalDay = async () => ({ nonInstructional: true, reason: 'Republic Day' });
    try {
      const r = await termValidation.validatePlanDate({
        date: new Date('2027-01-26'), academicYearId: YEAR._id, schoolId: oid(),
      });
      expect(r.valid).toBe(false);
      expect(r.code).toBe('TIMETABLE_DATE_NON_INSTRUCTIONAL');
      expect(r.message).toMatch(/Republic Day/);
    } finally { restore(); calendarService.isNonInstructionalDay = origCal; }
  });

  test('an instructional date within the year is valid', async () => {
    const restore = stubYear(YEAR);
    const origCal = calendarService.isNonInstructionalDay;
    calendarService.isNonInstructionalDay = async () => ({ nonInstructional: false });
    try {
      const r = await termValidation.validatePlanDate({
        date: new Date('2026-08-20'), academicYearId: YEAR._id, schoolId: oid(),
      });
      expect(r.valid).toBe(true);
    } finally { restore(); calendarService.isNonInstructionalDay = origCal; }
  });

  test('a timetable cannot attach to a CLOSED year', async () => {
    const restore = stubYear({ ...YEAR, status: 'closed' });
    try {
      const r = await termValidation.validateTimetableYear({ academicYearId: YEAR._id, schoolId: oid() });
      expect(r.valid).toBe(false);
      expect(r.code).toBe('TIMETABLE_YEAR_CLOSED');
    } finally { restore(); }
  });

  test('required inputs are enforced', async () => {
    await expect(termValidation.validatePlanDate({ academicYearId: oid(), schoolId: oid() }))
      .rejects.toThrow(/DATE_REQUIRED/);
  });
});
