/**
 * syncRoutes — FP-071 · FINAL LLD 1.1 §33
 * Mounted at /api/sync. protect ensures the batch runs as an authenticated user;
 * per-operation handlers enforce the same authorization as the online paths.
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/offlineSyncController');

router.use(protect);
router.post('/', ctrl.sync);

module.exports = router;
