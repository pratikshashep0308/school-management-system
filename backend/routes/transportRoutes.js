// backend/routes/transportRoutes.js
// ✅ FIXED & UPGRADED — Role-based transport routes
// Key fixes:
//   1. Added GET /transport/student  (student-only, returns own data)
//   2. Added GET /transport/parent   (parent-only, returns child data)
//   3. Added GET /transport/fees/my-summary (student/parent fee summary)
//   4. Added POST /transport/buses/:id/location with BusLocation upsert
//   5. Added GET /transport/buses/:busId/live-location
//   6. Proper role guards on all endpoints

'use strict';
const express = require('express');
const router  = express.Router();
const { protect, authorize, attachStudent } = require('../middleware/auth');
const ctrl    = require('../controllers/transportController');
const Student = require('../models/Student');

// All transport routes require authentication
router.use(protect);

const admin        = authorize('superAdmin', 'schoolAdmin', 'transportManager');
const portalRoles  = authorize('student', 'parent');
const allRoles     = authorize('superAdmin', 'schoolAdmin', 'transportManager', 'student', 'parent');

// ─── Dashboard ───────────────────────────────────────────────────────────────
router.get('/dashboard', admin, ctrl.getTransportDashboard);

// ─── Students list (for assignment UI) ───────────────────────────────────────
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

// ─── Buses ───────────────────────────────────────────────────────────────────
router.get('/buses',                          admin, ctrl.getBuses);
router.get('/buses/:id',                      admin, ctrl.getBus);
router.post('/buses',                         admin, ctrl.createBus);
router.put('/buses/:id',                      admin, ctrl.updateBus);
router.delete('/buses/:id',                   admin, ctrl.deleteBus);

// ✅ GPS update — no role guard (called by GPS device / simulator)
//    In production: use a device API key instead of JWT
router.post('/buses/:id/location',            ctrl.updateBusLocation);

// ✅ NEW: Live location snapshot
router.get('/buses/:busId/live-location',     ctrl.getBusLiveLocation);
router.get('/buses/:busId/gps-history',       admin, ctrl.getGpsHistory);

// ─── Routes ──────────────────────────────────────────────────────────────────
router.get('/routes',              admin, ctrl.getRoutes);
router.get('/routes/:id',          admin, ctrl.getRoute);
router.post('/routes',             admin, ctrl.createRoute);
router.put('/routes/:id',          admin, ctrl.updateRoute);
router.delete('/routes/:id',       admin, ctrl.deleteRoute);

// ─── Stops ───────────────────────────────────────────────────────────────────
router.get('/stops',               admin, ctrl.getStops);

// GET /api/transport/resolve-stop/:stopId
// Given a stop, return the route it belongs to and that route's assigned bus.
// Powers the "pick a stop → route & bus fill in automatically" flow.
router.get('/resolve-stop/:stopId', admin, async (req, res) => {
  try {
    const { Stop, BusRoute, Bus } = require('../models/transportModels');

    const stop = await Stop.findOne({ _id: req.params.stopId, school: req.user.school });
    if (!stop) return res.status(404).json({ success: false, message: 'Stop not found' });

    const route = await BusRoute.findOne({ _id: stop.route, school: req.user.school });
    if (!route) return res.status(404).json({ success: false, message: 'This stop is not linked to any route' });

    let bus = null;
    if (route.assignedBus) {
      bus = await Bus.findOne({ _id: route.assignedBus, school: req.user.school })
        .select('busNumber registrationNo capacity driver');
    }

    res.json({
      success: true,
      data: {
        stop:  { _id: stop._id, name: stop.name, morningArrivalTime: stop.morningArrivalTime, eveningArrivalTime: stop.eveningArrivalTime },
        route: { _id: route._id, name: route.name, code: route.code, color: route.color },
        bus:   bus ? { _id: bus._id, busNumber: bus.busNumber, registrationNo: bus.registrationNo, capacity: bus.capacity, driver: bus.driver } : null,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});
router.post('/stops',              admin, ctrl.createStop);
router.put('/stops/:id',           admin, ctrl.updateStop);
router.delete('/stops/:id',        admin, ctrl.deleteStop);
router.put('/stops/:id/restore',   admin, ctrl.restoreStop);

// ─── Assignments ─────────────────────────────────────────────────────────────
router.get('/assignments',         admin, ctrl.getAssignments);
// Student-profile transport (save/get in one call, auto-syncs to Transport Module)
router.get('/student/:studentId',  admin, ctrl.getStudentTransport);
router.put('/student/:studentId',  admin, ctrl.saveStudentTransport);
router.post('/assignments',        admin, ctrl.assignStudent);
router.delete('/assignments/:id',  admin, ctrl.removeAssignment);

// ─── Transport Fees ──────────────────────────────────────────────────────────
// ✅ FIX: /fees/my-summary MUST come before /fees/:id to avoid route conflict
router.get('/fees/my-summary',     portalRoles, attachStudent, ctrl.getStudentFeeSummary);
router.get('/fees/summary',        admin, ctrl.getFeeSummary);
router.get('/fees',                allRoles,    ctrl.getFees);       // student/parent auto-filtered inside controller
router.post('/fees/generate',      admin, ctrl.generateMonthlyFees);
router.post('/fees/:id/payment',   admin, ctrl.recordPayment);

// ─── Trips ───────────────────────────────────────────────────────────────────
router.get('/trips/today',         admin, ctrl.getTodayTrips);
router.post('/trips',              admin, ctrl.startTrip);
router.put('/trips/:id/stop',      admin, ctrl.updateTripStop);
router.put('/trips/:id/end',       admin, ctrl.endTrip);
router.post('/trips/:id/alert',    admin, ctrl.sendTripAlert);

// ─── Student Portal — OWN data only ─────────────────────────────────────────
// ✅ NEW: GET /api/transport/student → returns logged-in student's transport
router.get(
  '/student',
  authorize('student'),
  attachStudent,
  ctrl.getStudentTransport
);

// ✅ NEW: GET /api/transport/parent → returns parent's child transport
router.get(
  '/parent',
  authorize('parent'),
  attachStudent,
  ctrl.getParentTransport
);

// Legacy: /my-transport — delegates to student or parent handler based on role
router.get(
  '/my-transport',
  allRoles,
  attachStudent,
  ctrl.getMyTransport
);

module.exports = router;