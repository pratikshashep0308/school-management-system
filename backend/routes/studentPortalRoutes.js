// backend/routes/studentPortalRoutes.js
// Routes accessible by students (their own data) and parents (their child's data)

const express = require('express');
const router  = express.Router();
const { protect, authorize, attachStudent } = require('../middleware/auth');

const {
  getProfile,
  getAttendance,
  getResults,
  getFees,
  getTimetable,
  getAssignments,
  getNotifications,
  getDashboard,
} = require('../controllers/studentPortalController');

// All routes require login + only student or parent role
router.use(protect);
router.use(authorize('student', 'parent'));
router.use(attachStudent); // auto-attaches req.studentDoc

// Dashboard (all data in one call)
router.get('/dashboard',      getDashboard);

// Individual sections
router.get('/profile',        getProfile);
router.get('/attendance',     getAttendance);     // ?month=3&year=2026
router.get('/results',        getResults);
router.get('/fees',           getFees);
router.get('/timetable',      getTimetable);
router.get('/assignments',    getAssignments);
router.get('/notifications',  getNotifications);

module.exports = router;