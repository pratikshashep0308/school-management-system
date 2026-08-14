// backend/controllers/timetableController.js
const mongoose = require('mongoose');
const Timetable = require('../models/Timetable');
const Student   = require('../models/Student');
const Teacher   = require('../models/Teacher');
const { Notification } = require('../models/index');
const { detectConflicts, autoGenerate, buildTeacherView } = require('../services/timetableService');

const POPULATE_PERIODS = [
  { path: 'schedule.periods.subject',             select: 'name code' },
  { path: 'schedule.periods.teacher',             populate: { path: 'user', select: 'name email' } },
  { path: 'schedule.periods.substitute.teacher',  populate: { path: 'user', select: 'name email' } },
  { path: 'class',                                select: 'name grade section' },
  { path: 'createdBy',                            select: 'name' },
];

// ── Helper: push notification via existing Notification model ────────────────
async function pushNotification(schoolId, userId, { title, message, audience, targetClass }) {
  try {
    await Notification.create({
      title, message, audience: audience || 'all',
      targetClass: targetClass || undefined,
      sentBy: userId, school: schoolId,
      type: 'announcement', priority: 'normal',
    });
  } catch { /* non-fatal */ }
}

// ── Helper: emit socket event if io is available ──────────────────────────────
function emitTimetableUpdate(req, data) {
  try {
    const io = req.app.get('io');
    if (io) io.to(`school_${req.user.school}`).emit('timetable:updated', data);
  } catch { /* non-fatal */ }
}

// ── GET /api/timetable — list timetables (with optional filters) ──────────────
exports.getTimetables = async (req, res) => {
  const { classId, version, isActive, academicYear } = req.query;
  const filter = { school: req.user.school };

  if (classId)      filter.class       = classId;
  if (version)      filter.version     = version;
  if (academicYear) filter.academicYear = academicYear;
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  // Role-based scope
  if (req.user.role === 'teacher') {
    // Teachers get all class timetables (to see where they teach)
    filter.isActive = true;
  }
  if (req.user.role === 'student' || req.user.role === 'parent') {
    filter.isActive = true;
  }

  const timetables = await Timetable.find(filter)
    .populate(POPULATE_PERIODS)
    .sort({ createdAt: -1 });

  res.json({ success: true, count: timetables.length, data: timetables });
};

// ── GET /api/timetable/:id — single timetable ─────────────────────────────────
exports.getTimetable = async (req, res) => {
  const tt = await Timetable.findOne({ _id: req.params.id, school: req.user.school })
    .populate(POPULATE_PERIODS);
  if (!tt) return res.status(404).json({ success: false, message: 'Timetable not found' });
  res.json({ success: true, data: tt });
};

// ── GET /api/timetable/class/:classId — active timetable for a class ─────────
exports.getClassTimetable = async (req, res) => {
  const tt = await Timetable.findOne({
    class: req.params.classId,
    school: req.user.school,
    isActive: true,
  }).populate(POPULATE_PERIODS);

  if (!tt) return res.status(404).json({ success: false, message: 'No active timetable for this class' });
  res.json({ success: true, data: tt });
};

// ── GET /api/timetable/teacher/:teacherId — teacher's personal timetable view ─
exports.getTeacherTimetable = async (req, res) => {
  // Ensure teachers can only see their own (unless admin)
  const tid = req.params.teacherId;
  if (req.user.role === 'teacher') {
    const myTeacher = await Teacher.findOne({ user: req.user._id, school: req.user.school });
    if (!myTeacher || myTeacher._id.toString() !== tid) {
      return res.status(403).json({ success: false, message: 'You can only view your own timetable' });
    }
  }

  const view = await buildTeacherView(tid, req.user.school);
  res.json({ success: true, data: view });
};

// ── GET /api/timetable/student/:studentId — student's class timetable ─────────
exports.getStudentTimetable = async (req, res) => {
  // Students/parents can only see their own child's timetable
  if (req.user.role === 'student') {
    const myStudent = await Student.findOne({ user: req.user._id, school: req.user.school });
    if (!myStudent || myStudent._id.toString() !== req.params.studentId) {
      return res.status(403).json({ success: false, message: 'You can only view your own timetable' });
    }
  }
  if (req.user.role === 'parent') {
    const child = await Student.findOne({ parent: req.user._id, school: req.user.school });
    if (!child || child._id.toString() !== req.params.studentId) {
      return res.status(403).json({ success: false, message: "You can only view your child's timetable" });
    }
  }

  const student = await Student.findById(req.params.studentId).select('class');
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
  if (!student.class) return res.status(404).json({ success: false, message: 'Student has no class assigned' });

  const tt = await Timetable.findOne({
    class: student.class,
    school: req.user.school,
    isActive: true,
  }).populate(POPULATE_PERIODS);

  if (!tt) return res.status(404).json({ success: false, message: 'No timetable found for this class' });
  res.json({ success: true, data: tt });
};

// ── GET /api/timetable/versions/:classId — all versions for a class ───────────
exports.getVersions = async (req, res) => {
  const versions = await Timetable.find({ class: req.params.classId, school: req.user.school })
    .select('version label isActive academicYear createdAt createdBy updatedAt isAutoGenerated')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: versions });
};

// ── POST /api/timetable — create new timetable ────────────────────────────────
exports.createTimetable = async (req, res) => {
  const {
    class: classId, version, label, academicYear,
    schedule, generationConfig,
  } = req.body;

  if (!classId) return res.status(400).json({ success: false, message: 'class is required' });
  if (!schedule || !schedule.length) return res.status(400).json({ success: false, message: 'schedule is required' });

  // ── Conflict detection ────────────────────────────────────────────────────
  const conflicts = await detectConflicts({ class: classId, schedule }, req.user.school);
  if (conflicts.length) {
    return res.status(409).json({
      success: false,
      message: 'Timetable conflicts detected',
      conflicts,
    });
  }

  // If this is set as active, deactivate others for same class
  if (req.body.isActive !== false) {
    await Timetable.updateMany(
      { class: classId, school: req.user.school },
      { isActive: false }
    );
  }

  const tt = await Timetable.create({
    class: classId,
    school: req.user.school,
    version:      version || 'v1',
    label:        label   || 'Main Timetable',
    academicYear: academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    schedule,
    generationConfig,
    isActive:  req.body.isActive !== false,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await tt.populate(POPULATE_PERIODS);

  // Notify teachers, students
  await pushNotification(req.user.school, req.user._id, {
    title:       'Timetable Updated',
    message:     `A new timetable "${label || version || 'v1'}" has been published.`,
    audience:    'all',
    targetClass: classId,
  });

  emitTimetableUpdate(req, { classId, action: 'created', timetableId: tt._id });

  res.status(201).json({ success: true, data: tt });
};

// ── PUT /api/timetable/:id — update existing timetable ───────────────────────
exports.updateTimetable = async (req, res) => {
  const tt = await Timetable.findOne({ _id: req.params.id, school: req.user.school });
  if (!tt) return res.status(404).json({ success: false, message: 'Timetable not found' });

  if (req.body.schedule) {
    const conflicts = await detectConflicts(
      { class: tt.class, schedule: req.body.schedule },
      req.user.school,
      req.params.id
    );
    if (conflicts.length) {
      return res.status(409).json({ success: false, message: 'Conflicts detected', conflicts });
    }
  }

  const allowed = ['schedule','version','label','academicYear','isActive','generationConfig'];
  allowed.forEach(k => { if (req.body[k] !== undefined) tt[k] = req.body[k]; });
  tt.updatedBy = req.user._id;
  await tt.save();

  // If activating, deactivate others
  if (req.body.isActive === true) {
    await Timetable.updateMany(
      { class: tt.class, school: req.user.school, _id: { $ne: tt._id } },
      { isActive: false }
    );
  }

  await tt.populate(POPULATE_PERIODS);

  emitTimetableUpdate(req, { classId: tt.class, action: 'updated', timetableId: tt._id });

  res.json({ success: true, data: tt });
};

// ── DELETE /api/timetable/:id ─────────────────────────────────────────────────
exports.deleteTimetable = async (req, res) => {
  const tt = await Timetable.findOne({ _id: req.params.id, school: req.user.school });
  if (!tt) return res.status(404).json({ success: false, message: 'Timetable not found' });
  await tt.deleteOne();
  emitTimetableUpdate(req, { classId: tt.class, action: 'deleted', timetableId: tt._id });
  res.json({ success: true, message: 'Timetable deleted' });
};

// ── PUT /api/timetable/:id/activate — switch active version ──────────────────
exports.activateVersion = async (req, res) => {
  const tt = await Timetable.findOne({ _id: req.params.id, school: req.user.school });
  if (!tt) return res.status(404).json({ success: false, message: 'Timetable not found' });

  await Timetable.updateMany(
    { class: tt.class, school: req.user.school },
    { isActive: false }
  );
  tt.isActive  = true;
  tt.updatedBy = req.user._id;
  await tt.save();

  emitTimetableUpdate(req, { classId: tt.class, action: 'activated', timetableId: tt._id });
  res.json({ success: true, message: `Version "${tt.label}" is now active`, data: tt });
};

// ── POST /api/timetable/:id/substitute — assign substitute teacher ────────────
exports.assignSubstitute = async (req, res) => {
  const { day, periodId, substituteTeacherId, reason, date } = req.body;

  if (!day || !periodId || !substituteTeacherId) {
    return res.status(400).json({ success: false, message: 'day, periodId, substituteTeacherId are required' });
  }

  const tt = await Timetable.findOne({ _id: req.params.id, school: req.user.school });
  if (!tt) return res.status(404).json({ success: false, message: 'Timetable not found' });

  const daySchedule = tt.schedule.find(s => s.day === day);
  if (!daySchedule) return res.status(404).json({ success: false, message: `Day ${day} not found in timetable` });

  const period = daySchedule.periods.id(periodId);
  if (!period) return res.status(404).json({ success: false, message: 'Period not found' });

  // Check substitute teacher is free at this time slot
  const subConflicts = await detectConflicts(
    {
      class: tt.class.toString() + '_sub_check', // dummy class to avoid self-exclusion
      schedule: [{
        day,
        periods: [{
          periodNumber: period.periodNumber,
          teacher:      substituteTeacherId,
          startTime:    period.startTime,
          endTime:      period.endTime,
          type:         'lecture',
        }],
      }],
    },
    req.user.school,
    tt._id.toString()
  );

  if (subConflicts.length) {
    return res.status(409).json({
      success: false,
      message: 'Substitute teacher has a conflict at this time',
      conflicts: subConflicts,
    });
  }

  period.substitute = {
    teacher:    substituteTeacherId,
    reason:     reason || 'Teacher absent',
    date:       date ? new Date(date) : null,
    assignedBy: req.user._id,
    assignedAt: new Date(),
  };

  tt.updatedBy = req.user._id;
  await tt.save();
  await tt.populate(POPULATE_PERIODS);

  emitTimetableUpdate(req, { classId: tt.class, action: 'substitute_assigned', timetableId: tt._id, day, periodId });

  res.json({ success: true, message: 'Substitute assigned', data: tt });
};

// ── DELETE /api/timetable/:id/substitute — remove substitute ─────────────────
exports.removeSubstitute = async (req, res) => {
  const { day, periodId } = req.body;

  const tt = await Timetable.findOne({ _id: req.params.id, school: req.user.school });
  if (!tt) return res.status(404).json({ success: false, message: 'Timetable not found' });

  const daySchedule = tt.schedule.find(s => s.day === day);
  const period = daySchedule?.periods.id(periodId);
  if (!period) return res.status(404).json({ success: false, message: 'Period not found' });

  period.substitute = undefined;
  tt.updatedBy = req.user._id;
  await tt.save();

  res.json({ success: true, message: 'Substitute removed' });
};

// ── POST /api/timetable/auto-generate — auto-generate timetable ──────────────
exports.autoGenerateTimetable = async (req, res) => {
  const {
    classId, subjects, workingDays, periodsPerDay,
    periodDuration, breakAfterPeriod,
    lunchAfterPeriod, breakDuration, lunchDuration,
    version, label, academicYear,
  } = req.body;

  // Normalize startTime — browsers may send "09:00 AM" or "09:00"
  // Convert any AM/PM format to 24-hour HH:MM
  function normalizeTime(t) {
    if (!t) return '09:00';
    t = String(t).trim();
    const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampm) {
      let h = parseInt(ampm[1]);
      const m = ampm[2];
      const period = ampm[3].toUpperCase();
      if (period === 'AM' && h === 12) h = 0;
      if (period === 'PM' && h !== 12) h += 12;
      return `${String(h).padStart(2,'0')}:${m}`;
    }
    // Already HH:MM
    if (/^\d{2}:\d{2}$/.test(t)) return t;
    return '09:00';
  }
  const startTime = normalizeTime(req.body.startTime);

  if (!classId) return res.status(400).json({ success: false, message: 'classId is required' });
  if (!subjects || !subjects.length) return res.status(400).json({ success: false, message: 'subjects array is required' });

  // Validate at least one subject has both subjectId and teacherId
  const validSubjects = subjects.filter(s => s.subjectId && s.teacherId);
  if (!validSubjects.length) {
    return res.status(400).json({
      success: false,
      message: 'Each subject must have a teacher assigned. Please select a teacher for each subject.',
    });
  }

  const schedule = await autoGenerate({
    classId, schoolId: req.user.school, subjects: validSubjects,
    workingDays:      workingDays      || ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    periodsPerDay:    periodsPerDay    || 8,
    startTime,
    periodDuration:   periodDuration   || 45,
    breakAfterPeriod: breakAfterPeriod ?? 4,
    lunchAfterPeriod: lunchAfterPeriod ?? 5,
    breakDuration:    breakDuration    || 15,
    lunchDuration:    lunchDuration    || 30,
  });

  // Conflict check on generated schedule
  const conflicts = await detectConflicts({ class: classId, schedule }, req.user.school);
  // Auto-generation may have conflicts — return them as warnings, not errors
  // Admin can still save with warnings
  if (conflicts.length) {
    return res.json({
      success: true,
      hasConflicts: true,
      conflicts,
      message: 'Schedule generated with conflicts — review before saving',
      data: { schedule },
    });
  }

  // Deactivate existing
  await Timetable.updateMany({ class: classId, school: req.user.school }, { isActive: false });

  const tt = await Timetable.create({
    class:       classId,
    school:      req.user.school,
    version:     version     || 'auto-v1',
    label:       label       || 'Auto Generated',
    academicYear: academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    schedule,
    isActive:        true,
    isAutoGenerated: true,
    generationConfig: {
      periodsPerDay, workingDays, breakAfterPeriod,
      lunchAfterPeriod, breakDuration, lunchDuration, startTime, periodDuration,
    },
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await tt.populate(POPULATE_PERIODS);
  emitTimetableUpdate(req, { classId, action: 'auto_generated', timetableId: tt._id });

  res.status(201).json({ success: true, hasConflicts: false, data: tt });
};

// ── POST /api/timetable/validate — validate without saving ────────────────────
exports.validateTimetable = async (req, res) => {
  const { classId, schedule, excludeId } = req.body;
  if (!classId || !schedule) {
    return res.status(400).json({ success: false, message: 'classId and schedule are required' });
  }

  const conflicts = await detectConflicts({ class: classId, schedule }, req.user.school, excludeId);
  res.json({
    success: true,
    valid:     conflicts.length === 0,
    conflicts,
    message:   conflicts.length ? `${conflicts.length} conflict(s) found` : 'No conflicts — timetable is valid',
  });
};

// ── GET /api/timetable/export/:id — export as PDF or image ───────────────────
exports.exportTimetable = async (req, res) => {
  const { format = 'pdf' } = req.query;
  const tt = await Timetable.findOne({ _id: req.params.id, school: req.user.school })
    .populate('schedule.periods.subject', 'name')
    .populate({ path: 'schedule.periods.teacher', populate: { path: 'user', select: 'name' } })
    .populate('class', 'name grade section')
    .lean();

  if (!tt) return res.status(404).json({ success: false, message: 'Timetable not found' });

  if (format === 'pdf') {
    const PDFDoc = require('pdfkit');
    const DAYS    = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const PERIODS = [1,2,3,4,5,6,7,8];

    const doc = new PDFDoc({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="timetable-${tt.class?.name || 'class'}-${tt.version}.pdf"`);
    doc.pipe(res);

    // Title
    const className = tt.class ? `${tt.class.name} ${tt.class.section || ''}`.trim() : '';
    doc.fontSize(18).font('Helvetica-Bold').text(`Timetable — ${className}`, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`${tt.label} · ${tt.academicYear} · Generated ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
    doc.moveDown(0.8);

    // Build schedule map
    const ttMap = {};
    DAYS.forEach(d => { ttMap[d] = {}; });
    (tt.schedule || []).forEach(ds => {
      (ds.periods || []).forEach(p => { ttMap[ds.day][p.periodNumber] = p; });
    });

    const pageW  = doc.page.width - 60;
    const colW   = Math.floor(pageW / (PERIODS.length + 1));
    const rowH   = 40;
    const startX = 30;
    let   y      = doc.y;

    // Header row
    doc.rect(startX, y, pageW, rowH).fill('#1E3A8A');
    doc.fill('#fff').fontSize(9).font('Helvetica-Bold');
    doc.text('Day', startX + 4, y + 14, { width: colW - 8 });
    PERIODS.forEach((p, i) => {
      doc.text(`Period ${p}`, startX + colW * (i + 1) + 4, y + 14, { width: colW - 8, align: 'center' });
    });
    doc.fill('#000');
    y += rowH;

    // Data rows
    const DAY_COLORS = { Monday:'#D4522A', Tuesday:'#C9A84C', Wednesday:'#4A7C59', Thursday:'#7C6AF5', Friday:'#2D9CDB', Saturday:'#F2994A' };

    DAYS.forEach((day, di) => {
      if (y > doc.page.height - 60) { doc.addPage({ layout: 'landscape' }); y = 30; }
      const bg = di % 2 === 0 ? '#F8FAFC' : '#fff';
      doc.rect(startX, y, pageW, rowH).fill(bg);
      doc.fill(DAY_COLORS[day] || '#374151').fontSize(9).font('Helvetica-Bold');
      doc.text(day.slice(0, 3).toUpperCase(), startX + 4, y + 14, { width: colW - 8 });

      PERIODS.forEach((p, i) => {
        const period = ttMap[day]?.[p];
        const x = startX + colW * (i + 1);
        if (period) {
          if (period.type === 'break') {
            doc.fill('#F97316').fontSize(8).font('Helvetica-Bold');
            doc.text('BREAK', x + 4, y + 16, { width: colW - 8, align: 'center' });
          } else if (period.type === 'lunch') {
            doc.fill('#10B981').fontSize(8).font('Helvetica-Bold');
            doc.text('LUNCH', x + 4, y + 16, { width: colW - 8, align: 'center' });
          } else if (period.type === 'free') {
            doc.fill('#9CA3AF').fontSize(8);
            doc.text('Free', x + 4, y + 16, { width: colW - 8, align: 'center' });
          } else {
            doc.fill('#111827').fontSize(8).font('Helvetica-Bold');
            doc.text(period.subject?.name || '—', x + 4, y + 8, { width: colW - 8, align: 'center', ellipsis: true });
            doc.fill('#6B7280').fontSize(7).font('Helvetica');
            doc.text(period.teacher?.user?.name?.split(' ').pop() || '', x + 4, y + 22, { width: colW - 8, align: 'center' });
            if (period.room) doc.text(`Rm ${period.room}`, x + 4, y + 32, { width: colW - 8, align: 'center' });
          }
        } else {
          doc.fill('#D1D5DB').fontSize(8).text('—', x + 4, y + 16, { width: colW - 8, align: 'center' });
        }
        // Column separator
        doc.moveTo(x, y).lineTo(x, y + rowH).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
      });

      // Row separator
      doc.moveTo(startX, y + rowH).lineTo(startX + pageW, y + rowH).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
      y += rowH;
    });

    doc.end();
    return;
  }

  res.status(400).json({ success: false, message: 'Only pdf format is supported' });
};