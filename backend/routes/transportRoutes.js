// backend/routes/transportRoutes.js
// All transport routes with role-based access
// KEY FIX: added /students endpoint accessible by ALL admin transport roles

const express = require('express');
const router  = express.Router();
const { protect, authorize, attachStudent } = require('../middleware/auth');
const ctrl = require('../controllers/transportController');
const Student = require('../models/Student');

router.use(protect);

const admin = authorize('superAdmin', 'schoolAdmin', 'transportManager');

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard', admin, ctrl.getTransportDashboard);

// ─────────────────────────────────────────────────────────────────────────────
// STUDENTS (transport-scoped) — returns all students for the school
// Accessible by transportManager, schoolAdmin, superAdmin
// Fixes the 404 that happened when transportManager called /api/students
// ─────────────────────────────────────────────────────────────────────────────
router.get('/students', admin, async (req, res) => {
  try {
    const students = await Student.find({ school: req.user.school, isActive: true })
      .populate('user',  'name email phone')
      .populate('class', 'name grade section')
      .select('name rollNumber admissionNumber class user parentName parentPhone')
      .sort({ name: 1 });
    res.json({ success: true, count: students.length, data: students });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BUSES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/buses',                       admin, ctrl.getBuses);
router.get('/buses/:id',                   admin, ctrl.getBus);
router.post('/buses',                      admin, ctrl.createBus);
router.put('/buses/:id',                   admin, ctrl.updateBus);
router.delete('/buses/:id',                admin, ctrl.deleteBus);
router.post('/buses/:id/location',                ctrl.updateBusLocation);   // GPS device / sim (no role guard — use device key in prod)
router.get('/buses/:busId/gps-history',    admin, ctrl.getGpsHistory);

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/routes',              admin, ctrl.getRoutes);
router.get('/routes/:id',          admin, ctrl.getRoute);
router.post('/routes',             admin, ctrl.createRoute);
router.put('/routes/:id',          admin, ctrl.updateRoute);
router.delete('/routes/:id',       admin, ctrl.deleteRoute);

// ─────────────────────────────────────────────────────────────────────────────
// STOPS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stops',               admin, ctrl.getStops);
router.post('/stops',              admin, ctrl.createStop);
router.put('/stops/:id',           admin, ctrl.updateStop);
router.delete('/stops/:id',        admin, ctrl.deleteStop);

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/assignments',         admin, ctrl.getAssignments);
router.post('/assignments',        admin, ctrl.assignStudent);
router.delete('/assignments/:id',  admin, ctrl.removeAssignment);

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPORT FEES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/fees',                       ctrl.getFees);           // students/parents auto-filtered
router.get('/fees/summary',        admin, ctrl.getFeeSummary);
router.post('/fees/generate',      admin, ctrl.generateMonthlyFees);
router.post('/fees/:id/payment',   admin, ctrl.recordPayment);

// ─────────────────────────────────────────────────────────────────────────────
// TRIPS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/trips/today',         admin, ctrl.getTodayTrips);
router.post('/trips',              admin, ctrl.startTrip);
router.put('/trips/:id/stop',      admin, ctrl.updateTripStop);
router.put('/trips/:id/end',       admin, ctrl.endTrip);
router.post('/trips/:id/alert',    admin, ctrl.sendTripAlert);

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT / PARENT PORTAL — own transport details only
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/my-transport',
  authorize('student', 'parent', 'superAdmin', 'schoolAdmin', 'transportManager'),
  attachStudent,
  ctrl.getMyTransport
);

module.exports = router;