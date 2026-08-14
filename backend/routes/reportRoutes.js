// backend/routes/reportRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');

const {
  getMeta,
  getDashboard,
  getPredefined,
  getTemplates,
  getReports,
  getReport,
  createReport,
  updateReport,
  deleteReport,
  runReport,
  smartSearchReport,
  exportReport,
} = require('../controllers/reportController');

// Every report route needs a valid JWT
router.use(protect);

// ── Read-only (all staff roles) ───────────────────────────────────────────────
router.get('/meta',       getMeta);        // field definitions per module
router.get('/dashboard',  getDashboard);   // live stat cards
router.get('/predefined', getPredefined);  // hardcoded starter configs
router.get('/templates',  getTemplates);   // saved templates
router.get('/',           getReports);     // saved reports list
router.get('/:id',        getReport);      // single saved report

// ── Run & search ──────────────────────────────────────────────────────────────
router.post('/run',          runReport);
router.post('/smart-search', smartSearchReport);
router.post('/export',       exportReport);

// ── Write (staff only) ────────────────────────────────────────────────────────
const REPORT_WRITERS = ['superAdmin','schoolAdmin','teacher','accountant','librarian','transportManager'];
router.post('/',    authorize(...REPORT_WRITERS), createReport);
router.put('/:id',  authorize(...REPORT_WRITERS), updateReport);
router.delete('/:id', authorize('superAdmin','schoolAdmin'), deleteReport);

module.exports = router;