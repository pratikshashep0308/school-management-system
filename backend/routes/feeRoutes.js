// backend/routes/feeRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/feeController');

router.use(protect);

const ADMIN = ['superAdmin', 'schoolAdmin', 'accountant'];
const STAFF = ['superAdmin', 'schoolAdmin', 'accountant', 'teacher'];

// ─── Named routes FIRST (before /:id params) ─────────────────────────────────

// Dashboard
router.get('/dashboard',      authorize(...ADMIN), ctrl.getDashboard);

// Summary & analytics (existing — kept)
router.get('/summary',        authorize(...ADMIN), ctrl.getOverallSummary);
router.get('/class-summary',  authorize(...ADMIN), ctrl.getClassSummary);
router.get('/students',       authorize(...ADMIN), ctrl.getStudentsFees);

// Export
router.get('/export',         authorize(...ADMIN), ctrl.exportFees);

// Fee Types (new)
router.get('/types',          ctrl.getFeeTypes);
router.post('/types',         authorize(...ADMIN), ctrl.createFeeType);
router.put('/types/:id',      authorize(...ADMIN), ctrl.updateFeeType);
router.delete('/types/:id',   authorize(...ADMIN), ctrl.deleteFeeType);

// Fee Assignments (new)
router.get('/assignments',             authorize(...ADMIN), ctrl.getAssignments);
router.post('/assignments',            authorize(...ADMIN), ctrl.createAssignment);
router.put('/assignments/:id',         authorize(...ADMIN), ctrl.updateAssignment);
router.delete('/assignments/:id',      authorize(...ADMIN), ctrl.deleteAssignment);
router.post('/assignments/:id/pay',    authorize(...ADMIN), ctrl.payAssignment);

// Fee Structures (existing)
router.get('/structures',       ctrl.getStructures);
router.post('/structures',      authorize(...ADMIN), ctrl.createStructure);
router.put('/structures/:id',   authorize(...ADMIN), ctrl.updateStructure);

// Ledger setup (existing)
router.post('/setup-ledger',    authorize(...ADMIN), ctrl.setupClassLedger);

// Payment (existing)
router.post('/pay',             authorize(...ADMIN), ctrl.recordPayment);

// Receipt — JSON + PDF download (existing + new)
router.get('/receipt/:receiptNumber/pdf', ctrl.downloadReceipt);
router.get('/receipt/:receiptNumber',     ctrl.getReceipt);

// Student ledger — student can see own (existing)
router.get('/student/:studentId', ctrl.getStudentFee);

module.exports = router;