const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getAdmissions, createAdmission, publicSubmit,
  getAdmission, updateAdmission, updateStatus,
  updateInterview, updateDocuments, addNote,
  deleteAdmission, getStats, enrollFromAdmission,
} = require('../controllers/admissionController');

const admin = ['superAdmin', 'schoolAdmin', 'teacher'];

// Public — no auth required
router.post('/public', publicSubmit);

// All routes below require login
router.use(protect);

router.get('/stats',            authorize(...admin), getStats);
router.get('/',                 authorize(...admin), getAdmissions);
router.post('/',                authorize(...admin), createAdmission);
router.get('/:id',              authorize(...admin), getAdmission);
router.put('/:id',              authorize(...admin), updateAdmission);
router.put('/:id/status',       authorize(...admin), updateStatus);
router.put('/:id/interview',    authorize(...admin), updateInterview);
router.put('/:id/documents',    authorize(...admin), updateDocuments);
router.put('/:id/note',         authorize(...admin), addNote);
router.delete('/:id',           authorize(...admin), deleteAdmission);
router.post('/:id/enroll',      authorize(...admin), enrollFromAdmission);

module.exports = router;