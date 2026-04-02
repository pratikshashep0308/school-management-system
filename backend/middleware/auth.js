const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');

// ── PROTECT: verify JWT token ─────────────────────────────────────────────────
exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized. Please login.' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user)         return res.status(401).json({ success: false, message: 'User no longer exists' });
    if (!user.isActive) return res.status(401).json({ success: false, message: 'Account has been deactivated' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token is invalid or expired' });
  }
};

// ── AUTHORIZE: allow only certain roles ──────────────────────────────────────
exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Role '${req.user.role}' does not have access to this route`
    });
  }
  next();
};

// ── ADMIN ONLY shorthand ──────────────────────────────────────────────────────
exports.adminOnly = exports.authorize('superAdmin', 'schoolAdmin');

// ── STUDENT SELF-ONLY: ensures student can only access their own data ─────────
// Usage: router.get('/:studentId/...', protect, studentSelfOrAdmin, handler)
exports.studentSelfOrAdmin = async (req, res, next) => {
  const adminRoles = ['superAdmin', 'schoolAdmin', 'teacher', 'accountant'];
  if (adminRoles.includes(req.user.role)) return next(); // admin passes through

  if (req.user.role === 'student') {
    // Find the student record linked to this user
    const student = await Student.findOne({ user: req.user._id });
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    // The requested studentId must match this student's own ID
    if (req.params.studentId && req.params.studentId !== student._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only access your own data' });
    }
    req.studentDoc = student; // attach for controller reuse
    return next();
  }

  if (req.user.role === 'parent') {
    // Parent can only access their linked child's data
    const child = await Student.findOne({ parent: req.user._id });
    if (!child) return res.status(404).json({ success: false, message: 'No linked child found' });

    if (req.params.studentId && req.params.studentId !== child._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only access your child\'s data' });
    }
    req.studentDoc = child;
    return next();
  }

  return res.status(403).json({ success: false, message: 'Access denied' });
};

// ── ATTACH STUDENT DOC: auto-attach student to req for student/parent roles ───
// Use on routes where we need req.studentDoc populated without a :studentId param
exports.attachStudent = async (req, res, next) => {
  try {
    if (req.user.role === 'student') {
      req.studentDoc = await Student.findOne({ user: req.user._id });
    } else if (req.user.role === 'parent') {
      req.studentDoc = await Student.findOne({ parent: req.user._id });
    }
    next();
  } catch {
    next();
  }
};