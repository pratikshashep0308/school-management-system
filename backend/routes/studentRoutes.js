// backend/routes/studentRoutes.js — Enhanced
const express = require('express');
const router  = express.Router();
const {
  getStudents, getStudent, createStudent, updateStudent, deleteStudent,
  getMyProfile, getStudentStats, linkParent, resetStudentPassword, seedTestStudent,
} = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Student views own profile
router.get('/my-profile', getMyProfile);

// Admin/teacher routes
router.get('/',     authorize('superAdmin','schoolAdmin','teacher','accountant'), getStudents);
router.get('/:id',  getStudent);
router.get('/:id/stats', getStudentStats);
router.post('/:id/link-parent', authorize('superAdmin', 'schoolAdmin'), linkParent);
router.post('/',    authorize('superAdmin','schoolAdmin'), createStudent);
router.put('/:id',  authorize('superAdmin','schoolAdmin'), updateStudent);
router.delete('/:id', authorize('superAdmin','schoolAdmin'), deleteStudent);
router.put('/:id/reset-password', authorize('superAdmin','schoolAdmin'), resetStudentPassword);
router.post('/seed-test', authorize('superAdmin','schoolAdmin'), seedTestStudent);

module.exports = router;