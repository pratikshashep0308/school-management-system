// backend/routes/attendanceRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');

const {
  markAttendance,
  getClassAttendance,
  getStudentAttendance,
  getMonthlyReport,
  getClassAnalyticsApi,
  getOverview,
  getLowAttendance,
  updateAttendance,
  getStats,
  exportAttendance,
  generateQR,
  markByQR,
  getWorkingDaysApi,
  getSubmissionStatus,
  approveSubmission,
  getAttendanceLogs,
} = require('../controllers/attendanceController');

const monitor = require('../controllers/attendanceMonitorController');

router.use(protect);

const ADMIN = ['superAdmin', 'schoolAdmin'];
const STAFF = ['superAdmin', 'schoolAdmin', 'teacher'];

// ── Named routes FIRST — must come before /:id ────────────────────────────────
router.get('/overview',       authorize(...ADMIN), getOverview);
router.get('/low-attendance', authorize(...STAFF), getLowAttendance);
router.get('/monthly-report', authorize(...STAFF), getMonthlyReport);
router.get('/analytics',      authorize(...STAFF), getClassAnalyticsApi);
router.get('/stats',          authorize(...STAFF), getStats);
router.get('/export',         authorize(...STAFF), exportAttendance);
router.get('/working-days',   getWorkingDaysApi);
router.get('/class',          getClassAttendance);

// ── Submission workflow (submit / edit / approve + audit log) ────────────────
router.get('/submission',  authorize(...STAFF), getSubmissionStatus);
router.post('/approve',    authorize(...ADMIN), approveSubmission);
router.get('/logs',        authorize(...STAFF), getAttendanceLogs);

// ── Attendance monitoring reports (which classes took attendance) ────────────
// Admin / School Admin only. All read-only aggregates over AttendanceSubmission.
router.get('/monitor/dashboard',     authorize(...ADMIN), monitor.dashboard);
router.get('/monitor/daily',         authorize(...ADMIN), monitor.dailyStatus);
router.get('/monitor/recent',        authorize(...ADMIN), monitor.recentDays);
router.get('/monitor/monthly',       authorize(...ADMIN), monitor.monthly);
router.get('/monitor/class-history', authorize(...ADMIN), monitor.classHistory);
router.get('/monitor/export',        authorize(...ADMIN), monitor.exportCsv);

// ── QR endpoints ──────────────────────────────────────────────────────────────
router.post('/qr-token', authorize(...STAFF), generateQR);
router.post('/qr-mark',  markByQR);

// ── Student route ─────────────────────────────────────────────────────────────
router.get('/student/:studentId', getStudentAttendance);

// ── Mark & update — param routes LAST ────────────────────────────────────────
router.post('/',    authorize(...STAFF), markAttendance);
router.put('/:id',  authorize(...STAFF), updateAttendance);

module.exports = router;