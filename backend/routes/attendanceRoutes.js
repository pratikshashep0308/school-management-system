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
} = require('../controllers/attendanceController');

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

// ── QR endpoints ──────────────────────────────────────────────────────────────
router.post('/qr-token', authorize(...STAFF), generateQR);
router.post('/qr-mark',  markByQR);

// ── Student route ─────────────────────────────────────────────────────────────
router.get('/student/:studentId', getStudentAttendance);

// ── Mark & update — param routes LAST ────────────────────────────────────────
router.post('/',    authorize(...STAFF), markAttendance);
router.put('/:id',  authorize(...STAFF), updateAttendance);

module.exports = router;