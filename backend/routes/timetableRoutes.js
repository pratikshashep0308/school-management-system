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

router.use(protect);

const ADMIN = ['superAdmin', 'schoolAdmin'];

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL: Named routes MUST come BEFORE /:id param routes.
// Express matches routes top-to-bottom. If /:id comes first,
// "auto-generate" and "validate" get treated as IDs → 404 or wrong handler.
// ─────────────────────────────────────────────────────────────────────────────

// ── Named POST routes first ───────────────────────────────────────────────────
router.post('/auto-generate', authorize(...ADMIN), autoGenerateTimetable);
router.post('/validate',      authorize(...ADMIN), validateTimetable);

// ── Named GET routes ──────────────────────────────────────────────────────────
router.get('/class/:classId',     getClassTimetable);
router.get('/teacher/:teacherId', getTeacherTimetable);
router.get('/student/:studentId', getStudentTimetable);
router.get('/versions/:classId',  getVersions);
router.get('/export/:id',         exportTimetable);

// ── Collection ────────────────────────────────────────────────────────────────
router.get('/',  getTimetables);
router.post('/', authorize(...ADMIN), createTimetable);

// ── Param routes LAST ─────────────────────────────────────────────────────────
router.get   ('/:id',            getTimetable);
router.put   ('/:id',            authorize(...ADMIN), updateTimetable);
router.delete('/:id',            authorize(...ADMIN), deleteTimetable);
router.put   ('/:id/activate',   authorize(...ADMIN), activateVersion);
router.post  ('/:id/substitute', authorize(...ADMIN), assignSubstitute);
router.delete('/:id/substitute', authorize(...ADMIN), removeSubstitute);

module.exports = router;