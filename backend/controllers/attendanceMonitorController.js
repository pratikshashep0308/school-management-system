// backend/controllers/attendanceMonitorController.js
//
// Attendance MONITORING reports — answers "which classes have taken attendance
// and which have not" for a day, a recent range, and a month. This is new
// reporting built ON TOP of the existing attendance model; it adds no new
// attendance-marking logic and no new collections.
//
// Source of truth for "was attendance taken":
//   An AttendanceSubmission row exists for {scope:'student', class, date} whose
//   status is NOT 'draft' (i.e. submitted | pending_approval | approved). A bare
//   draft, or scattered Attendance rows with no submission, does NOT count as
//   taken — this is exactly the "don't just check records exist" requirement.
//
// Non-working days (Sundays, holidays, special events, out-of-academic-year) are
// excluded using the SAME calendar service the marking flow uses, so a class is
// never flagged "pending" on a day the school was closed.
//
// Everything is school-scoped and reuses existing models and helpers.

const { Attendance, Class, AttendanceSubmission } = require('../models/index');
const Student = require('../models/Student');
const {
  normalizeDate,
  createCalendarContext,
  isNonInstructionalDay,
  nonInstructionalDatesInRange,
} = require('../services/attendanceService');

const TAKEN_STATUSES = ['submitted', 'pending_approval', 'approved'];
const isTaken = (status) => TAKEN_STATUSES.includes(status);

// ── helpers ──────────────────────────────────────────────────────────────────

// All classes for a school, lean, sorted by grade then name then section.
async function getClasses(school) {
  return Class.find({ school })
    .populate('classTeacher', 'name')
    .sort({ grade: 1, name: 1, section: 1 })
    .lean();
}

// Active-student counts per class in one query. Returns a Map classId → count.
// Inactive / alumni students are excluded so "total students" reflects who
// should actually be marked.
async function activeCountsByClass(school) {
  const rows = await Student.aggregate([
    { $match: { school: school, status: 'active' } },
    { $group: { _id: '$class', n: { $sum: 1 } } },
  ]);
  const map = new Map();
  rows.forEach(r => map.set(String(r._id), r.n));
  return map;
}

// Every YYYY-MM-DD working day between two dates (inclusive), excluding Sundays,
// holidays, special events and out-of-year dates — via the shared calendar svc.
async function workingDaysInRange(school, start, end) {
  const blocked = await nonInstructionalDatesInRange(start, end, school); // Set<YYYY-MM-DD>
  const days = [];
  const cur = normalizeDate(start);
  const last = normalizeDate(end);
  while (cur <= last) {
    const iso = cur.toISOString().slice(0, 10);
    if (!blocked.has(iso)) days.push(iso);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

// Load submissions for a set of dates, keyed by `${classId}|${YYYY-MM-DD}`.
// De-duplicates defensively: the unique index should prevent duplicates, but if
// any exist we keep the most-progressed status (approved > pending > submitted).
async function submissionMap(school, dateStart, dateEnd) {
  const subs = await AttendanceSubmission.find({
    school, scope: 'student',
    date: { $gte: normalizeDate(dateStart), $lte: normalizeDate(dateEnd) },
  })
    .populate('submittedBy', 'name role')
    .lean();

  const rank = { draft: 0, submitted: 1, pending_approval: 2, approved: 3 };
  const map = new Map();
  for (const s of subs) {
    if (!s.class) continue;
    const key = `${String(s.class)}|${new Date(s.date).toISOString().slice(0, 10)}`;
    const prev = map.get(key);
    if (!prev || (rank[s.status] ?? 0) > (rank[prev.status] ?? 0)) map.set(key, s);
  }
  return map;
}

// ═══════════════════════════════════════════════════ 1. DAILY STATUS ══════════
// GET /api/attendance/monitor/daily?date=YYYY-MM-DD
// All classes for one date: taken/pending, present/absent counts, who + when.
exports.dailyStatus = async (req, res) => {
  try {
    const school = req.user.school;
    const date = normalizeDate(req.query.date || new Date());
    const iso = date.toISOString().slice(0, 10);

    // If the day is non-instructional, say so plainly — nothing is "pending".
    const nid = await isNonInstructionalDay(date, school).catch(() => ({ blocked: false }));

    const [classes, counts, subs] = await Promise.all([
      getClasses(school),
      activeCountsByClass(school),
      submissionMap(school, date, date),
    ]);

    // Present/absent tallies per class for the date, in one query.
    const tallies = await Attendance.aggregate([
      { $match: { school, date } },
      { $group: { _id: { class: '$class', status: '$status' }, n: { $sum: 1 } } },
    ]);
    const tallyMap = new Map(); // classId → {present, absent, late, excused}
    tallies.forEach(t => {
      const k = String(t._id.class);
      const row = tallyMap.get(k) || { present: 0, absent: 0, late: 0, excused: 0 };
      row[t._id.status] = t.n;
      tallyMap.set(k, row);
    });

    const rows = classes.map(c => {
      const sub = subs.get(`${String(c._id)}|${iso}`);
      const tally = tallyMap.get(String(c._id)) || { present: 0, absent: 0, late: 0, excused: 0 };
      const taken = !!sub && isTaken(sub.status);
      return {
        classId: c._id,
        className: c.name,
        section: c.section || '',
        classTeacher: c.classTeacher?.name || '',
        totalStudents: counts.get(String(c._id)) || 0,
        taken,
        status: sub?.status || 'not_taken',
        present: (tally.present || 0) + (tally.late || 0),
        absent: tally.absent || 0,
        excused: tally.excused || 0,
        markedBy: sub?.submittedBy?.name || '',
        markedAt: sub?.submittedAt || null,
      };
    });

    const takenCount = rows.filter(r => r.taken).length;
    res.json({
      success: true,
      data: {
        date: iso,
        nonInstructional: !!nid.blocked,
        nonInstructionalReason: nid.reason || null,
        summary: {
          totalClasses: rows.length,
          taken: takenCount,
          pending: rows.length - takenCount,
          completionPct: rows.length ? Math.round((takenCount / rows.length) * 1000) / 10 : 0,
        },
        classes: rows,
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ═══════════════════════════════════════════════ 2. RECENT DAYS ═══════════════
// GET /api/attendance/monitor/recent?days=7  OR  ?from=&to=
// Class × date grid of taken/not-taken over a window, plus a completion summary.
exports.recentDays = async (req, res) => {
  try {
    const school = req.user.school;
    let from, to;
    if (req.query.from && req.query.to) {
      from = normalizeDate(req.query.from);
      to   = normalizeDate(req.query.to);
    } else {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 92);
      to = normalizeDate(new Date());
      from = normalizeDate(new Date());
      from.setUTCDate(from.getUTCDate() - (days - 1));
    }

    const [classes, workingDays, subs] = await Promise.all([
      getClasses(school),
      workingDaysInRange(school, from, to),
      submissionMap(school, from, to),
    ]);

    // Newest date first for display.
    const dates = [...workingDays].sort((a, b) => (a < b ? 1 : -1));

    const grid = classes.map(c => {
      const cells = dates.map(iso => {
        const sub = subs.get(`${String(c._id)}|${iso}`);
        return { date: iso, taken: !!sub && isTaken(sub.status), status: sub?.status || 'not_taken' };
      });
      const takenCount = cells.filter(x => x.taken).length;
      return {
        classId: c._id, className: c.name, section: c.section || '',
        classTeacher: c.classTeacher?.name || '',
        cells,
        takenCount, pendingCount: cells.length - takenCount,
      };
    });

    const totalCells = classes.length * dates.length;
    const takenCells = grid.reduce((s, g) => s + g.takenCount, 0);
    res.json({
      success: true,
      data: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        dates,
        classes: grid,
        summary: {
          totalClasses: classes.length,
          workingDays: dates.length,
          totalSlots: totalCells,
          completed: takenCells,
          pending: totalCells - takenCells,
          completionPct: totalCells ? Math.round((takenCells / totalCells) * 1000) / 10 : 0,
        },
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ═══════════════════════════════════════════════ 3. MONTHLY MONITOR ═══════════
// GET /api/attendance/monitor/monthly?month=9&year=2026
// Per class: working days, days taken, days missing (with the missing dates),
// and completion %.
exports.monthly = async (req, res) => {
  try {
    const school = req.user.school;
    const now = new Date();
    const month = Math.min(Math.max(parseInt(req.query.month, 10) || (now.getMonth() + 1), 1), 12);
    const year  = parseInt(req.query.year, 10) || now.getFullYear();

    const from = normalizeDate(new Date(Date.UTC(year, month - 1, 1)));
    const to   = normalizeDate(new Date(Date.UTC(year, month, 0)));   // last day of month

    const [classes, workingDays, subs] = await Promise.all([
      getClasses(school),
      workingDaysInRange(school, from, to),
      submissionMap(school, from, to),
    ]);

    const rows = classes.map(c => {
      const takenDates = new Set();
      workingDays.forEach(iso => {
        const sub = subs.get(`${String(c._id)}|${iso}`);
        if (sub && isTaken(sub.status)) takenDates.add(iso);
      });
      const missing = workingDays.filter(iso => !takenDates.has(iso));
      return {
        classId: c._id, className: c.name, section: c.section || '',
        classTeacher: c.classTeacher?.name || '',
        workingDays: workingDays.length,
        daysTaken: takenDates.size,
        daysMissing: missing.length,
        missingDates: missing,
        completionPct: workingDays.length ? Math.round((takenDates.size / workingDays.length) * 1000) / 10 : 0,
      };
    });

    const totalSlots = classes.length * workingDays.length;
    const takenSlots = rows.reduce((s, r) => s + r.daysTaken, 0);
    res.json({
      success: true,
      data: {
        month, year, workingDays: workingDays.length, workingDayDates: workingDays,
        classes: rows,
        summary: {
          totalClasses: classes.length,
          completionPct: totalSlots ? Math.round((takenSlots / totalSlots) * 1000) / 10 : 0,
          fullyComplete: rows.filter(r => r.daysMissing === 0).length,
          withMissing: rows.filter(r => r.daysMissing > 0).length,
        },
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ═══════════════════════════════════════════ 4. CLASS-WISE HISTORY ════════════
// GET /api/attendance/monitor/class-history?classId=&from=&to=
// One class's taking-history across a range, with each date's status and the
// missing working days called out.
exports.classHistory = async (req, res) => {
  try {
    const school = req.user.school;
    const { classId } = req.query;
    if (!classId) return res.status(400).json({ success: false, message: 'classId is required' });

    let from, to;
    if (req.query.from && req.query.to) {
      from = normalizeDate(req.query.from); to = normalizeDate(req.query.to);
    } else {
      to = normalizeDate(new Date());
      from = normalizeDate(new Date()); from.setUTCDate(from.getUTCDate() - 29);
    }

    const cls = await Class.findOne({ _id: classId, school }).populate('classTeacher', 'name').lean();
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });

    const [workingDays, subs] = await Promise.all([
      workingDaysInRange(school, from, to),
      submissionMap(school, from, to),
    ]);

    const history = workingDays.map(iso => {
      const sub = subs.get(`${String(classId)}|${iso}`);
      return {
        date: iso,
        taken: !!sub && isTaken(sub.status),
        status: sub?.status || 'not_taken',
        markedBy: sub?.submittedBy?.name || '',
        markedAt: sub?.submittedAt || null,
      };
    }).sort((a, b) => (a.date < b.date ? 1 : -1));

    const takenCount = history.filter(h => h.taken).length;
    res.json({
      success: true,
      data: {
        classId: cls._id, className: cls.name, section: cls.section || '',
        classTeacher: cls.classTeacher?.name || '',
        from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10),
        history,
        summary: {
          workingDays: workingDays.length,
          taken: takenCount,
          missing: workingDays.length - takenCount,
          missingDates: history.filter(h => !h.taken).map(h => h.date),
          completionPct: workingDays.length ? Math.round((takenCount / workingDays.length) * 1000) / 10 : 0,
        },
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ═══════════════════════════════════════════════ 5. DASHBOARD CARDS ═══════════
// GET /api/attendance/monitor/dashboard
// The five summary numbers for the clickable cards.
exports.dashboard = async (req, res) => {
  try {
    const school = req.user.school;
    const today = normalizeDate(new Date());
    const iso = today.toISOString().slice(0, 10);

    // This month range for the completion figure.
    const mFrom = normalizeDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
    const mTo   = normalizeDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)));

    const [classes, todaySubs, monthWorkingDays, monthSubs, todayNid] = await Promise.all([
      getClasses(school),
      submissionMap(school, today, today),
      workingDaysInRange(school, mFrom, mTo),
      submissionMap(school, mFrom, mTo),
      isNonInstructionalDay(today, school).catch(() => ({ blocked: false })),
    ]);

    const totalClasses = classes.length;
    const takenToday = classes.filter(c => {
      const s = todaySubs.get(`${String(c._id)}|${iso}`);
      return s && isTaken(s.status);
    }).length;

    // Only count month days up to and including today for a fair completion %.
    const elapsed = monthWorkingDays.filter(d => d <= iso);
    let takenSlots = 0;
    let classesWithMissing = 0;
    classes.forEach(c => {
      let missing = 0;
      elapsed.forEach(d => {
        const s = monthSubs.get(`${String(c._id)}|${d}`);
        if (s && isTaken(s.status)) takenSlots++; else missing++;
      });
      if (missing > 0) classesWithMissing++;
    });
    const monthSlots = totalClasses * elapsed.length;

    res.json({
      success: true,
      data: {
        date: iso,
        nonInstructionalToday: !!todayNid.blocked,
        totalClasses,
        takenToday,
        pendingToday: todayNid.blocked ? 0 : totalClasses - takenToday,
        classesWithMissing,
        monthlyCompletionPct: monthSlots ? Math.round((takenSlots / monthSlots) * 1000) / 10 : 0,
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ═══════════════════════════════════════════════ CSV EXPORT ═══════════════════
// GET /api/attendance/monitor/export?report=daily|recent|monthly&...same params
// Streams a CSV (opens in Excel). PDF export is handled client-side via print.
exports.exportCsv = async (req, res) => {
  try {
    const report = req.query.report || 'daily';
    const send = (filename, header, lines) => {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send([header.join(','), ...lines].join('\n'));
    };
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    // Reuse the report builders above by faking res.json capture.
    const capture = () => {
      let payload = null;
      const fake = { json: (o) => { payload = o; }, status: () => fake };
      return { fake, get: () => payload };
    };

    if (report === 'daily') {
      const c = capture();
      await exports.dailyStatus(req, c.fake);
      const d = c.get()?.data;
      if (!d) return res.status(500).send('No data');
      const lines = d.classes.map(r => [r.className, r.section, r.totalStudents,
        r.taken ? 'Taken' : 'Not Taken', r.present, r.absent, esc(r.markedBy),
        r.markedAt ? new Date(r.markedAt).toLocaleString() : ''].map(esc).join(','));
      return send(`attendance-daily-${d.date}.csv`,
        ['Class', 'Section', 'Total Students', 'Status', 'Present', 'Absent', 'Marked By', 'Marked At'], lines);
    }

    if (report === 'monthly') {
      const c = capture();
      await exports.monthly(req, c.fake);
      const d = c.get()?.data;
      if (!d) return res.status(500).send('No data');
      const lines = d.classes.map(r => [r.className, r.section, r.workingDays, r.daysTaken,
        r.daysMissing, r.completionPct + '%', esc(r.missingDates.join(' '))].map(esc).join(','));
      return send(`attendance-monthly-${d.year}-${d.month}.csv`,
        ['Class', 'Section', 'Working Days', 'Days Taken', 'Days Missing', 'Completion', 'Missing Dates'], lines);
    }

    if (report === 'recent') {
      const c = capture();
      await exports.recentDays(req, c.fake);
      const d = c.get()?.data;
      if (!d) return res.status(500).send('No data');
      const header = ['Class', 'Section', ...d.dates];
      const lines = d.classes.map(g => [g.className, g.section,
        ...g.cells.map(x => x.taken ? 'Taken' : 'Not Taken')].map(esc).join(','));
      return send(`attendance-recent-${d.from}_to_${d.to}.csv`, header, lines);
    }

    return res.status(400).send('Unknown report type');
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
