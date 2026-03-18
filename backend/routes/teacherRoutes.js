const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Teacher = require('../models/Teacher');
const User = require('../models/User');

router.use(protect);

router.get('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const teachers = await Teacher.find({ school: req.user.school, isActive: true })
    .populate('user', 'name email phone profileImage')
    .populate('subjects', 'name code')
    .populate('classes', 'name grade section');
  res.json({ success: true, count: teachers.length, data: teachers });
});

router.get('/my-profile', async (req, res) => {
  const teacher = await Teacher.findOne({ user: req.user.id })
    .populate('user', 'name email phone').populate('subjects classes');
  if (!teacher) return res.status(404).json({ success: false, message: 'Teacher profile not found' });
  res.json({ success: true, data: teacher });
});

router.get('/:id', async (req, res) => {
  const teacher = await Teacher.findById(req.params.id)
    .populate('user', 'name email phone').populate('subjects classes classTeacherOf');
  if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
  res.json({ success: true, data: teacher });
});

router.post('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const { name, email, phone, employeeId, subjects, qualification, experience, password } = req.body;
  const user = await User.create({ name, email, phone, password: password || 'Teacher@123', role: 'teacher', school: req.user.school });
  const teacher = await Teacher.create({ user: user._id, employeeId, subjects, qualification, experience, school: req.user.school });
  res.status(201).json({ success: true, data: teacher });
});

router.put('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const teacher = await Teacher.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
  res.json({ success: true, data: teacher });
});

router.delete('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const teacher = await Teacher.findByIdAndUpdate(req.params.id, { isActive: false });
  if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
  await User.findByIdAndUpdate(teacher.user, { isActive: false });
  res.json({ success: true, message: 'Teacher deactivated' });
});

module.exports = router;
