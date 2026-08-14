// backend/services/timetableService.js
const mongoose = require('mongoose');

// ─── Time helpers ─────────────────────────────────────────────────────────────
function toMinutes(timeStr) {
  if (!timeStr) return 540;
  const clean = String(timeStr).trim();
  const ampm = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const m = parseInt(ampm[2]);
    if (ampm[3].toUpperCase() === 'AM' && h === 12) h = 0;
    if (ampm[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    return h * 60 + m;
  }
  const parts = clean.split(':');
  if (parts.length >= 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  return 540;
}

function toTimeStr(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function timesOverlap(s1, e1, s2, e2) {
  return toMinutes(s1) < toMinutes(e2) && toMinutes(s2) < toMinutes(e1);
}

// ─── CONFLICT DETECTION ───────────────────────────────────────────────────────
exports.detectConflicts = async function(incomingTT, schoolId, excludeId = null) {
  const Timetable = require('../models/Timetable');
  const conflicts = [];

  const query = { school: new mongoose.Types.ObjectId(schoolId), isActive: true };
  if (excludeId) {
    try { query._id = { $ne: new mongoose.Types.ObjectId(excludeId) }; } catch(e) {}
  }
  if (incomingTT.class) {
    try { query.class = { $ne: new mongoose.Types.ObjectId(incomingTT.class) }; } catch(e) {}
  }

  const others = await Timetable.find(query).populate('class','name section').lean();

  // Build teacher → day → slots map from other timetables
  const teacherSlots = {};
  others.forEach(tt => {
    const cname = tt.class ? `${tt.class.name} ${tt.class.section||''}`.trim() : 'Other';
    (tt.schedule||[]).forEach(ds => {
      (ds.periods||[]).forEach(p => {
        if (!p.teacher) return;
        if (['break','lunch','free','assembly'].includes(p.type)) return;
        const tid = p.teacher.toString();
        if (!teacherSlots[tid]) teacherSlots[tid] = {};
        if (!teacherSlots[tid][ds.day]) teacherSlots[tid][ds.day] = [];
        teacherSlots[tid][ds.day].push({ start: p.startTime, end: p.endTime, cname });
      });
    });
  });

  // Validate incoming
  (incomingTT.schedule||[]).forEach(ds => {
    const seen = new Set();
    (ds.periods||[]).forEach(p => {
      if (seen.has(p.periodNumber)) conflicts.push(`Duplicate period ${p.periodNumber} on ${ds.day}`);
      seen.add(p.periodNumber);
      if (!p.teacher) return;
      if (['break','lunch','free','assembly'].includes(p.type)) return;
      const tid = p.teacher.toString();
      (teacherSlots[tid]?.[ds.day]||[]).forEach(s => {
        if (timesOverlap(p.startTime, p.endTime, s.start, s.end)) {
          conflicts.push(`Teacher clash on ${ds.day} P${p.periodNumber}: already in ${s.cname} at ${s.start}–${s.end}`);
        }
      });
    });
  });

  return [...new Set(conflicts)];
};

// ─── AUTO-GENERATION ──────────────────────────────────────────────────────────
exports.autoGenerate = async function(config) {
  const {
    subjects        = [],
    workingDays     = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    periodsPerDay   = 8,
    startTime       = '09:00',
    periodDuration  = 45,
    breakAfterPeriod = 4,
    lunchAfterPeriod = 5,
    breakDuration   = 15,
    lunchDuration   = 30,
  } = config;

  const pdMin   = parseInt(periodDuration)   || 45;
  const bdMin   = parseInt(breakDuration)    || 15;
  const ldMin   = parseInt(lunchDuration)    || 30;
  const bAfter  = parseInt(breakAfterPeriod) || 0;
  const lAfter  = parseInt(lunchAfterPeriod) || 0;
  const pPerDay = parseInt(periodsPerDay)    || 8;
  const startMin = toMinutes(startTime);

  // ── Build time-slot blueprint for one day ─────────────────────────────────
  // We walk through teaching periods 1..pPerDay and insert break/lunch
  // at the right teaching-count boundaries
  const daySlots = []; // { periodNumber, type, startMin, endMin }
  let cursor = startMin;
  let teachingCount = 0;
  let slotNumber = 1;
  let breakInserted = false;
  let lunchInserted = false;

  while (slotNumber <= pPerDay) {
    // Insert break after bAfter teaching periods
    if (bAfter > 0 && !breakInserted && teachingCount === bAfter) {
      daySlots.push({ periodNumber: slotNumber, type: 'break', startMin: cursor, endMin: cursor + bdMin });
      cursor += bdMin;
      slotNumber++;
      breakInserted = true;
      continue;
    }

    // Insert lunch after lAfter teaching periods
    if (lAfter > 0 && !lunchInserted && teachingCount === lAfter) {
      daySlots.push({ periodNumber: slotNumber, type: 'lunch', startMin: cursor, endMin: cursor + ldMin });
      cursor += ldMin;
      slotNumber++;
      lunchInserted = true;
      continue;
    }

    // Normal teaching period
    daySlots.push({ periodNumber: slotNumber, type: 'lecture', startMin: cursor, endMin: cursor + pdMin });
    cursor += pdMin;
    teachingCount++;
    slotNumber++;
  }

  // ── Build subject pool ────────────────────────────────────────────────────
  const teachingSlots = daySlots.filter(s => s.type === 'lecture');
  const totalSlots    = workingDays.length * teachingSlots.length;

  let pool = [];
  subjects.forEach(s => {
    const count = Math.max(1, parseInt(s.periodsPerWeek) || 1);
    for (let i = 0; i < count; i++) {
      pool.push({ subject: s.subjectId, teacher: s.teacherId, color: s.color || '' });
    }
  });

  // Shuffle
  pool = pool.sort(() => Math.random() - 0.5);

  // Pad with free slots
  while (pool.length < totalSlots) pool.push(null);
  pool = pool.slice(0, totalSlots).sort(() => Math.random() - 0.5);

  // ── Build full schedule ───────────────────────────────────────────────────
  const schedule = [];
  let poolIdx = 0;

  workingDays.forEach(day => {
    const periods = [];

    daySlots.forEach(slot => {
      if (slot.type === 'break') {
        periods.push({ periodNumber: slot.periodNumber, type: 'break', startTime: toTimeStr(slot.startMin), endTime: toTimeStr(slot.endMin), room: '' });
        return;
      }
      if (slot.type === 'lunch') {
        periods.push({ periodNumber: slot.periodNumber, type: 'lunch', startTime: toTimeStr(slot.startMin), endTime: toTimeStr(slot.endMin), room: '' });
        return;
      }

      const item = pool[poolIdx++] || null;
      if (item) {
        periods.push({ periodNumber: slot.periodNumber, subject: item.subject, teacher: item.teacher, startTime: toTimeStr(slot.startMin), endTime: toTimeStr(slot.endMin), type: 'lecture', color: item.color, room: '' });
      } else {
        periods.push({ periodNumber: slot.periodNumber, type: 'free', startTime: toTimeStr(slot.startMin), endTime: toTimeStr(slot.endMin), room: '' });
      }
    });

    schedule.push({ day, periods });
  });

  return schedule;
};

// ─── TEACHER VIEW ─────────────────────────────────────────────────────────────
exports.buildTeacherView = async function(teacherId, schoolId) {
  const Timetable = require('../models/Timetable');
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const timetables = await Timetable.find({ school: schoolId, isActive: true })
    .populate('class','name grade section')
    .populate('schedule.periods.subject','name code')
    .lean();

  const view = {};
  DAYS.forEach(d => { view[d] = []; });

  timetables.forEach(tt => {
    const className = tt.class ? `${tt.class.name} ${tt.class.section||''}`.trim() : '';
    (tt.schedule||[]).forEach(ds => {
      (ds.periods||[]).forEach(p => {
        if (['break','lunch','free'].includes(p.type)) return;
        const isMain = p.teacher?.toString() === teacherId.toString();
        const isSub  = p.substitute?.teacher?.toString() === teacherId.toString();
        if (isMain || isSub) {
          view[ds.day].push({ periodNumber: p.periodNumber, subject: p.subject, class: tt.class, className, startTime: p.startTime, endTime: p.endTime, room: p.room, type: p.type, isSubstitute: isSub, color: p.color, timetableId: tt._id, periodId: p._id });
        }
      });
    });
  });

  DAYS.forEach(d => { view[d].sort((a,b) => a.periodNumber - b.periodNumber); });
  return view;
};

exports.toMinutes = toMinutes;
exports.toTimeStr = toTimeStr;