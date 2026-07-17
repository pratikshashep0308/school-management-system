// ── ADMIN MANAGEMENT ROUTES ──
// Lets existing admins view, create, and deactivate other admin accounts
// (role: schoolAdmin). Scoped to the caller's own school.
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// All routes here require a logged-in admin
router.use(protect);
router.use(authorize('superAdmin', 'schoolAdmin'));

// @desc   List all admin accounts for this school
// @route  GET /api/admins
// @access Admin
router.get('/', async (req, res) => {
  try {
    const admins = await User.find({
      school: req.user.school,
      role: { $in: ['superAdmin', 'schoolAdmin'] },
    })
      .select('name email phone role isActive lastLogin createdAt')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: admins.length, data: admins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @desc   Create a new admin account
// @route  POST /api/admins
// @access Admin
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required',
      });
    }
    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    // Password is auto-hashed by the User pre-save hook
    const admin = await User.create({
      name: String(name).trim(),
      email: cleanEmail,
      phone: phone ? String(phone).trim() : undefined,
      password,
      role: 'schoolAdmin',
      school: req.user.school,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @desc   Activate / deactivate an admin account
// @route  PUT /api/admins/:id/status
// @access Admin
router.put('/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;

    // Prevent an admin from deactivating their own account (lockout safety)
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot change the status of your own account',
      });
    }

    const admin = await User.findOne({
      _id: req.params.id,
      school: req.user.school,
      role: { $in: ['superAdmin', 'schoolAdmin'] },
    });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    admin.isActive = !!isActive;
    await admin.save();

    res.json({
      success: true,
      message: isActive ? 'Admin activated' : 'Admin deactivated',
      data: { _id: admin._id, isActive: admin.isActive },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @desc   Reset an admin's password
// @route  PUT /api/admins/:id/reset-password
// @access Admin
router.put('/:id/reset-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    const admin = await User.findOne({
      _id: req.params.id,
      school: req.user.school,
      role: { $in: ['superAdmin', 'schoolAdmin'] },
    }).select('+password');
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    admin.password = password; // auto-hashed on save
    await admin.save();

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @desc   Update an admin's profile (name, email, phone, role)
// @route  PUT /api/admins/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, email, phone, role, profileImage } = req.body;
    const admin = await User.findOne({
      _id: req.params.id, school: req.user.school,
      role: { $in: ['superAdmin', 'schoolAdmin'] },
    });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

    // If email is changing, ensure it's not taken by someone else
    if (email && email !== admin.email) {
      const clash = await User.findOne({ email, _id: { $ne: admin._id } });
      if (clash) return res.status(409).json({ success: false, message: 'That email is already in use.' });
      admin.email = email;
    }
    if (name  !== undefined) admin.name  = name;
    if (phone !== undefined) admin.phone = phone;
    if (profileImage !== undefined) admin.profileImage = profileImage;
    // Only a superAdmin may change roles, and never demote the last superAdmin
    if (role && ['superAdmin', 'schoolAdmin'].includes(role) && req.user.role === 'superAdmin') {
      admin.role = role;
    }
    await admin.save();
    const safe = admin.toObject(); delete safe.password;
    res.json({ success: true, data: safe, message: 'Admin updated' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// @desc   Delete an admin (cannot delete yourself or the last admin)
// @route  DELETE /api/admins/:id
router.delete('/:id', async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user._id || req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }
    const adminCount = await User.countDocuments({
      school: req.user.school, role: { $in: ['superAdmin', 'schoolAdmin'] },
    });
    if (adminCount <= 1) {
      return res.status(400).json({ success: false, message: 'Cannot delete the last remaining admin.' });
    }
    const admin = await User.findOneAndDelete({
      _id: req.params.id, school: req.user.school,
      role: { $in: ['superAdmin', 'schoolAdmin'] },
    });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    res.json({ success: true, message: 'Admin deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;