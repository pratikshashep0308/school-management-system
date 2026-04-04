// backend/controllers/studentPortalController.js
// ALL routes here are student/parent facing — data is ALWAYS filtered by identity
// Never trust req.params for identity — always use req.user from JWT

const Student    = require('../models/Student');
const { Attendance, Result, Exam, FeePayment, StudentFee, Timetable,
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
    // Primary: match by parent ObjectId (set when student is created with parentEmail)
    let child = await Student.findOne({ parent: req.user._id })
      .populate('user', 'name email phone profileImage')
      .populate('class', 'name grade section');

    // Fallback for legacy students: match by parentEmail string field
    if (!child) {
      child = await Student.findOne({ parentEmail: req.user.email, school: req.user.school })
        .populate('user', 'name email phone profileImage')
        .populate('class', 'name grade section');

      // If found via email fallback, backfill the parent ObjectId so future lookups are fast
      if (child) {
        await Student.findByIdAndUpdate(child._id, { parent: req.user._id });
        child.parent = req.user._id;
      }
    }
    return child;
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

  // Read from StudentFee (the live ledger updated by admin payments)
  const record = await StudentFee.findOne({ student: student._id })
    .populate('class', 'name grade section')
    .populate('paymentHistory.collectedBy', 'name');

  if (!record) {
    return res.json({
      success: true,
      data: {
        summary: { paid: 0, pending: 0, overdue: 0, total: 0 },
        payments: [],
      },
    });
  }

  // Shape payment history entries to match what the dashboard expects
  const payments = record.paymentHistory.map(p => ({
    _id:           p._id,
    amount:        p.amount,
    paidOn:        p.paidOn,
    method:        p.method,
    transactionId: p.transactionId,
    receiptNumber: p.receiptNumber,
    month:         p.month,
    year:          p.year,
    remarks:       p.remarks,
    collectedBy:   p.collectedBy,
    status:        'paid',  // every entry in paymentHistory is a completed payment
    // Expose ledger-level totals on each entry so the dashboard can read them
    totalAmount:   record.totalFees,
    paidAmount:    record.paidAmount,
    dueAmount:     record.pendingAmount,
    paymentStatus: record.paymentStatus,
  }));

  res.json({
    success: true,
    data: {
      summary: {
        paid:    record.paidAmount,
        pending: record.pendingAmount,
        overdue: 0,
        total:   record.totalFees,
      },
      // Also expose the ledger record directly so dashboard components can read it
      ledger: {
        totalFees:     record.totalFees,
        paidAmount:    record.paidAmount,
        pendingAmount: record.pendingAmount,
        paymentStatus: record.paymentStatus,
      },
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

  // Note: no isPublished field in schema — fetch all assignments for the student's class
  const assignments = await Assignment.find({ class: student.class })
    .populate('subject', 'name code')
    .populate({ path: 'teacher', populate: { path: 'user', select: 'name' } })
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
  // Resolve student — try ObjectId first, then email fallback for legacy records
  let student;
  if (req.user.role === 'student') {
    student = await Student.findOne({ user: req.user._id })
      .populate('user',  'name email phone profileImage')
      .populate('class', 'name grade section');
  } else {
    // parent — primary lookup by ObjectId
    student = await Student.findOne({ parent: req.user._id })
      .populate('user',  'name email phone profileImage')
      .populate('class', 'name grade section');

    // Fallback: match by parentEmail for students created before the fix
    if (!student) {
      student = await Student.findOne({ parentEmail: req.user.email, school: req.user.school })
        .populate('user',  'name email phone profileImage')
        .populate('class', 'name grade section');

      // Backfill parent ObjectId so this only runs once
      if (student) {
        await Student.findByIdAndUpdate(student._id, { parent: req.user._id });
      }
    }
  }

  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  // Fetch all data in parallel for performance
  const [attendance, results, feeRecord, assignments, notifications] = await Promise.all([
    Attendance.find({ student: student._id }).sort({ date: -1 }).limit(30),
    Result.find({ student: student._id })
      .populate({ path: 'exam', select: 'name examType totalMarks', populate: { path: 'subject', select: 'name' } })
      .sort({ createdAt: -1 }).limit(10),
    // ← Use StudentFee (live ledger) instead of FeePayment (legacy, not always updated)
    StudentFee.findOne({ student: student._id })
      .populate('class', 'name grade section'),
    // Note: no isPublished field in schema — fetch all assignments for the student's class
    Assignment.find({ class: student.class, school: student.school }).sort({ dueDate: 1 })
      .populate('subject', 'name code')
      .populate({ path: 'teacher', populate: { path: 'user', select: 'name' } }),
    Notification.find({
      school: student.school,
      audience: { $in: [req.user.role === 'parent' ? 'parents' : 'students', 'all'] }
    }).sort({ createdAt: -1 }).limit(5),
  ]);

  // Compute quick stats
  const attTotal   = attendance.length;
  const attPresent = attendance.filter(a => a.status === 'present').length;

  // Build a fees array that the dashboard UI (ParentDashboard / StudentDashboard) can consume.
  // The UI reads: fees.filter(f => f.status !== 'paid') for pendingFees,
  // and fees.filter(f => f.status === 'paid').reduce(...) for paid amount.
  let fees = [];
  if (feeRecord) {
    // One synthesised entry representing the whole ledger so the stat cards work correctly
    fees = [{
      _id:           feeRecord._id,
      status:        feeRecord.paymentStatus === 'paid' ? 'paid'
                   : feeRecord.paymentStatus === 'partial' ? 'partial'
                   : 'pending',
      totalAmount:   feeRecord.totalFees,
      paidAmount:    feeRecord.paidAmount,
      dueAmount:     feeRecord.pendingAmount,
      amount:        feeRecord.paidAmount,   // compat with old field
      paymentStatus: feeRecord.paymentStatus,
    }];
  }

  const feePaid    = feeRecord ? feeRecord.paidAmount    : 0;
  const feePending = feeRecord ? feeRecord.pendingAmount : 0;

  // Mark each assignment with whether THIS student has submitted it
  const assignmentsWithStatus = assignments.map(a => {
    const submission = a.submissions?.find(
      s => s.student?.toString() === student._id.toString()
    );
    return {
      ...a.toObject(),
      mySubmission: submission || null,
      submitted:    !!submission,
    };
  });

  res.json({
    success: true,
    data: {
      student,
      stats: {
        attendancePercentage: attTotal ? Math.round((attPresent / attTotal) * 100) : 0,
        feePaid,
        feePending,
        totalResults: results.length,
        pendingAssignments: assignmentsWithStatus.filter(a => a.dueDate && new Date(a.dueDate) >= new Date() && !a.submitted).length,
      },
      recentAttendance:    attendance.slice(0, 7),
      recentResults:       results,
      recentFees:          fees,
      fees,
      assignments:         assignmentsWithStatus,   // frontend reads data?.assignments
      upcomingAssignments: assignmentsWithStatus,   // alias
      notifications,
    },
  });
};