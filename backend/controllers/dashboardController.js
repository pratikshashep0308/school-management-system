// ── DASHBOARD CONTROLLER ──
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const { Attendance, Exam, FeePayment, Notification, Class } = require('../models/index');

exports.getDashboardStats = async (req, res) => {
  const school = req.user.school;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalStudents,
    totalTeachers,
    todayPresent,
    todayTotal,
    feesThisMonth,
    upcomingExams,
    recentNotifications
  ] = await Promise.all([
    Student.countDocuments({ school, isActive: true }),
    Teacher.countDocuments({ school, isActive: true }),
    Attendance.countDocuments({ school, date: { $gte: today }, status: 'present' }),
    Attendance.countDocuments({ school, date: { $gte: today } }),
    FeePayment.aggregate([
      { $match: { school, status: 'paid', createdAt: { $gte: new Date(new Date().setDate(1)) } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Exam.find({ school, date: { $gte: new Date() } }).limit(5).sort({ date: 1 }).populate('class subject'),
    Notification.find({ school }).sort({ createdAt: -1 }).limit(5)
  ]);

  const attendanceRate = todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0;

  res.status(200).json({
    success: true,
    data: {
      totalStudents,
      totalTeachers,
      attendanceRate,
      feesCollected: feesThisMonth[0]?.total || 0,
      upcomingExams,
      recentNotifications
    }
  });
};

module.exports.getDashboardStats = exports.getDashboardStats;
