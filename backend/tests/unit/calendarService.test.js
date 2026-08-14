/**
 * BP-030 — calendarService
 * Gate tier: LOCAL UNIT — Holiday/SpecialEvent queries are stubbed, so this runs
 * with no database. The DB-backed path is covered by the integration tier.
 */
const mongoose = require('mongoose');
require('../../models/Holiday');
require('../../models/SpecialEvent');
const cal = require('../../services/calendarService');

const SCHOOL = new mongoose.Types.ObjectId();

/** Stub the two model finders the service uses. */
function stub({ holiday = null, event = null, holidays = [], events = [], throws = false }) {
  const H = mongoose.model('Holiday');
  const S = mongoose.model('SpecialEvent');
  const orig = { hFind: H.findOne, sFind: S.findOne, hAll: H.find, sAll: S.find };

  const lean = (v) => ({ lean: async () => { if (throws) throw new Error('boom'); return v; } });
  H.findOne = () => lean(holiday);
  S.findOne = () => lean(event);
  H.find = () => lean(holidays);
  S.find = () => lean(events);

  return () => {
    H.findOne = orig.hFind; S.findOne = orig.sFind;
    H.find = orig.hAll; S.find = orig.sAll;
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
      const r = await cal.isNonInstructionalDay('2026-03-10', SCHOOL);
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
      const r = await cal.isNonInstructionalDay('2026-03-11', SCHOOL); // a Wednesday
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
    const origH = H.findOne; const origS = S.findOne;
    let calls = 0;
    H.findOne = () => { calls += 1; return { lean: async () => null }; };
    S.findOne = () => ({ lean: async () => null });
    try {
      const ctx = cal.createCalendarContext();
      await cal.isNonInstructionalDay('2026-08-18', SCHOOL, ctx);
      await cal.isNonInstructionalDay('2026-08-18', SCHOOL, ctx);
      await cal.isNonInstructionalDay('2026-08-18', SCHOOL, ctx);
      expect(calls).toBe(1);
    } finally { H.findOne = origH; S.findOne = origS; }
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
