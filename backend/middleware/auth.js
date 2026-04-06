// backend/middleware/auth.js
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
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
    const user    = await User.findById(decoded.id);
    if (!user)          return res.status(401).json({ success: false, message: 'User no longer exists' });
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
      message: `Role '${req.user.role}' does not have access to this route`,
    });
  }
  next();
};

// ── ADMIN ONLY shorthand ──────────────────────────────────────────────────────
exports.adminOnly = exports.authorize('superAdmin', 'schoolAdmin');

// ── PARENT ONLY: ensures the caller is a parent and has a linked child ────────
// Attaches req.studentDoc (the child's Student document).
// Use this on any route that should only be accessible by parents.
exports.parentOnly = async (req, res, next) => {
  if (req.user.role !== 'parent') {
    return res.status(403).json({ success: false, message: 'This route is for parents only' });
  }

  // Primary lookup: parentId field (set when student is created with guardianEmail)
  let child = await Student.findOne({ parentId: req.user._id })
    .populate('user',  'name email phone profileImage')
    .populate('class', 'name grade section');

  // Fallback: legacy `parent` field (old data) or parentEmail string match
  if (!child) {
    child = await Student.findOne({
      $or: [
        { parent:      req.user._id },
        { parentEmail: req.user.email, school: req.user.school },
      ],
    })
      .populate('user',  'name email phone profileImage')
      .populate('class', 'name grade section');

    // Backfill parentId so future lookups are fast
    if (child) {
      await Student.findByIdAndUpdate(child._id, { parentId: req.user._id, parent: req.user._id });
    }
  }

  if (!child) {
    return res.status(404).json({
      success: false,
      message: 'No linked child found for this parent account. Please contact the school admin.',
    });
  }

  req.studentDoc = child;
  next();
};

// ── STUDENT SELF-OR-ADMIN: student sees only their own data; admin/teacher sees all ──
// If role is 'parent', this enforces they can only access their linked child's data.
// Usage: router.get('/:studentId/...', protect, studentSelfOrAdmin, handler)
exports.studentSelfOrAdmin = async (req, res, next) => {
  const adminRoles = ['superAdmin', 'schoolAdmin', 'teacher', 'accountant'];
  if (adminRoles.includes(req.user.role)) return next();

  if (req.user.role === 'student') {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    if (req.params.studentId && req.params.studentId !== student._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only access your own data' });
    }
    req.studentDoc = student;
    return next();
  }

  if (req.user.role === 'parent') {
    // Primary: parentId field
    let child = await Student.findOne({ parentId: req.user._id });

    // Fallback: legacy field or email match
    if (!child) {
      child = await Student.findOne({
        $or: [
          { parent:      req.user._id },
          { parentEmail: req.user.email, school: req.user.school },
        ],
      });
      if (child) {
        await Student.findByIdAndUpdate(child._id, { parentId: req.user._id, parent: req.user._id });
      }
    }

    if (!child) {
      return res.status(404).json({ success: false, message: 'No linked child found' });
    }

    if (req.params.studentId && req.params.studentId !== child._id.toString()) {
      return res.status(403).json({ success: false, message: "You can only access your child's data" });
    }
    req.studentDoc = child;
    return next();
  }

  return res.status(403).json({ success: false, message: 'Access denied' });
};

// ── ATTACH STUDENT DOC: auto-attach student to req for student/parent roles ───
// Use on routes where req.studentDoc is needed but there is no :studentId param.
exports.attachStudent = async (req, res, next) => {
  try {
    if (req.user.role === 'student') {
      req.studentDoc = await Student.findOne({ user: req.user._id });
    } else if (req.user.role === 'parent') {
      // Primary lookup by parentId
      let child = await Student.findOne({ parentId: req.user._id });

      // Fallback + backfill
      if (!child) {
        child = await Student.findOne({
          $or: [
            { parent:      req.user._id },
            { parentEmail: req.user.email, school: req.user.school },
          ],
        });
        if (child) {
          await Student.findByIdAndUpdate(child._id, { parentId: req.user._id, parent: req.user._id });
        }
      }
      req.studentDoc = child;
    }
    next();
  } catch {
    next();
  }
};