const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { Assignment } = require('../models/index');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');

router.use(protect);

router.get('/', async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.classId) filter.class = req.query.classId;
  const assignments = await Assignment.find(filter)
    .populate('class', 'name grade section')
    .populate('subject', 'name')
    .populate({ path: 'teacher', populate: { path: 'user', select: 'name' } })
    .sort({ dueDate: 1 });
  res.json({ success: true, data: assignments });
});

router.get('/:id', async (req, res) => {
  const assignment = await Assignment.findById(req.params.id)
    .populate('class subject')
    .populate({ path: 'teacher', populate: { path: 'user', select: 'name' } })
    .populate({ path: 'submissions.student', populate: { path: 'user', select: 'name' } });
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
  res.json({ success: true, data: assignment });
});

router.post('/', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  try {
    const payload = { ...req.body, school: req.user.school };

    // Auto-resolve teacher: if logged-in user is a teacher, look up their Teacher record
    if (!payload.teacher) {
      if (req.user.role === 'teacher') {
        const teacherDoc = await Teacher.findOne({ user: req.user.id, school: req.user.school });
        if (!teacherDoc) return res.status(400).json({ success: false, message: 'Teacher profile not found for your account' });
        payload.teacher = teacherDoc._id;
      } else {
        // Admin creating an assignment — find any teacher for this school as fallback,
        // or relax the requirement by setting a dummy value if none exists.
        // Better: just find the first teacher in the school and assign them, or skip if none.
        const anyTeacher = await Teacher.findOne({ school: req.user.school });
        if (anyTeacher) payload.teacher = anyTeacher._id;
        else return res.status(400).json({ success: false, message: 'No teacher found in this school. Please add a teacher first.' });
      }
    }

    const assignment = await Assignment.create(payload);
    res.status(201).json({ success: true, data: assignment });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:id', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  try {
    const assignment = await Assignment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: assignment });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:id', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  await Assignment.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Assignment deleted' });
});

router.post('/:id/submit', authorize('student'), async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });
  if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
  await Assignment.findByIdAndUpdate(req.params.id, {
    $push: {
      submissions: {
        student: student._id,
        submittedAt: new Date(),
        fileUrl: req.body.fileUrl,
        status: 'submitted'
      }
    }
  });
  res.json({ success: true, message: 'Assignment submitted successfully' });
});

router.put('/:id/grade/:studentId', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  await Assignment.findOneAndUpdate(
    { _id: req.params.id, 'submissions.student': req.params.studentId },
    {
      $set: {
        'submissions.$.marksObtained': req.body.marksObtained,
        'submissions.$.feedback': req.body.feedback,
        'submissions.$.status': 'graded'
      }
    }
  );
  res.json({ success: true, message: 'Submission graded' });
});

module.exports = router;