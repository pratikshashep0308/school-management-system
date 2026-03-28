// backend/routes/transportRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/transportController');

// All routes require authentication
router.use(protect);

const admin = authorize('superAdmin', 'schoolAdmin', 'transportManager');

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/dashboard', ctrl.getDashboard);

// ─── DRIVERS ─────────────────────────────────────────────────────────────────
router.get('/drivers',                    ctrl.getDrivers);
router.post('/drivers',          admin,   ctrl.createDriver);
router.put('/drivers/:id',       admin,   ctrl.updateDriver);
router.delete('/drivers/:id',    admin,   ctrl.deleteDriver);
router.get('/drivers/expiring-licenses',  ctrl.getExpiringLicenses);

// ─── VEHICLES ─────────────────────────────────────────────────────────────────
router.get('/vehicles',                      ctrl.getVehicles);
router.get('/vehicles/expiring-docs',        ctrl.getExpiringDocuments);
router.get('/vehicles/:id',                  ctrl.getVehicle);
router.post('/vehicles',           admin,    ctrl.createVehicle);
router.put('/vehicles/:id',        admin,    ctrl.updateVehicle);
router.delete('/vehicles/:id',     admin,    ctrl.deleteVehicle);
router.post('/vehicles/:id/maintenance', admin, ctrl.addMaintenance);
router.post('/vehicles/:id/fuel',        admin, ctrl.addFuelLog);
// GPS update endpoint (called by GPS device/simulator — no school auth needed, uses device key)
router.post('/vehicles/:id/location',    ctrl.updateLocation);

// ─── ROUTES ───────────────────────────────────────────────────────────────────
router.get('/routes',              ctrl.getRoutes);
router.get('/routes/:id',          ctrl.getRoute);
router.post('/routes',    admin,   ctrl.createRoute);
router.put('/routes/:id', admin,   ctrl.updateRoute);
router.delete('/routes/:id', admin, ctrl.deleteRoute);

// ─── ALLOCATIONS ──────────────────────────────────────────────────────────────
router.get('/allocations',           ctrl.getAllocations);
router.post('/allocations', admin,   ctrl.assignStudent);
router.delete('/allocations/:id', admin, ctrl.removeAllocation);

// ─── TRIPS ────────────────────────────────────────────────────────────────────
router.get('/trips/today',           ctrl.getTodayTrips);
router.post('/trips',       admin,   ctrl.startTrip);
router.put('/trips/:id/stop', admin, ctrl.updateTripStop);
router.put('/trips/:id/end',  admin, ctrl.endTrip);
router.post('/trips/:id/alert', admin, ctrl.sendTripAlert);

// ─── BOARDING ─────────────────────────────────────────────────────────────────
router.post('/boarding',             ctrl.markBoarding);
router.get('/boarding/:tripId',      ctrl.getTripBoarding);

// ─── FEES ─────────────────────────────────────────────────────────────────────
router.get('/fees',                           ctrl.getFees);
router.post('/fees/generate',       admin,    ctrl.generateMonthlyFees);
router.post('/fees/:id/payment',    admin,    ctrl.recordPayment);

module.exports = router;