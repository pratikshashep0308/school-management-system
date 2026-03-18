const { Attendance } = require('../models/index');
const Student = require('../models/Student');

// @desc    Mark attendance for a class
// @route   POST /api/attendance
// @access  Admin, Teacher
exports.markAttendance = async (req, res) => {
  const { classId, date, attendanceData } = req.body;
  // attendanceData: [{ studentId, status, remarks }]

  const results = [];

  for (const item of attendanceData) {
    const record = await Attendance.findOneAndUpdate(
      { student: item.studentId, date: new Date(date) },
      {
        student: item.studentId,
        class: classId,
        date: new Date(date),
        status: item.status,
        remarks: item.remarks || '',
        markedBy: req.user.id,
        school: req.user.school
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    results.push(record);
  }

  res.status(200).json({ success: true, count: results.length, message: 'Attendance saved successfully' });
};

// @desc    Get attendance for a class on a date
// @route   GET /api/attendance/class?classId=&date=
// @access  Admin, Teacher
exports.getClassAttendance = async (req, res) => {
  const { classId, date } = req.query;

  const attendance = await Attendance.find({
    class: classId,
    date: new Date(date)
  }).populate('student', 'admissionNumber rollNumber user')
    .populate({ path: 'student', populate: { path: 'user', select: 'name profileImage' } });

  res.status(200).json({ success: true, data: attendance });
};

// @desc    Get student attendance report
// @route   GET /api/attendance/student/:studentId?month=&year=
// @access  Auth
exports.getStudentAttendance = async (req, res) => {
  const { studentId } = req.params;
  const { month, year } = req.query;

  let filter = { student: studentId };

  if (month && year) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    filter.date = { $gte: start, $lte: end };
  }

  const records = await Attendance.find(filter).sort({ date: -1 });

  const total = records.length;
  const present = records.filter(r => r.status === 'present').length;
  const absent = records.filter(r => r.status === 'absent').length;
  const late = records.filter(r => r.status === 'late').length;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

  res.status(200).json({
    success: true,
    data: records,
    summary: { total, present, absent, late, percentage }
  });
};

// @desc    Get monthly attendance report for a class
// @route   GET /api/attendance/monthly-report?classId=&month=&year=
// @access  Admin, Teacher
exports.getMonthlyReport = async (req, res) => {
  const { classId, month, year } = req.query;

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);

  const students = await Student.find({ class: classId, isActive: true })
    .populate('user', 'name');

  const report = [];

  for (const student of students) {
    const records = await Attendance.find({
      student: student._id,
      date: { $gte: start, $lte: end }
    });

    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const total = records.length;

    report.push({
      student: { id: student._id, name: student.user.name, rollNumber: student.rollNumber },
      present, absent, total,
      percentage: total > 0 ? Math.round((present / total) * 100) : 0
    });
  }

  res.status(200).json({ success: true, data: report });
};
