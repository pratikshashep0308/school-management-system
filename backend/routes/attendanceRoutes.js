const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  markAttendance, getClassAttendance, getStudentAttendance, getMonthlyReport
} = require('../controllers/attendanceController');

router.use(protect);

router.post('/', authorize('superAdmin', 'schoolAdmin', 'teacher'), markAttendance);
router.get('/class', getClassAttendance);
router.get('/monthly-report', authorize('superAdmin', 'schoolAdmin', 'teacher'), getMonthlyReport);
router.get('/student/:studentId', getStudentAttendance);

module.exports = router;
