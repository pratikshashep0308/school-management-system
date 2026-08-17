/**
 * BP-030 — calendarService
 * Gate tier: LOCAL UNIT — Holiday/SpecialEvent queries are stubbed, so this runs
 * with no database. The DB-backed path is covered by the integration tier.
 */
const mongoose = require('mongoose');
require('../../models/Holiday');
require('../../models/SpecialEvent');
require('../../models/AcademicYear');
const cal = require('../../services/calendarService');

// Maharashtra State Board: 15 June 2026 .. 30 April 2027.
const YEAR_2026_27 = {
  _id: 'ay1', name: '2026-27',
  startDate: new Date('2026-06-15'), endDate: new Date('2027-04-30'),
};

const SCHOOL = new mongoose.Types.ObjectId();

/** Stub the two model finders the service uses. */
function stub({ holiday = null, event = null, holidays = [], events = [], throws = false,
                year = YEAR_2026_27 }) {
  const H = mongoose.model('Holiday');
  const S = mongoose.model('SpecialEvent');
  const A = mongoose.model('AcademicYear');
  const orig = { hFind: H.findOne, sFind: S.findOne, hAll: H.find, sAll: S.find, aFind: A.findOne };

  const lean = (v) => ({ lean: async () => { if (throws) throw new Error('boom'); return v; } });
  H.findOne = () => lean(holiday);
  S.findOne = () => lean(event);
  H.find = () => lean(holidays);
  S.find = () => lean(events);
  // Coverage is controlled by the caller: pass year:null to simulate a date
  // that falls outside every academic year.
  A.findOne = () => lean(year);

  return () => {
    H.findOne = orig.hFind; S.findOne = orig.sFind;
    H.find = orig.hAll; S.find = orig.sAll; A.findOne = orig.aFind;
  };
}

describe('isNonInstructionalDay', () => {
  test('a persisted holiday blocks, with reason and label', async () => {
    const restore = stub({ holiday: { _id: 'h1', label: 'Diwali' } });
    try {
      const r = await cal.isNonInstructionalDay('2026-11-08', SCHOOL);
      expect(r.blocked).toBe(true);
      expect(r.reason).toBe('holiday');
      expect(r.label).toBe('Diwali');
      expect(r.ref).toBe('h1');
    } finally { restore(); }
  });

  test('a SpecialEvent with instructionSuspended blocks', async () => {
    const restore = stub({ event: { _id: 'e1', label: 'Annual Exam Day' } });
    try {
      const r = await cal.isNonInstructionalDay('2027-03-10', SCHOOL);
      expect(r.blocked).toBe(true);
      expect(r.reason).toBe('special-event');
      expect(r.label).toBe('Annual Exam Day');
    } finally { restore(); }
  });

  test('a SpecialEvent that does NOT suspend instruction does not block', async () => {
    // The service queries with instructionSuspended:true, so a non-suspending
    // event simply never matches — modelled here by the finder returning null.
    const restore = stub({});
    try {
      const r = await cal.isNonInstructionalDay('2027-03-10', SCHOOL); // a Wednesday
      expect(r.blocked).toBe(false);
      expect(r.reason).toBeNull();
    } finally { restore(); }
  });

  test('Sunday still blocks, preserving the pre-existing rule', async () => {
    const restore = stub({});
    try {
      const r = await cal.isNonInstructionalDay('2026-08-16', SCHOOL); // Sunday
      expect(r.blocked).toBe(true);
      expect(r.reason).toBe('sunday');
    } finally { restore(); }
  });

  test('an ordinary weekday does not block', async () => {
    const restore = stub({});
    try {
      const r = await cal.isNonInstructionalDay('2026-08-18', SCHOOL); // Tuesday
      expect(r.blocked).toBe(false);
    } finally { restore(); }
  });

  test('a holiday takes precedence over the Sunday reason', async () => {
    const restore = stub({ holiday: { _id: 'h2', label: 'Independence Day' } });
    try {
      const r = await cal.isNonInstructionalDay('2026-08-16', SCHOOL); // Sunday
      expect(r.reason).toBe('holiday');
    } finally { restore(); }
  });

  test('FAILS CLOSED when the calendar cannot be read', async () => {
    const restore = stub({ throws: true });
    try {
      await expect(cal.isNonInstructionalDay('2026-08-18', SCHOOL)).rejects.toThrow(
        /CALENDAR_UNAVAILABLE/
      );
    } finally { restore(); }
  });

  test('requires a date and a school', async () => {
    await expect(cal.isNonInstructionalDay(null, SCHOOL)).rejects.toThrow(/DATE_REQUIRED/);
    await expect(cal.isNonInstructionalDay('2026-08-18', null)).rejects.toThrow(/SCHOOL_REQUIRED/);
  });

  test('memoises within a context — repeated same-day checks issue one query', async () => {
    const H = mongoose.model('Holiday');
    const S = mongoose.model('SpecialEvent');
    const A = mongoose.model('AcademicYear');
    const origH = H.findOne; const origS = S.findOne; const origA = A.findOne;
    let calls = 0;
    H.findOne = () => { calls += 1; return { lean: async () => null }; };
    S.findOne = () => ({ lean: async () => null });
    A.findOne = () => ({ lean: async () => YEAR_2026_27 });
    try {
      const ctx = cal.createCalendarContext();
      await cal.isNonInstructionalDay('2026-08-18', SCHOOL, ctx);
      await cal.isNonInstructionalDay('2026-08-18', SCHOOL, ctx);
      await cal.isNonInstructionalDay('2026-08-18', SCHOOL, ctx);
      expect(calls).toBe(1);
    } finally { H.findOne = origH; S.findOne = origS; A.findOne = origA; }
  });
});

describe('nonInstructionalDatesInRange', () => {
  test('expands a multi-day holiday range into individual dates', async () => {
    const restore = stub({
      holidays: [{ _id: 'h', label: 'Diwali break', date: new Date('2026-11-08'), endDate: new Date('2026-11-12') }],
    });
    try {
      const set = await cal.nonInstructionalDatesInRange('2026-11-01', '2026-11-30', SCHOOL);
      ['2026-11-08','2026-11-09','2026-11-10','2026-11-11','2026-11-12'].forEach((d) =>
        expect(set.has(d)).toBe(true)
      );
      expect(set.has('2026-11-13')).toBe(false);
    } finally { restore(); }
  });

  test('includes Sundays in the range', async () => {
    const restore = stub({});
    try {
      const set = await cal.nonInstructionalDatesInRange('2026-08-10', '2026-08-23', SCHOOL);
      expect(set.has('2026-08-16')).toBe(true); // Sunday
      expect(set.has('2026-08-23')).toBe(true); // Sunday
      expect(set.has('2026-08-18')).toBe(false);
    } finally { restore(); }
  });

  test('a single-day holiday with null endDate expands to one date', async () => {
    const restore = stub({
      holidays: [{ _id: 'h', label: 'Gandhi Jayanti', date: new Date('2026-10-02'), endDate: null }],
    });
    try {
      const set = await cal.nonInstructionalDatesInRange('2026-10-01', '2026-10-05', SCHOOL);
      expect(set.has('2026-10-02')).toBe(true);
      expect(set.has('2026-10-03')).toBe(false);
    } finally { restore(); }
  });
});

describe('countWorkingDays', () => {
  test('excludes both holidays and Sundays', async () => {
    const restore = stub({
      holidays: [{ _id: 'h', label: 'Break', date: new Date('2026-08-17'), endDate: new Date('2026-08-19') }],
    });
    try {
      // 10-23 Aug 2026 = 14 days, 2 Sundays (16th, 23rd), 3 holiday days (17-19)
      const n = await cal.countWorkingDays('2026-08-10', '2026-08-23', SCHOOL);
      expect(n).toBe(14 - 2 - 3);
    } finally { restore(); }
  });

  test('a fully non-instructional window yields zero, not a negative', async () => {
    const restore = stub({
      holidays: [{ _id: 'h', label: 'Long break', date: new Date('2026-08-10'), endDate: new Date('2026-08-23') }],
    });
    try {
      expect(await cal.countWorkingDays('2026-08-10', '2026-08-23', SCHOOL)).toBe(0);
    } finally { restore(); }
  });
});


describe('outside the academic year (Maharashtra State Board: 15 Jun .. 30 Apr)', () => {
  test('a date in the summer break is blocked as outside-academic-year', async () => {
    // 15 May 2027 — after the year ends on 30 April, before the next opens on
    // 15 June. Not a Sunday. No Holiday record. Belongs to no academic year.
    const restore = stub({ year: null });
    try {
      const r = await cal.isNonInstructionalDay('2027-05-15', SCHOOL);
      expect(r.blocked).toBe(true);
      expect(r.reason).toBe('outside-academic-year');
    } finally { restore(); }
  });

  test('the day after the year ends is blocked', async () => {
    const restore = stub({ year: null });
    try {
      const r = await cal.isNonInstructionalDay('2027-05-01', SCHOOL);
      expect(r.blocked).toBe(true);
      expect(r.reason).toBe('outside-academic-year');
    } finally { restore(); }
  });

  test('the day before the year opens is blocked', async () => {
    const restore = stub({ year: null });
    try {
      const r = await cal.isNonInstructionalDay('2026-06-14', SCHOOL);
      expect(r.blocked).toBe(true);
      expect(r.reason).toBe('outside-academic-year');
    } finally { restore(); }
  });

  test('the first day of the academic year is NOT blocked', async () => {
    const restore = stub({});
    try {
      const r = await cal.isNonInstructionalDay('2026-06-15', SCHOOL); // Monday
      expect(r.blocked).toBe(false);
    } finally { restore(); }
  });

  test('the last day of the academic year is NOT blocked', async () => {
    const restore = stub({});
    try {
      const r = await cal.isNonInstructionalDay('2027-04-30', SCHOOL); // Friday
      expect(r.blocked).toBe(false);
    } finally { restore(); }
  });

  test('outside-academic-year takes precedence over a stray holiday record', async () => {
    const restore = stub({ year: null, holiday: { _id: 'h', label: 'Stray' } });
    try {
      const r = await cal.isNonInstructionalDay('2027-05-15', SCHOOL);
      expect(r.reason).toBe('outside-academic-year');
    } finally { restore(); }
  });
});
