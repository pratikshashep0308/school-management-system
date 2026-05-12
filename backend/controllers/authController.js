const crypto = require('crypto');
const User = require('../models/User');
const nodemailer = require('nodemailer');

// Helper: send token response
const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwtToken();

  // Update last login
  User.findByIdAndUpdate(user._id, { lastLogin: new Date() }).exec();

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profileImage: user.profileImage,
      school: user.school
    }
  });
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide email and password' });
  }

  // Allow students to log in with admission number / roll number instead of
  // the auto-generated email (which is hard to remember). We try email first,
  // then fall back to looking up the Student record by admissionNumber or
  // rollNumber and resolving back to the linked User.
  const identifier = String(email).trim();

  // Try email match — exact first (preserves original behavior for existing
  // accounts), then case-insensitive as a forgiveness fallback so users don't
  // get locked out by an off-by-case typo.
  let user = await User.findOne({ email: identifier }).select('+password');
  if (!user && identifier !== identifier.toLowerCase()) {
    user = await User.findOne({ email: identifier.toLowerCase() }).select('+password');
  }
  if (!user) {
    // ci email match — handles records stored with mixed case
    const escape = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    user = await User.findOne({ email: new RegExp(`^${escape}$`, 'i') }).select('+password');
  }

  if (!user) {
    // Treat the identifier as a possible admission/roll number (case-insensitive,
    // exact match) and resolve to the linked User account.
    try {
      const Student = require('../models/Student');
      const escape = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escape}$`, 'i');
      const stu = await Student.findOne({
        $or: [{ admissionNumber: regex }, { rollNumber: regex }],
      }).select('user');
      if (stu?.user) {
        user = await User.findById(stu.user).select('+password');
      }
    } catch (e) {
      console.warn('[login] student lookup failed:', e.message);
      // Non-fatal — fall through to invalid-credentials response below.
    }
  }

  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  if (!user.isActive) {
    return res.status(401).json({ success: false, message: 'Account is deactivated. Please contact admin.' });
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  sendTokenResponse(user, 200, res);
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user.id).populate('school', 'name logo');

  // For students, also pull their profile photo from the Student record so the
  // student-side portal can display it without a second round-trip.
  let extra = {};
  if (user?.role === 'student') {
    try {
      const Student = require('../models/Student');
      const stu = await Student.findOne({ user: user._id })
        .select('studentPhoto admissionNumber rollNumber class')
        .lean();
      if (stu) {
        extra.studentPhoto    = stu.studentPhoto    || '';
        extra.admissionNumber = stu.admissionNumber || '';
        extra.rollNumber      = stu.rollNumber      || '';
      }
    } catch (e) {
      // Don't break login — just skip the extras.
      console.warn('[getMe] student lookup failed:', e.message);
    }
  }

  // Merge into a plain object (User toObject + extras)
  const data = { ...(user?.toObject ? user.toObject() : user), ...extra };
  res.status(200).json({ success: true, data });
};

// @desc    Logout (client-side token removal, server-side blacklist optional)
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');
  const isMatch = await user.matchPassword(currentPassword);

  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  await user.save();

  sendTokenResponse(user, 200, res);
};

// @desc    Forgot password — send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return res.status(404).json({ success: false, message: 'No user found with that email' });
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: `School Management <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <h2>Password Reset</h2>
        <p>You requested a password reset. Click the link below:</p>
        <a href="${resetUrl}" style="background:#d4522a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none">Reset Password</a>
        <p>This link expires in 10 minutes.</p>
        <p>If you did not request this, ignore this email.</p>
      `
    });

    res.status(200).json({ success: true, message: 'Password reset email sent' });
  } catch (err) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return res.status(500).json({ success: false, message: 'Email could not be sent' });
  }
};

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res) => {
  const resetPasswordToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
};

// @desc    Update profile
// @route   PUT /api/auth/update-profile
// @access  Private
exports.updateProfile = async (req, res) => {
  const fieldsToUpdate = { name: req.body.name, phone: req.body.phone };
  if (req.body.profileImage) fieldsToUpdate.profileImage = req.body.profileImage;

  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    new: true, runValidators: true
  });

  res.status(200).json({ success: true, data: user });
};