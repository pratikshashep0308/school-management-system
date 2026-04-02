// backend/controllers/studentPortalController.js
// ALL routes here are student/parent facing — data is ALWAYS filtered by identity
// Never trust req.params for identity — always use req.user from JWT

const Student    = require('../models/Student');
const { Attendance, Result, Exam, FeePayment, Timetable,
        Assignment, Notification, Class } = require('../models/index');

// ── HELPER: resolve studentDoc from token ────────────────────────────────────
// Returns the student document for whoever is logged in (student or parent)
async function resolveStudent(req) {
  // Already attached by attachStudent middleware
  if (req.studentDoc) return req.studentDoc;

  if (req.user.role === 'student') {
    return await Student.findOne({ user: req.user._id })
      .populate('user', 'name email phone profileImage')
      .populate('class', 'name grade section');
  }
  if (req.user.role === 'parent') {
    return await Student.findOne({ parent: req.user._id })
      .populate('user', 'name email phone profileImage')
      .populate('class', 'name grade section');
  }
  return null;
}

// ── GET /api/student/profile ─────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  const student = await Student.findOne(
    req.user.role === 'student' ? { user: req.user._id } : { parent: req.user._id }
  )
    .populate('user',           'name email phone profileImage')
    .populate('class',          'name grade section')
    .populate('transportRoute', 'routeName vehicleNumber stops');

  if (!student) return res.status(404).json({ success: false, message: 'Profile not found' });
  res.json({ success: true, data: student });
};

// ── GET /api/student/attendance ──────────────────────────────────────────────
exports.getAttendance = async (req, res) => {
  const student = await resolveStudent(req);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const { month, year } = req.query;
  const filter = { student: student._id };

  // Optional date filtering
  if (month && year) {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59);
    filter.date = { $gte: start, $lte: end };
  }

  const records = await Attendance.find(filter)
    .sort({ date: -1 })
    .populate('markedBy', 'name');

  const total   = records.length;
  const present = records.filter(r => r.status === 'present').length;
  const absent  = records.filter(r => r.status === 'absent').length;
  const late    = records.filter(r => r.status === 'late').length;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

  res.json({
    success: true,
    data: {
      summary: { total, present, absent, late, percentage },
      records,
    },
  });
};

// ── GET /api/student/results ─────────────────────────────────────────────────
exports.getResults = async (req, res) => {
  const student = await resolveStudent(req);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const results = await Result.find({ student: student._id })
    .populate({
      path: 'exam',
      select: 'name examType date totalMarks passingMarks subject',
      populate: { path: 'subject', select: 'name code' },
    })
    .sort({ createdAt: -1 });

  // Calculate overall performance
  const passed  = results.filter(r => r.percentage >= 35).length;
  const avgPct  = results.length
    ? Math.round(results.reduce((sum, r) => sum + (r.percentage || 0), 0) / results.length)
    : 0;

  res.json({
    success: true,
    data: {
      summary: { total: results.length, passed, failed: results.length - passed, average: avgPct },
      results,
    },
  });
};

// ── GET /api/student/fees ────────────────────────────────────────────────────
exports.getFees = async (req, res) => {
  const student = await resolveStudent(req);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const payments = await FeePayment.find({ student: student._id })
    .sort({ paidOn: -1 })
    .populate('collectedBy', 'name');

  const paid    = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const pending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  const overdue = payments.filter(p => p.status === 'overdue').reduce((s, p) => s + p.amount, 0);

  res.json({
    success: true,
    data: {
      summary: { paid, pending, overdue, total: paid + pending + overdue },
      payments,
    },
  });
};

// ── GET /api/student/timetable ───────────────────────────────────────────────
exports.getTimetable = async (req, res) => {
  const student = await resolveStudent(req);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const timetable = await Timetable.find({ class: student.class })
    .populate('subject', 'name code')
    .populate('teacher', 'name')
    .sort({ day: 1, startTime: 1 });

  res.json({ success: true, data: timetable });
};

// ── GET /api/student/assignments ─────────────────────────────────────────────
exports.getAssignments = async (req, res) => {
  const student = await resolveStudent(req);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const assignments = await Assignment.find({ class: student.class, isPublished: true })
    .populate('subject',   'name code')
    .populate('createdBy', 'name')
    .sort({ dueDate: 1 });

  // Mark which ones the student has submitted
  const withSubmission = assignments.map(a => {
    const submission = a.submissions?.find(
      s => s.student?.toString() === student._id.toString()
    );
    return {
      ...a.toObject(),
      mySubmission: submission || null,
      submitted: !!submission,
    };
  });

  res.json({ success: true, data: withSubmission });
};

// ── GET /api/student/notifications ──────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  const notifications = await Notification.find({
    school: req.user.school,
    audience: { $in: [req.user.role === 'parent' ? 'parents' : 'students', 'all'] },
  })
    .populate('sentBy', 'name')
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({ success: true, count: notifications.length, data: notifications });
};

// ── GET /api/student/dashboard ───────────────────────────────────────────────
// Single API that returns everything for the dashboard in one call
exports.getDashboard = async (req, res) => {
  const student = await Student.findOne(
    req.user.role === 'student' ? { user: req.user._id } : { parent: req.user._id }
  )
    .populate('user',  'name email phone profileImage')
    .populate('class', 'name grade section');

  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  // Fetch all data in parallel for performance
  const [attendance, results, fees, assignments, notifications] = await Promise.all([
    Attendance.find({ student: student._id }).sort({ date: -1 }).limit(30),
    Result.find({ student: student._id })
      .populate({ path: 'exam', select: 'name examType totalMarks', populate: { path: 'subject', select: 'name' } })
      .sort({ createdAt: -1 }).limit(10),
    FeePayment.find({ student: student._id }).sort({ paidOn: -1 }).limit(10),
    Assignment.find({ class: student.class, isPublished: true }).sort({ dueDate: 1 }).limit(5)
      .populate('subject', 'name'),
    Notification.find({
      school: student.school,
      audience: { $in: [req.user.role === 'parent' ? 'parents' : 'students', 'all'] }
    }).sort({ createdAt: -1 }).limit(5),
  ]);

  // Compute quick stats
  const attTotal   = attendance.length;
  const attPresent = attendance.filter(a => a.status === 'present').length;
  const feePaid    = fees.filter(f => f.status === 'paid').reduce((s, f) => s + f.amount, 0);
  const feePending = fees.filter(f => ['pending','overdue'].includes(f.status)).reduce((s, f) => s + f.amount, 0);

  res.json({
    success: true,
    data: {
      student,
      stats: {
        attendancePercentage: attTotal ? Math.round((attPresent / attTotal) * 100) : 0,
        feePaid,
        feePending,
        totalResults: results.length,
        pendingAssignments: assignments.filter(a => new Date(a.dueDate) >= new Date()).length,
      },
      recentAttendance:   attendance.slice(0, 7),
      recentResults:      results,
      recentFees:         fees,
      upcomingAssignments: assignments,
      notifications,
    },
  });
};