const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getAdmissions, createAdmission, publicSubmit,
  getAdmission, updateAdmission, updateStatus,
  deleteAdmission, getStats,
} = require('../controllers/admissionController');

// Public — no auth
router.post('/public', publicSubmit);

router.use(protect);

router.get('/stats', authorize('superAdmin','schoolAdmin'), getStats);
router.get('/',      authorize('superAdmin','schoolAdmin'), getAdmissions);
router.post('/',     authorize('superAdmin','schoolAdmin'), createAdmission);
router.get('/:id',   authorize('superAdmin','schoolAdmin'), getAdmission);
router.put('/:id',   authorize('superAdmin','schoolAdmin'), updateAdmission);
router.put('/:id/status', authorize('superAdmin','schoolAdmin'), updateStatus);
router.delete('/:id', authorize('superAdmin','schoolAdmin'), deleteAdmission);

module.exports = router;
