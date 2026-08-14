/**
 * academicCalendarRoutes — FP-050 · FINAL LLD 1.1 §20
 *
 * Mounted at /api/academic-calendar with moduleKey 'academicCalendar' (matrix
 * gate). Every mutating route ALSO carries an explicit authorize() — the
 * defence-in-depth pattern every new TFS-EOS route follows, and the mitigation
 * recorded for SEC-001 while ADR-14 is open.
 */
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/academicCalendarController');

router.use(protect);

router.get('/years', ctrl.listYears);
router.post('/years', authorize('superAdmin', 'schoolAdmin'), ctrl.createYear);
router.post('/years/:id/activate', authorize('superAdmin', 'schoolAdmin'), ctrl.activateYear);

router.get('/holidays', ctrl.listHolidays);
router.post('/holidays', authorize('superAdmin', 'schoolAdmin'), ctrl.createHoliday);
router.delete('/holidays/:id', authorize('superAdmin', 'schoolAdmin'), ctrl.deleteHoliday);

router.get('/day-status', ctrl.dayStatus);
router.get('/working-days', ctrl.workingDays);

module.exports = router;
