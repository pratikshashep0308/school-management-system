// backend/services/timetableService.js
// Core business logic: conflict detection + auto-generation algorithm

const mongoose = require('mongoose');

// ─── Time helpers ─────────────────────────────────────────────────────────────

// Convert "HH:MM" to total minutes since midnight
function toMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Convert minutes back to "HH:MM"
function toTimeStr(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// Check if two time ranges overlap
function timesOverlap(start1, end1, start2, end2) {
  const s1 = toMinutes(start1), e1 = toMinutes(end1);
  const s2 = toMinutes(start2), e2 = toMinutes(end2);
  return s1 < e2 && s2 < e1;
}

// ─── CONFLICT DETECTION ───────────────────────────────────────────────────────
// Called before every save/update. Returns array of conflict descriptions.

/**
 * detectConflicts
 * @param {Object} incomingTT  - the timetable being saved/updated
 * @param {String} schoolId    - school scope
 * @param {String|null} excludeId - id to exclude (own doc when updating)
 * @returns {Array<string>} - list of conflict messages (empty = no conflicts)
 */
exports.detectConflicts = async function(incomingTT, schoolId, excludeId = null) {
  const Timetable = require('../models/Timetable');
  const conflicts = [];

  // All other active timetables in this school (excluding the one being saved)
  const query = { school: schoolId, isActive: true };
  if (excludeId) query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
  // Also exclude same class (same class will be updated, not duplicated)
  if (incomingTT.class) query.class = { $ne: new mongoose.Types.ObjectId(incomingTT.class) };

  const otherTimetables = await Timetable.find(query)
    .populate('class', 'name grade section')
    .lean();

  // Build a lookup of every teacher slot across all other classes:
  // { teacherId: { day: [{ startTime, endTime, className }] } }
  const teacherSlots = {};

  otherTimetables.forEach(tt => {
    const className = tt.class ? `${tt.class.name} ${tt.class.section || ''}`.trim() : 'Unknown';
    (tt.schedule || []).forEach(daySchedule => {
      (daySchedule.periods || []).forEach(period => {
        if (!period.teacher || period.type === 'break' || period.type === 'lunch' || period.type === 'free') return;
        const tid = period.teacher.toString();
        if (!teacherSlots[tid]) teacherSlots[tid] = {};
        if (!teacherSlots[tid][daySchedule.day]) teacherSlots[tid][daySchedule.day] = [];
        teacherSlots[tid][daySchedule.day].push({
          startTime: period.startTime,
          endTime:   period.endTime,
          className,
          periodNumber: period.periodNumber,
        });
      });
    });
  });

  // Now validate each period in the incoming timetable
  (incomingTT.schedule || []).forEach(daySchedule => {
    const day = daySchedule.day;
    const seenPeriods = new Set();

    (daySchedule.periods || []).forEach(period => {
      // ── 1. Duplicate period numbers within same day/class ─────────────────
      if (seenPeriods.has(period.periodNumber)) {
        conflicts.push(`Duplicate period ${period.periodNumber} on ${day}`);
      }
      seenPeriods.add(period.periodNumber);

      if (period.type === 'break' || period.type === 'lunch' || period.type === 'free') return;
      if (!period.teacher) return;

      const tid = period.teacher.toString();

      // ── 2. Teacher clash with another class ───────────────────────────────
      const slots = teacherSlots[tid]?.[day] || [];
      slots.forEach(existing => {
        if (timesOverlap(period.startTime, period.endTime, existing.startTime, existing.endTime)) {
          conflicts.push(
            `Teacher clash on ${day} period ${period.periodNumber} (${period.startTime}–${period.endTime}): ` +
            `teacher already assigned to ${existing.className} at ${existing.startTime}–${existing.endTime}`
          );
        }
      });

      // ── 3. Teacher assigned twice in same timetable on same day ───────────
      const sameDay = (daySchedule.periods || []).filter(
        p => p !== period &&
          p.teacher?.toString() === tid &&
          p.type !== 'break' && p.type !== 'lunch' && p.type !== 'free'
      );
      sameDay.forEach(other => {
        if (timesOverlap(period.startTime, period.endTime, other.startTime, other.endTime)) {
          conflicts.push(
            `Teacher assigned twice within this timetable on ${day}: periods ${period.periodNumber} and ${other.periodNumber} overlap`
          );
        }
      });
    });
  });

  return [...new Set(conflicts)]; // deduplicate
};

// ─── AUTO-GENERATION ──────────────────────────────────────────────────────────

/**
 * autoGenerate
 * Creates a complete weekly timetable for a class given config.
 *
 * @param {Object} config
 *   - classId: ObjectId
 *   - schoolId: ObjectId
 *   - subjects: [{ subjectId, teacherId, periodsPerWeek, color }]
 *   - workingDays: ['Monday',...] (default Mon–Sat)
 *   - periodsPerDay: 8
 *   - startTime: '09:00'
 *   - periodDuration: 45 (minutes)
 *   - breakAfterPeriod: 4   (insert break slot here)
 *   - lunchAfterPeriod: 5
 *   - breakDuration: 15
 *   - lunchDuration: 30
 *
 * @returns {Array<DaySchedule>} - the schedule array to store on the Timetable doc
 */
exports.autoGenerate = async function(config) {
  const {
    subjects       = [],
    workingDays    = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    periodsPerDay  = 8,
    startTime      = '09:00',
    periodDuration = 45,
    breakAfterPeriod = 4,
    lunchAfterPeriod = 5,
    breakDuration  = 15,
    lunchDuration  = 30,
    schoolId,
  } = config;

  // Build a pool of subject-period slots to distribute
  // Each entry: { subjectId, teacherId, color }
  let pool = [];
  subjects.forEach(s => {
    const times = Math.max(1, parseInt(s.periodsPerWeek) || 1);
    for (let i = 0; i < times; i++) {
      pool.push({ subject: s.subjectId, teacher: s.teacherId, color: s.color || '' });
    }
  });

  // Shuffle pool for variety
  pool = pool.sort(() => Math.random() - 0.5);

  // Calculate time slots for each period number accounting for breaks
  function getSlotTime(periodNumber) {
    let minutes = toMinutes(startTime);

    for (let p = 1; p < periodNumber; p++) {
      minutes += periodDuration;
      if (p === breakAfterPeriod) minutes += parseInt(breakDuration) || 15;
      if (p === lunchAfterPeriod) minutes += parseInt(lunchDuration) || 30;
    }

    return {
      startTime: toTimeStr(minutes),
      endTime:   toTimeStr(minutes + periodDuration),
    };
  }

  // Number of actual teaching periods (exclude break + lunch slots)
  const teachingSlots = periodsPerDay - (breakAfterPeriod ? 1 : 0) - (lunchAfterPeriod ? 1 : 0);
  const totalSlots    = workingDays.length * teachingSlots;

  // Fill up pool to totalSlots with null (free periods) if not enough subjects
  while (pool.length < totalSlots) pool.push(null);
  pool = pool.slice(0, totalSlots).sort(() => Math.random() - 0.5);

  const schedule = [];
  let poolIdx = 0;

  workingDays.forEach(day => {
    const periods = [];
    let realPeriod = 0; // teaching period counter (excludes break/lunch)

    for (let periodNumber = 1; periodNumber <= periodsPerDay; periodNumber++) {
      const times = getSlotTime(periodNumber);

      // Break slot
      if (periodNumber === breakAfterPeriod + 1 && breakAfterPeriod) {
        // Actually we insert break as a period type
        // Recompute: break is inserted AFTER breakAfterPeriod teaching periods
      }

      // Check if this period number is a break or lunch
      // We mark certain period numbers as special
      const isBreak = breakAfterPeriod && periodNumber === breakAfterPeriod + 1;
      const isLunch = lunchAfterPeriod && periodNumber === lunchAfterPeriod + 1 + (breakAfterPeriod ? 1 : 0);

      if (isBreak) {
        const bStart = toTimeStr(toMinutes(times.startTime) - parseInt(breakDuration));
        periods.push({
          periodNumber,
          type: 'break',
          startTime: bStart,
          endTime: times.startTime,
          room: '',
        });
        continue;
      }

      if (isLunch) {
        const lStart = toTimeStr(toMinutes(times.startTime) - parseInt(lunchDuration));
        periods.push({
          periodNumber,
          type: 'lunch',
          startTime: lStart,
          endTime: times.startTime,
          room: '',
        });
        continue;
      }

      realPeriod++;
      const slot = pool[poolIdx++] || null;

      if (slot) {
        periods.push({
          periodNumber,
          subject:    slot.subject,
          teacher:    slot.teacher,
          startTime:  times.startTime,
          endTime:    times.endTime,
          type:       'lecture',
          color:      slot.color,
          room:       '',
        });
      } else {
        periods.push({
          periodNumber,
          type:      'free',
          startTime: times.startTime,
          endTime:   times.endTime,
          room:      '',
        });
      }
    }

    schedule.push({ day, periods });
  });

  return schedule;
};

// ─── TEACHER TIMETABLE VIEW ───────────────────────────────────────────────────
// Extract all slots for a specific teacher across all class timetables

exports.buildTeacherView = async function(teacherId, schoolId) {
  const Timetable = require('../models/Timetable');

  const timetables = await Timetable.find({ school: schoolId, isActive: true })
    .populate('class', 'name grade section')
    .populate('schedule.periods.subject', 'name code')
    .lean();

  const view = {}; // { day: [{ period, subject, class, startTime, endTime, room, isSubstitute }] }

  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  DAYS.forEach(d => { view[d] = []; });

  timetables.forEach(tt => {
    const className = tt.class ? `${tt.class.name} ${tt.class.section || ''}`.trim() : '';
    (tt.schedule || []).forEach(daySchedule => {
      (daySchedule.periods || []).forEach(period => {
        if (period.type === 'break' || period.type === 'lunch' || period.type === 'free') return;

        // Main teacher
        const isMainTeacher = period.teacher?.toString() === teacherId.toString();
        // Or active substitute
        const isSubstitute  = period.substitute?.teacher?.toString() === teacherId.toString();

        if (isMainTeacher || isSubstitute) {
          view[daySchedule.day].push({
            periodNumber: period.periodNumber,
            subject:      period.subject,
            class:        tt.class,
            className,
            startTime:    period.startTime,
            endTime:      period.endTime,
            room:         period.room,
            type:         period.type,
            isSubstitute,
            color:        period.color,
            timetableId:  tt._id,
            periodId:     period._id,
          });
        }
      });
    });
  });

  // Sort each day by period number
  DAYS.forEach(d => {
    view[d].sort((a, b) => a.periodNumber - b.periodNumber);
  });

  return view;
};

exports.toMinutes = toMinutes;
exports.toTimeStr = toTimeStr;