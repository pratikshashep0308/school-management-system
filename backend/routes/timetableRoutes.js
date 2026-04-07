// backend/routes/timetableRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');

const {
  getTimetables,
  getTimetable,
  getClassTimetable,
  getTeacherTimetable,
  getStudentTimetable,
  getVersions,
  createTimetable,
  updateTimetable,
  deleteTimetable,
  activateVersion,
  assignSubstitute,
  removeSubstitute,
  autoGenerateTimetable,
  validateTimetable,
  exportTimetable,
} = require('../controllers/timetableController');

// All routes require login
router.use(protect);

const ADMIN      = ['superAdmin', 'schoolAdmin'];
const STAFF      = ['superAdmin', 'schoolAdmin', 'teacher'];
const ALL_STAFF  = ['superAdmin', 'schoolAdmin', 'teacher', 'accountant', 'librarian', 'transportManager'];

// ── Read (all roles) ──────────────────────────────────────────────────────────
router.get('/',                        getTimetables);
router.get('/class/:classId',          getClassTimetable);
router.get('/teacher/:teacherId',      getTeacherTimetable);
router.get('/student/:studentId',      getStudentTimetable);
router.get('/versions/:classId',       getVersions);
router.get('/export/:id',              exportTimetable);
router.get('/:id',                     getTimetable);

// ── Write (admin only) ────────────────────────────────────────────────────────
router.post('/',                       authorize(...ADMIN), createTimetable);
router.put('/:id',                     authorize(...ADMIN), updateTimetable);
router.delete('/:id',                  authorize(...ADMIN), deleteTimetable);
router.put('/:id/activate',            authorize(...ADMIN), activateVersion);

// ── Substitute management (admin) ─────────────────────────────────────────────
router.post('/:id/substitute',         authorize(...ADMIN), assignSubstitute);
router.delete('/:id/substitute',       authorize(...ADMIN), removeSubstitute);

// ── Auto-generation & validation ──────────────────────────────────────────────
router.post('/auto-generate',          authorize(...ADMIN), autoGenerateTimetable);
router.post('/validate',               authorize(...ADMIN), validateTimetable);

module.exports = router;