const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/feeController');

// All fee routes require login
router.use(protect);

const adminRoles = ['superAdmin', 'schoolAdmin', 'accountant'];

// ── ANALYTICS ──────────────────────────────────────────────────
// GET  /api/fees/summary            → school-wide overview cards
// GET  /api/fees/class-summary      → per-class breakdown table
// GET  /api/fees/students           → all students with fee status (+ filters)
// GET  /api/fees/student/:studentId → full ledger for one student

router.get('/summary',        authorize(...adminRoles), ctrl.getOverallSummary);
router.get('/class-summary',  authorize(...adminRoles), ctrl.getClassSummary);
router.get('/students',       authorize(...adminRoles), ctrl.getStudentsFees);
router.get('/student/:studentId', ctrl.getStudentFee);  // student can see own record too

// ── PAYMENT ────────────────────────────────────────────────────
// POST /api/fees/pay                → record a payment
// POST /api/fees/setup-ledger       → bulk-init StudentFee for a class

router.post('/pay',           authorize(...adminRoles), ctrl.recordPayment);
router.post('/setup-ledger',  authorize(...adminRoles), ctrl.setupClassLedger);

// ── RECEIPT ────────────────────────────────────────────────────
// GET /api/fees/receipt/:receiptNumber

router.get('/receipt/:receiptNumber', ctrl.getReceipt);

// ── FEE STRUCTURES ─────────────────────────────────────────────
router.get('/structures',           ctrl.getStructures);
router.post('/structures',          authorize(...adminRoles), ctrl.createStructure);
router.put('/structures/:id',       authorize(...adminRoles), ctrl.updateStructure);

module.exports = router;
