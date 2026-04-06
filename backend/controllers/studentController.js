// backend/controllers/studentController.js
const User    = require('../models/User');
const Student = require('../models/Student');
const { Class, BookIssue, Attendance } = require('../models/index');

// ─── Helper: auto-generate admission number ───────────────────────────────────
async function genAdmissionNo(school) {
  const year  = new Date().getFullYear();
  const count = await Student.countDocuments({ school });
  return `STU-${year}-${String(count + 1).padStart(4, '0')}`;
}

// ─── Helper: find-or-create parent User ──────────────────────────────────────
// Returns { parentUser, isNew }
// Guarantees no duplicate user for the same email.
// guardianName / guardianEmail / guardianPhone come from the admission form;
// they are aliased from the matching parentName / parentEmail / parentPhone fields.
async function findOrCreateParent({ parentEmail, parentName, parentPhone, studentName, school }) {
  if (!parentEmail) return { parentUser: null, isNew: false };

  const email = parentEmail.trim().toLowerCase();

  // 1. Check for an existing User with this email (any role)
  let parentUser = await User.findOne({ email });

  if (parentUser) {
    // If the account exists but with a different role, do NOT change the role —
    // just link it. This prevents accidentally escalating privileges.
    return { parentUser, isNew: false };
  }

  // 2. Create a new parent user — default password is Parent@123
  parentUser = await User.create({
    name:     (parentName || `Parent of ${studentName}`).trim(),
    email,
    phone:    parentPhone ? parentPhone.trim() : '',
    password: 'Parent@123',
    role:     'parent',
    school,
    isActive: true,
  });

  return { parentUser, isNew: true };
}

// ── GET all students ──────────────────────────────────────────────────────────
exports.getStudents = async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.class)    filter.class    = req.query.class;
  if (req.query.isActive) filter.isActive = req.query.isActive === 'true';
  if (req.query.gender)   filter.gender   = req.query.gender;
  if (req.query.status)   filter.status   = req.query.status;
  if (req.query.search) {
    const re = { $regex: req.query.search, $options: 'i' };
    filter.$or = [{ admissionNumber: re }, { rollNumber: re }, { parentName: re }];
  }

  const students = await Student.find(filter)
    .populate('user',     'name email phone profileImage')
    .populate('class',    'name grade section')
    .populate('parentId', 'name email phone')
    .sort({ createdAt: -1 });

  res.json({ success: true, count: students.length, data: students });
};

// ── GET single student ────────────────────────────────────────────────────────
exports.getStudent = async (req, res) => {
  const student = await Student.findById(req.params.id)
    .populate('user',           'name email phone profileImage')
    .populate('class',          'name grade section')
    .populate('parentId',       'name email phone')
    .populate('transportRoute', 'routeName vehicleNumber');

  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
  res.json({ success: true, data: student });
};

// ── CREATE student ────────────────────────────────────────────────────────────
exports.createStudent = async (req, res) => {
  const {
    name, email, phone, password,
    admissionNumber, rollNumber, classId,
    dateOfBirth, gender, bloodGroup, address,
    // Accept both naming conventions from the frontend form
    parentName,    parentEmail,    parentPhone,
    guardianName,  guardianEmail,  guardianPhone, guardianRelation,
    medicalInfo, hobbies, category, religion,
  } = req.body;

  // Resolve guardian fields (form may use either naming convention)
  const resolvedParentName  = parentName  || guardianName  || null;
  const resolvedParentEmail = parentEmail || guardianEmail || null;
  const resolvedParentPhone = parentPhone || guardianPhone || null;

  // 1. Validate student email uniqueness
  if (email) {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A user with this email already exists' });
    }
  }

  // 2. Create student User account
  const studentUser = await User.create({
    name,
    email,
    phone,
    password: password || 'Student@123',
    role:     'student',
    school:   req.user.school,
  });

  // 3. Find-or-create parent User account
  const { parentUser, isNew: parentIsNew } = await findOrCreateParent({
    parentEmail:  resolvedParentEmail,
    parentName:   resolvedParentName,
    parentPhone:  resolvedParentPhone,
    studentName:  name,
    school:       req.user.school,
  });

  // 4. Create Student document
  const admNo = admissionNumber || await genAdmissionNo(req.user.school);

  const student = await Student.create({
    user:             studentUser._id,
    admissionNumber:  admNo,
    rollNumber,
    class:            classId,
    dateOfBirth,
    gender,
    bloodGroup,
    address,
    // Canonical parent link
    parentId:         parentUser ? parentUser._id : undefined,
    // String fields for display
    parentName:       resolvedParentName,
    parentEmail:      resolvedParentEmail,
    parentPhone:      resolvedParentPhone,
    guardianName:     guardianName || resolvedParentName,
    guardianPhone:    guardianPhone || resolvedParentPhone,
    guardianRelation: guardianRelation || 'Parent',
    medicalInfo,
    hobbies,
    category,
    religion,
    school: req.user.school,
  });

  // 5. Add student to the class roster
  if (classId) {
    await Class.findByIdAndUpdate(classId, { $addToSet: { students: student._id } });
  }

  await student.populate([
    { path: 'user',     select: 'name email phone' },
    { path: 'parentId', select: 'name email phone' },
  ]);

  res.status(201).json({
    success: true,
    data: student,
    parentAccount: parentUser ? {
      id:       parentUser._id,
      email:    parentUser.email,
      isNew:    parentIsNew,
      // Only expose default password info if the account was freshly created
      ...(parentIsNew && {
        defaultPassword: 'Parent@123',
        note: 'Share these credentials with the parent. They should change the password after first login.',
      }),
      ...(!parentIsNew && {
        note: 'An existing account was found for this email and has been linked.',
      }),
    } : null,
  });
};

// ── UPDATE student ────────────────────────────────────────────────────────────
exports.updateStudent = async (req, res) => {
  const student = await Student.findOne({ _id: req.params.id, school: req.user.school });
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  // If parentEmail is being updated, sync the parent User link
  const { parentEmail, guardianEmail } = req.body;
  const newParentEmail = parentEmail || guardianEmail;

  if (newParentEmail && newParentEmail !== student.parentEmail) {
    const studentUser = await User.findById(student.user);
    const { parentUser, isNew } = await findOrCreateParent({
      parentEmail:  newParentEmail,
      parentName:   req.body.parentName || req.body.guardianName || student.parentName,
      parentPhone:  req.body.parentPhone || req.body.guardianPhone || student.parentPhone,
      studentName:  studentUser?.name || 'Student',
      school:       req.user.school,
    });
    if (parentUser) {
      req.body.parentId    = parentUser._id;
      req.body.parent      = parentUser._id; // keep legacy field in sync
      req.body.parentEmail = newParentEmail;
    }
  }

  const updated = await Student.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true,
  })
    .populate('user',     'name email phone')
    .populate('class',    'name section')
    .populate('parentId', 'name email phone');

  // Sync name/email/phone to the student's User account if provided
  if (req.body.name || req.body.email || req.body.phone) {
    await User.findByIdAndUpdate(student.user, {
      ...(req.body.name  && { name:  req.body.name  }),
      ...(req.body.email && { email: req.body.email }),
      ...(req.body.phone && { phone: req.body.phone }),
    });
  }

  res.json({ success: true, data: updated });
};

// ── DELETE (soft) ─────────────────────────────────────────────────────────────
exports.deleteStudent = async (req, res) => {
  const student = await Student.findOne({ _id: req.params.id, school: req.user.school });
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  await Student.findByIdAndUpdate(student._id, { isActive: false, status: 'inactive' });
  await User.findByIdAndUpdate(student.user, { isActive: false });
  // NOTE: we do NOT deactivate the parent User here — they may have other children

  res.json({ success: true, message: 'Student deactivated' });
};

// ── MY PROFILE (student role) ─────────────────────────────────────────────────
exports.getMyProfile = async (req, res) => {
  const student = await Student.findOne({ user: req.user.id })
    .populate('user',           'name email phone profileImage')
    .populate('class',          'name grade section')
    .populate('parentId',       'name email phone')
    .populate('transportRoute', 'routeName vehicleNumber');

  if (!student) return res.status(404).json({ success: false, message: 'Profile not found' });
  res.json({ success: true, data: student });
};

// ── STUDENT STATS ─────────────────────────────────────────────────────────────
exports.getStudentStats = async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const [attendanceRecords, libraryIssues] = await Promise.all([
    Attendance.find({ student: req.params.id }).select('status date').catch(() => []),
    BookIssue  && BookIssue.find({ student: req.params.id }).populate('book', 'title').catch(() => [],)
      || Promise.resolve([]),
  ]);

  const totalDays   = attendanceRecords.length;
  const presentDays = attendanceRecords.filter(a => a.status === 'present').length;
  const attPct      = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  res.json({
    success: true,
    data: {
      attendance: {
        total:      totalDays,
        present:    presentDays,
        absent:     totalDays - presentDays,
        percentage: attPct,
      },
      library: {
        booksIssued: libraryIssues.length,
        current:     libraryIssues.filter(i => i.status !== 'returned').length,
      },
    },
  });
};

// ── LINK / CREATE PARENT for existing student ─────────────────────────────────
// POST /api/students/:id/link-parent
// Body: { parentName, parentEmail, parentPhone }
exports.linkParent = async (req, res) => {
  const { parentName, parentEmail, parentPhone } = req.body;
  if (!parentEmail) {
    return res.status(400).json({ success: false, message: 'parentEmail is required' });
  }

  const student = await Student.findOne({ _id: req.params.id, school: req.user.school });
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const studentUser = await User.findById(student.user);

  const { parentUser, isNew } = await findOrCreateParent({
    parentEmail,
    parentName:  parentName || student.parentName,
    parentPhone: parentPhone || student.parentPhone,
    studentName: studentUser?.name || 'Student',
    school:      req.user.school,
  });

  // Update student with canonical parentId and string fields
  await Student.findByIdAndUpdate(student._id, {
    parentId:    parentUser._id,
    parent:      parentUser._id,   // legacy sync
    parentName:  parentName  || student.parentName,
    parentEmail: parentUser.email,
    parentPhone: parentPhone || student.parentPhone,
  });

  res.json({
    success: true,
    message: isNew ? 'Parent account created and linked' : 'Existing parent account linked',
    parentAccount: {
      id:    parentUser._id,
      email: parentUser.email,
      isNew,
      ...(isNew && {
        defaultPassword: 'Parent@123',
        note: 'Share these credentials with the parent.',
      }),
      ...(!isNew && {
        note: 'Existing account linked — parent uses their existing password.',
      }),
    },
  });
};