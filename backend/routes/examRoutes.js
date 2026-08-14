const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { Exam, Result } = require('../models/index');

router.use(protect);

router.get('/', async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.classId) filter.class = req.query.classId;
  const exams = await Exam.find(filter)
    .populate('class', 'name grade section')
    .populate('subject', 'name code')
    .sort({ date: -1 });
  res.json({ success: true, data: exams });
});

router.get('/:id', async (req, res) => {
  const exam = await Exam.findById(req.params.id)
    .populate('class', 'name grade').populate('subject', 'name');
  if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
  res.json({ success: true, data: exam });
});

router.post('/', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  const exam = await Exam.create({ ...req.body, school: req.user.school, createdBy: req.user.id });
  res.status(201).json({ success: true, data: exam });
});

router.put('/:id', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: exam });
});

router.delete('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  await Exam.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Exam deleted' });
});

// Enter results for an exam
router.post('/:id/results', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  const results = [];
  for (const r of req.body.results) {
    const result = await Result.findOneAndUpdate(
      { student: r.studentId, exam: req.params.id },
      {
        student: r.studentId,
        exam: req.params.id,
        marksObtained: r.marksObtained,
        remarks: r.remarks || '',
        isAbsent: r.isAbsent || false,
        school: req.user.school,
        enteredBy: req.user.id
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    results.push(result);
  }
  res.json({ success: true, data: results });
});

// Get results for an exam
router.get('/:id/results', async (req, res) => {
  const results = await Result.find({ exam: req.params.id })
    .populate({ path: 'student', populate: { path: 'user', select: 'name profileImage' } })
    .sort({ marksObtained: -1 });
  res.json({ success: true, data: results });
});

module.exports = router;
