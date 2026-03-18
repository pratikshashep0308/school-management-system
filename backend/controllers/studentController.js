const User = require('../models/User');
const Student = require('../models/Student');
const { Class } = require('../models/index');

// @desc    Get all students
// @route   GET /api/students
// @access  Admin, Teacher
exports.getStudents = async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.class) filter.class = req.query.class;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

  const students = await Student.find(filter)
    .populate('user', 'name email phone profileImage')
    .populate('class', 'name grade section')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: students.length, data: students });
};

// @desc    Get single student
// @route   GET /api/students/:id
// @access  Auth
exports.getStudent = async (req, res) => {
  const student = await Student.findById(req.params.id)
    .populate('user', 'name email phone profileImage')
    .populate('class', 'name grade section')
    .populate('parent', 'name email phone');

  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  res.status(200).json({ success: true, data: student });
};

// @desc    Create student (also creates User account)
// @route   POST /api/students
// @access  Admin
exports.createStudent = async (req, res) => {
  const {
    name, email, password, phone,
    admissionNumber, rollNumber, classId, section,
    dateOfBirth, gender, bloodGroup, address,
    parentName, parentPhone, parentEmail
  } = req.body;

  // Create user account
  const user = await User.create({
    name, email, phone,
    password: password || 'Student@123',
    role: 'student',
    school: req.user.school
  });

  // Create student profile
  const student = await Student.create({
    user: user._id,
    admissionNumber,
    rollNumber,
    class: classId,
    section,
    dateOfBirth,
    gender,
    bloodGroup,
    address,
    parentName,
    parentPhone,
    parentEmail,
    school: req.user.school
  });

  // Add student to class
  if (classId) {
    await Class.findByIdAndUpdate(classId, { $addToSet: { students: student._id } });
  }

  res.status(201).json({ success: true, data: student });
};

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Admin
exports.updateStudent = async (req, res) => {
  const student = await Student.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  }).populate('user', 'name email phone');

  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  // Update user name/email if provided
  if (req.body.name || req.body.email || req.body.phone) {
    await User.findByIdAndUpdate(student.user, {
      ...(req.body.name && { name: req.body.name }),
      ...(req.body.email && { email: req.body.email }),
      ...(req.body.phone && { phone: req.body.phone })
    });
  }

  res.status(200).json({ success: true, data: student });
};

// @desc    Delete student (soft delete)
// @route   DELETE /api/students/:id
// @access  Admin
exports.deleteStudent = async (req, res) => {
  const student = await Student.findByIdAndUpdate(req.params.id, { isActive: false });

  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  await User.findByIdAndUpdate(student.user, { isActive: false });

  res.status(200).json({ success: true, message: 'Student deactivated successfully' });
};

// @desc    Get student's own profile (for student role)
// @route   GET /api/students/my-profile
// @access  Student
exports.getMyProfile = async (req, res) => {
  const student = await Student.findOne({ user: req.user.id })
    .populate('user', 'name email phone profileImage')
    .populate('class', 'name grade section')
    .populate('parent', 'name email phone');

  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  res.status(200).json({ success: true, data: student });
};
