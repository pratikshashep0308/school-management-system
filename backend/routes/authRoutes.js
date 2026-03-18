// ── AUTH ROUTES ──
const express = require('express');
const router = express.Router();
const {
  login, getMe, logout, changePassword, forgotPassword, resetPassword, updateProfile
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.put('/change-password', protect, changePassword);
router.put('/update-profile', protect, updateProfile);

module.exports = router;
