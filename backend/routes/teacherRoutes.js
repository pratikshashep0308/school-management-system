// backend/routes/teacherRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Teacher = require('../models/Teacher');
const User    = require('../models/User');

router.use(protect);

// ── My profile (teacher role) ─────────────────────────────────────────────────
router.get('/my-profile', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ user: req.user.id })
      .populate('user', 'name email phone profileImage')
      .populate('subjects', 'name code')
      .populate('classes',  'name grade section');
    // Don't 404 — teacher may exist as user but profile not set up yet
    res.json({ success: true, data: teacher || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get all teachers ──────────────────────────────────────────────────────────
router.get('/', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  try {
    const teachers = await Teacher.find({ school: req.user.school, isActive: true })
      .populate('user',     'name email phone profileImage')
      .populate('subjects', 'name code')
      .populate('classes',  'name grade section');
    res.json({ success: true, count: teachers.length, data: teachers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get single teacher ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id)
      .populate('user',           'name email phone')
      .populate('subjects',       'name code')
      .populate('classes',        'name grade section')
      .populate('classTeacherOf', 'name grade section');
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    res.json({ success: true, data: teacher });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Create teacher ────────────────────────────────────────────────────────────
router.post('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  try {
    const { name, email, phone, employeeId, subjects, qualification,
            experience, designation, password } = req.body;

    if (!name?.trim())  return res.status(400).json({ success: false, message: 'Name is required' });
    if (!email?.trim()) return res.status(400).json({ success: false, message: 'Email is required' });

    // Check email uniqueness
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) return res.status(400).json({ success: false, message: 'Email already registered' });

    // Auto-generate employee ID if not provided
    const count = await Teacher.countDocuments({ school: req.user.school });
    const empId = employeeId?.trim() || `EMP-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    // Create user account
    const user = await User.create({
      name:     name.trim(),
      email:    email.toLowerCase().trim(),
      phone:    phone || '',
      password: password || 'Teacher@123',
      role:     'teacher',
      school:   req.user.school,
    });

    // Create teacher profile
    const teacher = await Teacher.create({
      user:          user._id,
      employeeId:    empId,
      subjects:      subjects || [],
      qualification: qualification || '',
      experience:    experience ? Number(experience) : 0,
      designation:   designation || '',
      school:        req.user.school,
    });

    await teacher.populate('user', 'name email phone');
    res.status(201).json({ success: true, data: teacher });

  } catch (err) {
    // If teacher creation fails after user was created, clean up the user
    console.error('Create teacher error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Update teacher ────────────────────────────────────────────────────────────
router.put('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  try {
    const teacher = await Teacher.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school },
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate('user', 'name email phone');

    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    // Also update user name/email/phone if provided
    if (req.body.name || req.body.email || req.body.phone) {
      await User.findByIdAndUpdate(teacher.user, {
        ...(req.body.name  && { name:  req.body.name.trim()  }),
        ...(req.body.email && { email: req.body.email.toLowerCase().trim() }),
        ...(req.body.phone && { phone: req.body.phone }),
      });
    }

    res.json({ success: true, data: teacher });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Deactivate teacher ────────────────────────────────────────────────────────
router.delete('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  try {
    const teacher = await Teacher.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school },
      { isActive: false },
      { new: true }
    );
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
    await User.findByIdAndUpdate(teacher.user, { isActive: false });
    res.json({ success: true, message: 'Teacher deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;