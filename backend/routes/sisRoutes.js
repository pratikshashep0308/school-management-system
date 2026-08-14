/**
 * sisRoutes — FP-052 · FINAL LLD 1.1 §18.3, §19
 *
 * Mounted at /api/sis with moduleKey 'promotion'. Promotion write endpoints
 * require superAdmin or schoolAdmin via explicit authorize(); read endpoints
 * are matrix-gated. Defence-in-depth per the SEC-001 mitigation.
 */
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/promotionController');

router.use(protect);

// ── Promotion (write) — the critical path. authorize() gates the mutation. ────
router.post('/promotion/preview', authorize('superAdmin', 'schoolAdmin'), ctrl.previewPromotion);
router.post('/promotion/confirm', authorize('superAdmin', 'schoolAdmin'), ctrl.confirmPromotion);

// ── Enrolment history and assessment (read) ───────────────────────────────────
router.get('/students/:id/history', ctrl.studentHistory);
router.get('/classes/:id/roster', ctrl.classRoster);
router.get('/exam-groups/:id/announcement-scope', ctrl.announcementScope);

module.exports = router;
