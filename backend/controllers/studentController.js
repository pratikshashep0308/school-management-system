// backend/controllers/studentController.js — Enhanced
const User    = require('../models/User');
const Student = require('../models/Student');
const { Class, BookIssue, Attendance, Result } = require('../models/index');

// Helper — auto-generate admission number
async function genAdmissionNo(school) {
  const year  = new Date().getFullYear();
  const count = await Student.countDocuments({ school });
  return `STU-${year}-${String(count + 1).padStart(4, '0')}`;
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
    .populate('user',  'name email phone profileImage')
    .populate('class', 'name grade section')
    .sort({ createdAt: -1 });
  res.json({ success: true, count: students.length, data: students });
};

// ── GET single student ────────────────────────────────────────────────────────
exports.getStudent = async (req, res) => {
  const student = await Student.findById(req.params.id)
    .populate('user',           'name email phone profileImage')
    .populate('class',          'name grade section')
    .populate('parent',         'name email phone')
    .populate('transportRoute', 'routeName vehicleNumber');
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
  res.json({ success: true, data: student });
};

// ── CREATE student ────────────────────────────────────────────────────────────
exports.createStudent = async (req, res) => {
  const { name, email, phone, password, admissionNumber, rollNumber, classId,
    dateOfBirth, gender, bloodGroup, address, parentName, parentPhone, parentEmail,
    medicalInfo, hobbies, category, religion } = req.body;

  // Create student user account
  const user = await User.create({
    name, email, phone,
    password: password || 'Student@123',
    role: 'student',
    school: req.user.school,
  });

  const admNo = admissionNumber || await genAdmissionNo(req.user.school);

  // Auto-create parent User account if parentEmail is provided
  let parentUserId = null;
  if (parentEmail) {
    // Check if a parent user already exists with this email
    let parentUser = await User.findOne({ email: parentEmail });
    if (!parentUser) {
      // Create new parent account — default password is Parent@123
      parentUser = await User.create({
        name:     parentName || `Parent of ${name}`,
        email:    parentEmail,
        phone:    parentPhone || '',
        password: 'Parent@123',
        role:     'parent',
        school:   req.user.school,
      });
    }
    parentUserId = parentUser._id;
  }

  const student = await Student.create({
    user:    user._id,
    admissionNumber: admNo,
    rollNumber, class: classId,
    dateOfBirth, gender, bloodGroup,
    address, parentName, parentPhone, parentEmail,
    parent: parentUserId,   // ← Link parent ObjectId so portal login works
    medicalInfo, hobbies, category, religion,
    school: req.user.school,
  });

  if (classId) await Class.findByIdAndUpdate(classId, { $addToSet: { students: student._id } });

  await student.populate('user', 'name email phone');
  res.status(201).json({
    success: true,
    data: student,
    parentCredentials: parentUserId ? {
      email:    parentEmail,
      password: 'Parent@123',
      note:     'Share these credentials with the parent. Ask them to change the password after first login.'
    } : null
  });
};

// ── UPDATE student ────────────────────────────────────────────────────────────
exports.updateStudent = async (req, res) => {
  const student = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    .populate('user',  'name email phone')
    .populate('class', 'name section');
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
  if (req.body.name || req.body.email || req.body.phone) {
    await User.findByIdAndUpdate(student.user, {
      ...(req.body.name  && { name:  req.body.name  }),
      ...(req.body.email && { email: req.body.email }),
      ...(req.body.phone && { phone: req.body.phone }),
    });
  }
  res.json({ success: true, data: student });
};

// ── DELETE (soft) ─────────────────────────────────────────────────────────────
exports.deleteStudent = async (req, res) => {
  const student = await Student.findByIdAndUpdate(req.params.id, { isActive: false, status: 'inactive' });
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
  await User.findByIdAndUpdate(student.user, { isActive: false });
  res.json({ success: true, message: 'Student deactivated' });
};

// ── MY PROFILE (student role) ─────────────────────────────────────────────────
exports.getMyProfile = async (req, res) => {
  const student = await Student.findOne({ user: req.user.id })
    .populate('user',           'name email phone profileImage')
    .populate('class',          'name grade section')
    .populate('transportRoute', 'routeName vehicleNumber');
  if (!student) return res.status(404).json({ success: false, message: 'Profile not found' });
  res.json({ success: true, data: student });
};

// ── STUDENT STATS (academic summary) ─────────────────────────────────────────
exports.getStudentStats = async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  const school = req.user.school;
  const [attendanceRecords, libraryIssues] = await Promise.all([
    (async () => { try { return await Attendance.find({ student: req.params.id }).select('status date'); } catch { return []; } })(),
    (async () => { try { return await BookIssue.find({ student: req.params.id }).populate('book', 'title'); } catch { return []; } })(),
  ]);

  const totalDays   = attendanceRecords.length;
  const presentDays = attendanceRecords.filter(a => a.status === 'present').length;
  const attPct      = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  res.json({
    success: true,
    data: {
      attendance: { total: totalDays, present: presentDays, absent: totalDays - presentDays, percentage: attPct },
      library:    { booksIssued: libraryIssues.length, current: libraryIssues.filter(i => i.status !== 'returned').length },
    },
  });
};
// ── LINK/CREATE PARENT for existing student ───────────────────────────────────
// POST /api/students/:id/link-parent
// Body: { parentName, parentEmail, parentPhone }
// Creates a parent User account if one doesn't exist, links it to the student
exports.linkParent = async (req, res) => {
  const { parentName, parentEmail, parentPhone } = req.body;
  if (!parentEmail) return res.status(400).json({ success: false, message: 'parentEmail is required' });

  const student = await Student.findOne({ _id: req.params.id, school: req.user.school });
  if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

  // Find or create the parent User
  let parentUser = await User.findOne({ email: parentEmail });
  let isNew = false;
  if (!parentUser) {
    parentUser = await User.create({
      name:     parentName || student.parentName || `Parent of ${(await User.findById(student.user))?.name}`,
      email:    parentEmail,
      phone:    parentPhone || student.parentPhone || '',
      password: 'Parent@123',
      role:     'parent',
      school:   req.user.school,
    });
    isNew = true;
  }

  // Link parent to student
  await Student.findByIdAndUpdate(student._id, {
    parent:      parentUser._id,
    parentName:  parentName  || student.parentName,
    parentEmail: parentEmail,
    parentPhone: parentPhone || student.parentPhone,
  });

  res.json({
    success: true,
    message: isNew ? 'Parent account created and linked' : 'Existing parent account linked',
    parentCredentials: isNew ? {
      email:    parentEmail,
      password: 'Parent@123',
      note:     'Share these with the parent. Ask them to change password after first login.'
    } : { email: parentEmail, note: 'Existing account — use their existing password.' }
  });
};