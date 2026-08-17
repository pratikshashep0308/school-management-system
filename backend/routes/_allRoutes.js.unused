// This file exports stub routers for all remaining modules.
// Each module follows the same pattern as studentRoutes.js.
// Expand each section with full CRUD as needed.

const express = require('express');
const { protect, authorize } = require('../middleware/auth');

// ── TEACHER ROUTES ──
const teacherRouter = express.Router();
const Teacher = require('../models/Teacher');
const User = require('../models/User');

teacherRouter.use(protect);

teacherRouter.get('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const teachers = await Teacher.find({ school: req.user.school, isActive: true })
    .populate('user', 'name email phone profileImage')
    .populate('subjects', 'name code')
    .populate('classes', 'name grade section');
  res.json({ success: true, count: teachers.length, data: teachers });
});

teacherRouter.get('/:id', async (req, res) => {
  const teacher = await Teacher.findById(req.params.id)
    .populate('user', 'name email phone')
    .populate('subjects classes classTeacherOf');
  if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });
  res.json({ success: true, data: teacher });
});

teacherRouter.post('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const { name, email, phone, employeeId, subjects, qualification, experience } = req.body;
  const user = await User.create({ name, email, phone, password: req.body.password || 'Teacher@123', role: 'teacher', school: req.user.school });
  const teacher = await Teacher.create({ user: user._id, employeeId, subjects, qualification, experience, school: req.user.school });
  res.status(201).json({ success: true, data: teacher });
});

teacherRouter.put('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const teacher = await Teacher.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: teacher });
});

// ── CLASS ROUTES ──
const classRouter = express.Router();
const { Class } = require('../models/index');

classRouter.use(protect);
classRouter.get('/', async (req, res) => {
  const classes = await Class.find({ school: req.user.school })
    .populate('classTeacher', 'user').populate({ path: 'classTeacher', populate: { path: 'user', select: 'name' } })
    .populate('subjects', 'name code');
  res.json({ success: true, data: classes });
});
classRouter.post('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const cls = await Class.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: cls });
});
classRouter.put('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const cls = await Class.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: cls });
});
classRouter.delete('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  await Class.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Class deleted' });
});

// ── SUBJECT ROUTES ──
const subjectRouter = express.Router();
const { Subject } = require('../models/index');

subjectRouter.use(protect);
subjectRouter.get('/', async (req, res) => {
  const subjects = await Subject.find({ school: req.user.school });
  res.json({ success: true, data: subjects });
});
subjectRouter.post('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const subject = await Subject.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: subject });
});

// ── ATTENDANCE ROUTES ──
const attendanceRouter = express.Router();
const { markAttendance, getClassAttendance, getStudentAttendance, getMonthlyReport } = require('../controllers/attendanceController');

attendanceRouter.use(protect);
attendanceRouter.post('/', authorize('superAdmin', 'schoolAdmin', 'teacher'), markAttendance);
attendanceRouter.get('/class', getClassAttendance);
attendanceRouter.get('/monthly-report', getMonthlyReport);
attendanceRouter.get('/student/:studentId', getStudentAttendance);

// ── EXAM ROUTES ──
const examRouter = express.Router();
const { Exam, Result } = require('../models/index');

examRouter.use(protect);
examRouter.get('/', async (req, res) => {
  const exams = await Exam.find({ school: req.user.school })
    .populate('class', 'name grade').populate('subject', 'name').sort({ date: -1 });
  res.json({ success: true, data: exams });
});
examRouter.post('/', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  const exam = await Exam.create({ ...req.body, school: req.user.school, createdBy: req.user.id });
  res.status(201).json({ success: true, data: exam });
});
examRouter.put('/:id', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: exam });
});
examRouter.post('/:id/results', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  // req.body.results: [{ studentId, marksObtained, remarks }]
  const results = [];
  for (const r of req.body.results) {
    const result = await Result.findOneAndUpdate(
      { student: r.studentId, exam: req.params.id },
      { student: r.studentId, exam: req.params.id, marksObtained: r.marksObtained, remarks: r.remarks, school: req.user.school, enteredBy: req.user.id },
      { upsert: true, new: true }
    );
    results.push(result);
  }
  res.json({ success: true, data: results });
});
examRouter.get('/:id/results', async (req, res) => {
  const results = await Result.find({ exam: req.params.id })
    .populate({ path: 'student', populate: { path: 'user', select: 'name' } });
  res.json({ success: true, data: results });
});

// ── FEE ROUTES ──
const feeRouter = express.Router();
const { FeeStructure, FeePayment } = require('../models/index');

feeRouter.use(protect);
feeRouter.get('/structures', async (req, res) => {
  const structures = await FeeStructure.find({ school: req.user.school }).populate('class', 'name grade');
  res.json({ success: true, data: structures });
});
feeRouter.post('/structures', authorize('superAdmin', 'schoolAdmin', 'accountant'), async (req, res) => {
  const structure = await FeeStructure.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: structure });
});
feeRouter.get('/payments', async (req, res) => {
  const payments = await FeePayment.find({ school: req.user.school })
    .populate({ path: 'student', populate: { path: 'user', select: 'name' } })
    .sort({ createdAt: -1 });
  res.json({ success: true, data: payments });
});
feeRouter.post('/payments', authorize('superAdmin', 'schoolAdmin', 'accountant'), async (req, res) => {
  const payment = await FeePayment.create({ ...req.body, school: req.user.school, collectedBy: req.user.id });
  res.status(201).json({ success: true, data: payment });
});

// ── TIMETABLE ROUTES ──
const timetableRouter = express.Router();
const { Timetable } = require('../models/index');

timetableRouter.use(protect);
timetableRouter.get('/', async (req, res) => {
  const { classId } = req.query;
  const timetables = await Timetable.find({ class: classId, school: req.user.school })
    .populate('periods.subject', 'name').populate('periods.teacher', 'user').populate({ path: 'periods.teacher', populate: { path: 'user', select: 'name' } })
    .sort({ day: 1 });
  res.json({ success: true, data: timetables });
});
timetableRouter.post('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const tt = await Timetable.findOneAndUpdate(
    { class: req.body.class, day: req.body.day, school: req.user.school },
    { ...req.body, school: req.user.school },
    { upsert: true, new: true }
  );
  res.status(201).json({ success: true, data: tt });
});

// ── ASSIGNMENT ROUTES ──
const assignmentRouter = express.Router();
const { Assignment } = require('../models/index');

assignmentRouter.use(protect);
assignmentRouter.get('/', async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.classId) filter.class = req.query.classId;
  const assignments = await Assignment.find(filter)
    .populate('class', 'name grade').populate('subject', 'name').populate({ path: 'teacher', populate: { path: 'user', select: 'name' } })
    .sort({ dueDate: 1 });
  res.json({ success: true, data: assignments });
});
assignmentRouter.post('/', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  const assignment = await Assignment.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: assignment });
});
assignmentRouter.post('/:id/submit', authorize('student'), async (req, res) => {
  const Student = require('../models/Student');
  const student = await Student.findOne({ user: req.user.id });
  await Assignment.findByIdAndUpdate(req.params.id, {
    $push: { submissions: { student: student._id, submittedAt: new Date(), fileUrl: req.body.fileUrl, status: 'submitted' } }
  });
  res.json({ success: true, message: 'Assignment submitted successfully' });
});

// ── LIBRARY ROUTES ──
const libraryRouter = express.Router();
const { Book, BookIssue } = require('../models/index');

libraryRouter.use(protect);
libraryRouter.get('/books', async (req, res) => {
  const books = await Book.find({ school: req.user.school });
  res.json({ success: true, data: books });
});
libraryRouter.post('/books', authorize('superAdmin', 'schoolAdmin', 'librarian'), async (req, res) => {
  const book = await Book.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: book });
});
libraryRouter.post('/issue', authorize('superAdmin', 'schoolAdmin', 'librarian'), async (req, res) => {
  const { bookId, studentId, dueDate } = req.body;
  const book = await Book.findById(bookId);
  if (!book || book.availableCopies < 1) {
    return res.status(400).json({ success: false, message: 'Book not available' });
  }
  await Book.findByIdAndUpdate(bookId, { $inc: { availableCopies: -1 } });
  const issue = await BookIssue.create({ book: bookId, student: studentId, dueDate, issuedBy: req.user.id, school: req.user.school });
  res.status(201).json({ success: true, data: issue });
});
libraryRouter.put('/return/:issueId', authorize('superAdmin', 'schoolAdmin', 'librarian'), async (req, res) => {
  const issue = await BookIssue.findByIdAndUpdate(req.params.issueId, { returnedDate: new Date(), status: 'returned' }, { new: true });
  await Book.findByIdAndUpdate(issue.book, { $inc: { availableCopies: 1 } });
  res.json({ success: true, data: issue });
});

// ── TRANSPORT ROUTES ──
const transportRouter = express.Router();
const { Transport } = require('../models/index');

transportRouter.use(protect);
transportRouter.get('/', async (req, res) => {
  const routes = await Transport.find({ school: req.user.school, isActive: true })
    .populate('students', 'admissionNumber').populate({ path: 'students', populate: { path: 'user', select: 'name' } });
  res.json({ success: true, data: routes });
});
transportRouter.post('/', authorize('superAdmin', 'schoolAdmin', 'transportManager'), async (req, res) => {
  const route = await Transport.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: route });
});
transportRouter.put('/:id', authorize('superAdmin', 'schoolAdmin', 'transportManager'), async (req, res) => {
  const route = await Transport.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: route });
});

// ── NOTIFICATION ROUTES ──
const notificationRouter = express.Router();
const { Notification } = require('../models/index');

notificationRouter.use(protect);
notificationRouter.get('/', async (req, res) => {
  const notifications = await Notification.find({ school: req.user.school })
    .populate('sentBy', 'name').sort({ createdAt: -1 }).limit(50);
  res.json({ success: true, data: notifications });
});
notificationRouter.post('/', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  const notification = await Notification.create({ ...req.body, sentBy: req.user.id, school: req.user.school });
  res.status(201).json({ success: true, data: notification });
});
notificationRouter.put('/:id/read', async (req, res) => {
  await Notification.findByIdAndUpdate(req.params.id, { $addToSet: { readBy: req.user.id } });
  res.json({ success: true, message: 'Marked as read' });
});

// ── DASHBOARD ROUTES ──
const dashboardRouter = express.Router();
const { getDashboardStats } = require('../controllers/dashboardController');

dashboardRouter.use(protect);
dashboardRouter.get('/stats', getDashboardStats);

module.exports = {
  teacherRoutes: teacherRouter,
  classRoutes: classRouter,
  subjectRoutes: subjectRouter,
  attendanceRoutes: attendanceRouter,
  examRoutes: examRouter,
  feeRoutes: feeRouter,
  timetableRoutes: timetableRouter,
  assignmentRoutes: assignmentRouter,
  libraryRoutes: libraryRouter,
  transportRoutes: transportRouter,
  notificationRoutes: notificationRouter,
  dashboardRoutes: dashboardRouter
};
