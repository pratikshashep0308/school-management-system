// backend/routes/transportRoutes.js
// All transport management routes with role-based access control

const express = require('express');
const router  = express.Router();
const { protect, authorize, attachStudent } = require('../middleware/auth');
const ctrl = require('../controllers/transportController');

// ── All routes require authentication ────────────────────────────────────────
router.use(protect);

// ── Role helpers ──────────────────────────────────────────────────────────────
const admin     = authorize('superAdmin', 'schoolAdmin', 'transportManager');
const adminOnly = authorize('superAdmin', 'schoolAdmin');

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD (admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard', admin, ctrl.getTransportDashboard);

// ─────────────────────────────────────────────────────────────────────────────
// BUSES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/buses',                    admin, ctrl.getBuses);
router.get('/buses/:id',                admin, ctrl.getBus);
router.post('/buses',                   admin, ctrl.createBus);
router.put('/buses/:id',                admin, ctrl.updateBus);
router.delete('/buses/:id',             admin, ctrl.deleteBus);

// GPS update — no school auth (called by GPS device or simulator)
// In production, protect this with a device API key instead
router.post('/buses/:id/location',             ctrl.updateBusLocation);

// GPS history (admin, for route replay)
router.get('/buses/:busId/gps-history', admin, ctrl.getGpsHistory);

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/routes',              admin,  ctrl.getRoutes);
router.get('/routes/:id',          admin,  ctrl.getRoute);
router.post('/routes',             admin,  ctrl.createRoute);
router.put('/routes/:id',          admin,  ctrl.updateRoute);
router.delete('/routes/:id',       admin,  ctrl.deleteRoute);

// ─────────────────────────────────────────────────────────────────────────────
// STOPS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stops',               admin,  ctrl.getStops);
router.post('/stops',              admin,  ctrl.createStop);
router.put('/stops/:id',           admin,  ctrl.updateStop);
router.delete('/stops/:id',        admin,  ctrl.deleteStop);

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/assignments',         admin,  ctrl.getAssignments);
router.post('/assignments',        admin,  ctrl.assignStudent);
router.delete('/assignments/:id',  admin,  ctrl.removeAssignment);

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPORT FEES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/fees',                       ctrl.getFees);           // students/parents see own fees
router.get('/fees/summary',         admin, ctrl.getFeeSummary);
router.post('/fees/generate',       admin, ctrl.generateMonthlyFees);
router.post('/fees/:id/payment',    admin, ctrl.recordPayment);

// ─────────────────────────────────────────────────────────────────────────────
// TRIPS (real-time journey management)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/trips/today',          admin, ctrl.getTodayTrips);
router.post('/trips',               admin, ctrl.startTrip);
router.put('/trips/:id/stop',       admin, ctrl.updateTripStop);
router.put('/trips/:id/end',        admin, ctrl.endTrip);
router.post('/trips/:id/alert',     admin, ctrl.sendTripAlert);

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT / PARENT PORTAL — filtered, read-only
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-transport',
  authorize('student', 'parent', 'superAdmin', 'schoolAdmin', 'transportManager'),
  attachStudent,
  ctrl.getMyTransport
);

module.exports = router;
