const express = require('express');
const router = express.Router();
const {
  getStudents, getStudent, createStudent, updateStudent, deleteStudent, getMyProfile
} = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // All routes below require auth

router.get('/my-profile', getMyProfile); // Student views own profile
router.get('/',   authorize('superAdmin', 'schoolAdmin', 'teacher', 'accountant'), getStudents);
router.get('/:id', getStudent);
router.post('/', authorize('superAdmin', 'schoolAdmin'), createStudent);
router.put('/:id', authorize('superAdmin', 'schoolAdmin'), updateStudent);
router.delete('/:id', authorize('superAdmin', 'schoolAdmin'), deleteStudent);

module.exports = router;
