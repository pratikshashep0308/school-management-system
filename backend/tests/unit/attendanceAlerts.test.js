/**
 * BP-031 — checkAndSendAlerts calendar awareness · GAP-CAL-010 · BR-CAL-02
 *
 * The behaviour under test is the one the Specification calls the highest-priority
 * item in the programme: a school closure must not be counted as truancy.
 *
 * Gate tier: LOCAL UNIT — Attendance, Student, Notification and the calendar are
 * all stubbed, so this runs with no database.
 */
const mongoose = require('mongoose');
require('../../models');
require('../../models/Student');

const svc = require('../../services/attendanceService');
const calendarService = require('../../services/calendarService');

const SCHOOL = new mongoose.Types.ObjectId();
const CLASS = new mongoose.Types.ObjectId();
const STUDENT = new mongoose.Types.ObjectId();

const day = (iso) => new Date(`${iso}T00:00:00.000Z`);

function harness({ records, blockedDates = [] }) {
  const { Attendance, Notification } = require('../../models/index');
  const Student = require('../../models/Student');

  const orig = {
    attFind: Attendance.find,
    stuFind: Student.findById,
    notifIns: Notification.insertMany,
    notifFind: Notification.find,
    cal: calendarService.nonInstructionalDatesInRange,
  };
  const created = [];

  // Attendance.find(...).sort().limit().lean()  and  .lean()
  Attendance.find = () => {
    const chain = {
      sort: () => chain,
      limit: () => chain,
      lean: async () => records,
    };
    return chain;
  };
  Student.findById = () => ({
    populate: function () { return this; },
    lean: async () => ({
      _id: STUDENT,
      user: { name: 'Asha' },
      class: { name: '6', section: 'A' },
      parentEmail: 'p@example.com',
    }),
  });
  Notification.insertMany = async (docs) => { created.push(...docs); return docs; };
  // The de-duplication step queries same-day notifications before inserting.
  Notification.find = () => ({ select: () => ({ lean: async () => [] }) });
  calendarService.nonInstructionalDatesInRange = async () => new Set(blockedDates);

  const restore = () => {
    Attendance.find = orig.attFind;
    Student.findById = orig.stuFind;
    Notification.insertMany = orig.notifIns;
    Notification.find = orig.notifFind;
    calendarService.nonInstructionalDatesInRange = orig.cal;
  };
  return { created, restore };
}

const consecutiveAlerts = (created) =>
  created.filter((n) => /Absent for \d+ Days/.test(n.title));
const lowAttendanceAlerts = (created) =>
  created.filter((n) => /Attendance is \d+%/.test(n.title));

describe('GAP-CAL-010 — closures must not read as truancy', () => {
  test('a five-day festival break does NOT raise a consecutive-absence alert', async () => {
    // Absences recorded across a holiday range (a defect from before the fix).
    const records = [
      { date: day('2026-11-12'), status: 'absent' },
      { date: day('2026-11-11'), status: 'absent' },
      { date: day('2026-11-10'), status: 'absent' },
      { date: day('2026-11-09'), status: 'absent' },
      { date: day('2026-11-08'), status: 'absent' },
      { date: day('2026-11-06'), status: 'present' },
    ];
    const blocked = ['2026-11-08','2026-11-09','2026-11-10','2026-11-11','2026-11-12'];
    const { created, restore } = harness({ records, blockedDates: blocked });
    try {
      await svc.checkAndSendAlerts(
        CLASS, day('2026-11-12'), [{ studentId: STUDENT, status: 'present' }], SCHOOL, STUDENT
      );
      expect(consecutiveAlerts(created)).toHaveLength(0);
    } finally { restore(); }
  });

  test('a genuine five-day absence on working days STILL raises the alert', async () => {
    // The fix must not suppress real truancy.
    const records = [
      { date: day('2026-11-20'), status: 'absent' },
      { date: day('2026-11-19'), status: 'absent' },
      { date: day('2026-11-18'), status: 'absent' },
      { date: day('2026-11-17'), status: 'absent' },
      { date: day('2026-11-16'), status: 'absent' },
    ];
    const { created, restore } = harness({ records, blockedDates: [] });
    try {
      await svc.checkAndSendAlerts(
        CLASS, day('2026-11-20'), [{ studentId: STUDENT, status: 'absent' }], SCHOOL, STUDENT
      );
      expect(consecutiveAlerts(created).length).toBeGreaterThan(0);
    } finally { restore(); }
  });

  test('holiday-dated records are excluded from the sub-75% denominator', async () => {
    // 10 present on working days + 8 absent on holiday dates.
    // Unfiltered that is 10/18 = 56% and would fire a critical alert.
    // Filtered it is 10/10 = 100% and must not.
    const records = [];
    for (let i = 1; i <= 10; i += 1) {
      records.push({ date: day(`2026-11-${String(i + 15).padStart(2, '0')}`), status: 'present' });
    }
    const blocked = [];
    for (let i = 1; i <= 8; i += 1) {
      const iso = `2026-11-${String(i).padStart(2, '0')}`;
      records.push({ date: day(iso), status: 'absent' });
      blocked.push(iso);
    }
    const { created, restore } = harness({ records, blockedDates: blocked });
    try {
      await svc.checkAndSendAlerts(
        CLASS, day('2026-11-25'), [{ studentId: STUDENT, status: 'present' }], SCHOOL, STUDENT
      );
      expect(lowAttendanceAlerts(created)).toHaveLength(0);
    } finally { restore(); }
  });

  test("'excused' is removed from the denominator, not counted as absence", async () => {
    // 8 present + 6 excused. Old behaviour: 8/14 = 57% -> critical alert.
    // New behaviour: excused leaves the denominator, giving 8/8, and 8 records
    // is below the 10-record minimum so no alert fires either way.
    const records = [];
    for (let i = 1; i <= 8; i += 1) records.push({ date: day(`2026-11-0${i > 8 ? 8 : i}`), status: 'present' });
    for (let i = 10; i <= 15; i += 1) records.push({ date: day(`2026-11-${i}`), status: 'excused' });
    const { created, restore } = harness({ records, blockedDates: [] });
    try {
      await svc.checkAndSendAlerts(
        CLASS, day('2026-11-20'), [{ studentId: STUDENT, status: 'present' }], SCHOOL, STUDENT
      );
      expect(lowAttendanceAlerts(created)).toHaveLength(0);
    } finally { restore(); }
  });

  test('a genuinely low percentage on working days still alerts', async () => {
    const records = [];
    for (let i = 1; i <= 4; i += 1) records.push({ date: day(`2026-11-0${i}`), status: 'present' });
    for (let i = 5; i <= 16; i += 1) records.push({ date: day(`2026-11-${String(i).padStart(2,'0')}`), status: 'absent' });
    const { created, restore } = harness({ records, blockedDates: [] });
    try {
      await svc.checkAndSendAlerts(
        CLASS, day('2026-11-20'), [{ studentId: STUDENT, status: 'absent' }], SCHOOL, STUDENT
      );
      expect(lowAttendanceAlerts(created).length).toBeGreaterThan(0);
    } finally { restore(); }
  });

  test('an unreadable calendar degrades to unfiltered counting rather than silence', async () => {
    const records = [
      { date: day('2026-11-20'), status: 'absent' },
      { date: day('2026-11-19'), status: 'absent' },
      { date: day('2026-11-18'), status: 'absent' },
    ];
    const { created, restore } = harness({ records, blockedDates: [] });
    const origCal = calendarService.nonInstructionalDatesInRange;
    calendarService.nonInstructionalDatesInRange = async () => { throw new Error('down'); };
    try {
      await svc.checkAndSendAlerts(
        CLASS, day('2026-11-20'), [{ studentId: STUDENT, status: 'absent' }], SCHOOL, STUDENT
      );
      expect(consecutiveAlerts(created).length).toBeGreaterThan(0);
    } finally {
      calendarService.nonInstructionalDatesInRange = origCal;
      restore();
    }
  });
});

describe('deprecated shims retained for one release', () => {
  test('setHolidays is a no-op that warns rather than silently writing', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    svc.setHolidays(SCHOOL, [new Date()]);
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/deprecated no-op/));
    spy.mockRestore();
  });

  test('isHoliday still works and is now async', async () => {
    const orig = calendarService.isNonInstructionalDay;
    calendarService.isNonInstructionalDay = async () => ({ blocked: true, reason: 'holiday' });
    try {
      await expect(svc.isHoliday(new Date(), SCHOOL)).resolves.toBe(true);
    } finally { calendarService.isNonInstructionalDay = orig; }
  });
});
