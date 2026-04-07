// backend/controllers/attendanceController.js
const mongoose  = require('mongoose');
const { Attendance, Class, Notification } = require('../models/index');
const Student   = require('../models/Student');
const {
  getStudentAnalytics,
  getClassAnalytics,
  checkAndSendAlerts,
  generateQRToken,
  verifyQRToken,
  isHoliday,
  getWorkingDays,
  normalizeDate,
  buildExcelReport,
  buildPDFReport,
} = require('../services/attendanceService');

// ── Helper: socket emit ───────────────────────────────────────────────────────
function emitAttendance(req, data) {
  try {
    const io = req.app.get('io');
    if (io) io.to(`school_${req.user.school}`).emit('attendance:updated', data);
  } catch { /* non-fatal */ }
}

// ── POST /api/attendance — bulk mark attendance ───────────────────────────────
exports.markAttendance = async (req, res) => {
  const { classId, date, attendanceData } = req.body;

  if (!classId || !date || !attendanceData?.length) {
    return res.status(400).json({ success: false, message: 'classId, date, and attendanceData are required' });
  }

  const normalizedDate = normalizeDate(date);

  // Block marking on Sundays / holidays
  if (isHoliday(normalizedDate, req.user.school)) {
    return res.status(400).json({ success: false, message: 'Cannot mark attendance on a holiday or Sunday' });
  }

  // Bulk upsert — fast for large classes
  const ops = attendanceData.map(item => ({
    updateOne: {
      filter: { student: item.studentId, date: normalizedDate, school: req.user.school },
      update: {
        $set: {
          student:   item.studentId,
          class:     classId,
          date:      normalizedDate,
          status:    item.status || 'absent',
          remarks:   item.remarks || '',
          markedBy:  req.user._id,
          school:    req.user.school,
          markedAt:  new Date(),
        },
      },
      upsert: true,
    },
  }));

  await Attendance.bulkWrite(ops);

  const present  = attendanceData.filter(a => a.status === 'present').length;
  const absent   = attendanceData.filter(a => a.status === 'absent').length;
  const late     = attendanceData.filter(a => a.status === 'late').length;
  const excused  = attendanceData.filter(a => a.status === 'excused').length;

  // Fire-and-forget: send alerts (low attendance, consecutive absences, daily absent)
  checkAndSendAlerts(classId, normalizedDate, attendanceData, req.user.school, req.user._id)
    .catch(err => console.error('Alert error:', err.message));

  // Real-time socket update
  emitAttendance(req, { classId, date: normalizedDate, summary: { present, absent, late, excused, total: attendanceData.length } });

  res.status(200).json({
    success: true,
    count:   attendanceData.length,
    summary: { present, absent, late, excused, total: attendanceData.length },
    message: 'Attendance saved',
  });
};

// ── GET /api/attendance/class — class attendance for a date ───────────────────
exports.getClassAttendance = async (req, res) => {
  const { classId, date } = req.query;
  if (!classId || !date) return res.status(400).json({ success: false, message: 'classId and date are required' });

  const normalizedDate = normalizeDate(date);
  const isHol = isHoliday(normalizedDate, req.user.school);

  const [students, records] = await Promise.all([
    Student.find({ class: classId, isActive: true, school: req.user.school })
      .populate('user', 'name profileImage')
      .sort({ rollNumber: 1 })
      .lean(),
    Attendance.find({ class: classId, date: normalizedDate, school: req.user.school })
      .populate('markedBy', 'name')
      .lean(),
  ]);

  const recordMap = {};
  records.forEach(r => { recordMap[r.student.toString()] = r; });

  const merged = students.map(s => ({
    student:    s,
    attendance: recordMap[s._id.toString()] || null,
    status:     recordMap[s._id.toString()]?.status || 'unmarked',
    remarks:    recordMap[s._id.toString()]?.remarks || '',
  }));

  const present  = records.filter(r => r.status === 'present').length;
  const absent   = records.filter(r => r.status === 'absent').length;
  const late     = records.filter(r => r.status === 'late').length;
  const excused  = records.filter(r => r.status === 'excused').length;
  const unmarked = students.length - records.length;
  const isMarked = records.length > 0;

  res.json({
    success: true,
    isHoliday: isHol,
    isMarked,
    data:    merged,
    summary: { total: students.length, present, absent, late, excused, unmarked },
  });
};

// ── GET /api/attendance/student/:studentId — student analytics ────────────────
exports.getStudentAttendance = async (req, res) => {
  const { studentId } = req.params;
  const { month, year, months } = req.query;

  const analytics = await getStudentAnalytics(studentId, req.user.school, { month, year, months });

  res.json({ success: true, ...analytics });
};

// ── GET /api/attendance/monthly-report — class monthly report ─────────────────
exports.getMonthlyReport = async (req, res) => {
  const { classId, month, year } = req.query;
  if (!classId || !month || !year) {
    return res.status(400).json({ success: false, message: 'classId, month, year required' });
  }

  const analytics = await getClassAnalytics(classId, req.user.school, month, year);
  res.json({ success: true, data: analytics.breakdown, meta: analytics.summary });
};

// ── GET /api/attendance/analytics — full class analytics ──────────────────────
exports.getClassAnalyticsApi = async (req, res) => {
  const { classId, month, year } = req.query;
  if (!classId || !month || !year) {
    return res.status(400).json({ success: false, message: 'classId, month, year required' });
  }

  const analytics = await getClassAnalytics(classId, req.user.school, month, year);
  res.json({ success: true, data: analytics });
};

// ── GET /api/attendance/overview — school-wide today ─────────────────────────
exports.getOverview = async (req, res) => {
  const today = normalizeDate(new Date());

  const [todayRecords, totalStudents] = await Promise.all([
    Attendance.find({ school: req.user.school, date: today }).lean(),
    Student.countDocuments({ school: req.user.school, isActive: true }),
  ]);

  const present  = todayRecords.filter(r => r.status === 'present').length;
  const absent   = todayRecords.filter(r => r.status === 'absent').length;
  const late     = todayRecords.filter(r => r.status === 'late').length;
  const marked   = todayRecords.length;
  const unmarked = Math.max(0, totalStudents - marked);
  const percentage = marked > 0 ? Math.round((present / marked) * 100) : 0;

  // Per-class summary
  const classSummary = {};
  todayRecords.forEach(r => {
    const cid = r.class?.toString();
    if (!cid) return;
    if (!classSummary[cid]) classSummary[cid] = { present: 0, absent: 0, late: 0, total: 0 };
    classSummary[cid][r.status] = (classSummary[cid][r.status] || 0) + 1;
    classSummary[cid].total++;
  });

  res.json({
    success: true,
    data: { date: today, totalStudents, marked, unmarked, present, absent, late, percentage, classSummary, isHoliday: isHoliday(today, req.user.school) },
  });
};

// ── GET /api/attendance/low-attendance — students below threshold ──────────────
exports.getLowAttendance = async (req, res) => {
  const { threshold = 75, classId, month, year } = req.query;
  const m = month || (new Date().getMonth() + 1);
  const y = year  || new Date().getFullYear();

  const analytics = classId
    ? await getClassAnalytics(classId, req.user.school, m, y)
    : null;

  let low = [];
  if (analytics) {
    low = analytics.lowStudents;
  } else {
    // School-wide: query each class
    const classes = await Class.find({ school: req.user.school }).lean();
    for (const cls of classes) {
      const a = await getClassAnalytics(cls._id, req.user.school, m, y);
      low = low.concat(a.lowStudents.map(s => ({ ...s, className: `${cls.name} ${cls.section || ''}` })));
    }
    low.sort((a, b) => a.percentage - b.percentage);
  }

  res.json({ success: true, count: low.length, threshold: parseInt(threshold), data: low });
};

// ── PUT /api/attendance/:id — edit single record ──────────────────────────────
exports.updateAttendance = async (req, res) => {
  const { status, remarks } = req.body;
  const record = await Attendance.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $set: { status, remarks, markedBy: req.user._id, markedAt: new Date() } },
    { new: true }
  );
  if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

  emitAttendance(req, { recordId: record._id, status, classId: record.class });
  res.json({ success: true, data: record });
};

// ── GET /api/attendance/stats — daily trend for chart ────────────────────────
exports.getStats = async (req, res) => {
  const { classId, days = 30 } = req.query;
  const since = new Date();
  since.setDate(since.getDate() - parseInt(days));

  const match = { school: new mongoose.Types.ObjectId(req.user.school), date: { $gte: since } };
  if (classId) match.class = new mongoose.Types.ObjectId(classId);

  const pipeline = [
    { $match: match },
    { $group: {
      _id:     { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
      present: { $sum: { $cond: [{ $eq: ['$status','present'] }, 1, 0] } },
      absent:  { $sum: { $cond: [{ $eq: ['$status','absent'] },  1, 0] } },
      late:    { $sum: { $cond: [{ $eq: ['$status','late'] },    1, 0] } },
      total:   { $sum: 1 },
    }},
    { $sort: { _id: 1 } },
    { $addFields: { percentage: { $round: [{ $multiply: [{ $divide: ['$present', { $max: ['$total', 1] }] }, 100] }, 1] } } },
  ];

  const stats = await Attendance.aggregate(pipeline);
  res.json({ success: true, data: stats });
};

// ── GET /api/attendance/export — export as PDF or Excel ──────────────────────
exports.exportAttendance = async (req, res) => {
  const { classId, month, year, format = 'xlsx' } = req.query;
  if (!classId || !month || !year) {
    return res.status(400).json({ success: false, message: 'classId, month, year required' });
  }

  const cls = await Class.findById(classId).lean();
  const analytics = await getClassAnalytics(classId, req.user.school, month, year);

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const meta = {
    ...analytics.summary,
    className:   cls ? `${cls.name} ${cls.section || ''}` : '',
    monthName:   MONTHS[parseInt(month) - 1],
    totalStudents: analytics.breakdown.length,
  };

  if (format === 'xlsx') {
    const buffer = await buildExcelReport(analytics.breakdown, meta, 'monthly');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${year}-${month}.xlsx"`);
    return res.send(buffer);
  }

  if (format === 'pdf') {
    return buildPDFReport(res, analytics.breakdown, meta);
  }

  res.status(400).json({ success: false, message: 'format must be xlsx or pdf' });
};

// ── POST /api/attendance/qr-token — generate QR code token for a class ────────
exports.generateQR = async (req, res) => {
  const { classId, date } = req.body;
  if (!classId) return res.status(400).json({ success: false, message: 'classId required' });

  const token = generateQRToken(classId, date || new Date(), req.user.school);
  res.json({ success: true, token, expiresIn: '5 minutes', message: 'Display this QR code in class. Students scan to mark attendance.' });
};

// ── POST /api/attendance/qr-mark — student scans QR to mark present ───────────
exports.markByQR = async (req, res) => {
  const { token, studentId } = req.body;
  if (!token || !studentId) return res.status(400).json({ success: false, message: 'token and studentId required' });

  let payload;
  try {
    payload = verifyQRToken(token);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }

  // Verify student belongs to this school
  const student = await Student.findOne({ _id: studentId, school: payload.schoolId });
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const normalizedDate = normalizeDate(payload.date);

  await Attendance.findOneAndUpdate(
    { student: studentId, date: normalizedDate, school: payload.schoolId },
    { $set: { student: studentId, class: payload.classId, date: normalizedDate, status: 'present', markedBy: null, school: payload.schoolId, markedAt: new Date(), source: 'qr' } },
    { upsert: true, new: true }
  );

  res.json({ success: true, message: 'Attendance marked as present via QR', date: payload.date });
};

// ── GET /api/attendance/working-days — get working days for a month ───────────
exports.getWorkingDaysApi = async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) return res.status(400).json({ success: false, message: 'month and year required' });

  const days = getWorkingDays(parseInt(year), parseInt(month));
  res.json({ success: true, count: days.length, data: days.map(d => d.toISOString().split('T')[0]) });
};