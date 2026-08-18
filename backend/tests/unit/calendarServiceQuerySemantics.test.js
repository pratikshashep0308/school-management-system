/**
 * Staging findings #1 (SEVERE) and #2 — calendarService query & timezone semantics.
 *
 * These reproduce the two live-environment bugs that the original unit tests
 * missed because they stubbed findOne to return a FIXED result without ever
 * evaluating the query against stored data.
 *
 * Here the stubbed Holiday.findOne / .find ACTUALLY EVALUATE the service's
 * spanQuery against a small in-memory holiday store, implementing the same
 * $lte/$gte/$or/$and semantics MongoDB uses — so a wrong query is caught exactly
 * as it was on staging.
 */
const mongoose = require('mongoose');
require('../../models/Holiday');
require('../../models/SpecialEvent');
require('../../models/AcademicYear');
const cal = require('../../services/calendarService');

const SCHOOL = new mongoose.Types.ObjectId();
const YEAR = { _id: 'ay1', name: '2026-27', startDate: new Date('2026-06-15'), endDate: new Date('2027-04-30') };

// ── A faithful (tiny) Mongo-style matcher for the operators the service uses ──
function matchesField(value, cond) {
  if (cond === null) return value === null || value === undefined;
  if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
    return Object.entries(cond).every(([op, operand]) => {
      const v = value instanceof Date ? value.getTime() : value;
      const o = operand instanceof Date ? operand.getTime() : operand;
      if (op === '$lte') return v != null && v <= o;
      if (op === '$gte') return v != null && v >= o;
      if (op === '$lt') return v != null && v < o;
      if (op === '$gt') return v != null && v > o;
      return false;
    });
  }
  return value === cond;
}
function matchesDoc(doc, query) {
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return cond.some((sub) => matchesDoc(doc, sub));
    if (key === '$and') return cond.every((sub) => matchesDoc(doc, sub));
    if (key === 'school') return true; // school scoping not under test here
    if (key === 'instructionSuspended') return doc[key] === cond;
    return matchesField(doc[key], cond);
  });
}

/** Stub Holiday/SpecialEvent/AcademicYear to evaluate queries against a store. */
function stubStore(holidays) {
  const H = mongoose.model('Holiday');
  const S = mongoose.model('SpecialEvent');
  const A = mongoose.model('AcademicYear');
  const orig = { hFind: H.findOne, hAll: H.find, sFind: S.findOne, sAll: S.find, aFind: A.findOne };

  H.findOne = (q) => ({ lean: async () => holidays.find((h) => matchesDoc(h, q)) || null });
  H.find = (q) => ({ lean: async () => holidays.filter((h) => matchesDoc(h, q)) });
  S.findOne = () => ({ lean: async () => null });
  S.find = () => ({ lean: async () => [] });
  A.findOne = () => ({ lean: async () => YEAR });

  return () => {
    H.findOne = orig.hFind; H.find = orig.hAll;
    S.findOne = orig.sFind; S.find = orig.sAll; A.findOne = orig.aFind;
  };
}

describe('Finding #1 — a single-day holiday must not block later days', () => {
  // One single-day holiday on 18 Aug 2026 (endDate null).
  const holidays = [{ _id: 'h1', label: 'Test Holiday', date: new Date('2026-08-18'), endDate: null }];

  test('the holiday date itself is blocked', async () => {
    const restore = stubStore(holidays);
    try {
      const r = await cal.isNonInstructionalDay('2026-08-18', SCHOOL, cal.createCalendarContext());
      expect(r.blocked).toBe(true);
      expect(r.reason).toBe('holiday');
    } finally { restore(); }
  });

  test('the NEXT day is NOT blocked (this was the severe staging bug)', async () => {
    const restore = stubStore(holidays);
    try {
      const r = await cal.isNonInstructionalDay('2026-08-19', SCHOOL, cal.createCalendarContext());
      expect(r.blocked).toBe(false);
    } finally { restore(); }
  });

  test('a day two weeks later is NOT blocked', async () => {
    const restore = stubStore(holidays);
    try {
      const r = await cal.isNonInstructionalDay('2026-09-01', SCHOOL, cal.createCalendarContext());
      expect(r.blocked).toBe(false);
    } finally { restore(); }
  });

  test('a multi-day holiday still blocks every day within its span', async () => {
    const restore = stubStore([{ _id: 'h2', label: 'Diwali week', date: new Date('2026-11-08'), endDate: new Date('2026-11-12') }]);
    try {
      const ctx = cal.createCalendarContext();
      expect((await cal.isNonInstructionalDay('2026-11-08', SCHOOL, ctx)).blocked).toBe(true);
      expect((await cal.isNonInstructionalDay('2026-11-10', SCHOOL, ctx)).blocked).toBe(true);
      expect((await cal.isNonInstructionalDay('2026-11-12', SCHOOL, ctx)).blocked).toBe(true);
      expect((await cal.isNonInstructionalDay('2026-11-13', SCHOOL, ctx)).blocked).toBe(false);
    } finally { restore(); }
  });
});
