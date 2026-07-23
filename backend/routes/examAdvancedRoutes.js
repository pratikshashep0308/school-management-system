// backend/routes/examAdvancedRoutes.js
// Stage 1 API: exam types, grading schemes, multi-subject exam groups and
// component-based marks entry. Mounted at /api/exams-adv so the original
// /api/exams routes keep working untouched.
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { ExamType, GradingScheme, ExamGroup, ExamSubject, ExamMark } = require('../models/examModels');
const Student = require('../models/Student');
const svc = require('../services/examService');

router.use(protect);

const ADMIN = ['superAdmin', 'schoolAdmin'];
const STAFF = ['superAdmin', 'schoolAdmin', 'teacher'];

// ═══════════════════════════════════════════════════════════ EXAM TYPES ══════
router.get('/types', async (req, res) => {
  try {
    const types = await ExamType.find({ school: req.user.school, isActive: true }).sort({ name: 1 });
    res.json({ success: true, data: types });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/types', authorize(...ADMIN), async (req, res) => {
  try {
    const t = await ExamType.create({ ...req.body, school: req.user.school, createdBy: req.user._id });
    res.status(201).json({ success: true, data: t });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ success: false, message: 'An exam type with that name already exists' });
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/types/:id', authorize(...ADMIN), async (req, res) => {
  try {
    const t = await ExamType.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school }, req.body, { new: true });
    if (!t) return res.status(404).json({ success: false, message: 'Exam type not found' });
    res.json({ success: true, data: t });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/types/:id', authorize(...ADMIN), async (req, res) => {
  try {
    // Soft-delete: exams may reference this type, so keep the record.
    await ExamType.findOneAndUpdate({ _id: req.params.id, school: req.user.school }, { isActive: false });
    res.json({ success: true, message: 'Exam type removed' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ══════════════════════════════════════════════════════ GRADING SCHEMES ══════
router.get('/grading-schemes', async (req, res) => {
  try {
    const schemes = await GradingScheme.find({ school: req.user.school, isActive: true }).sort({ isDefault: -1, name: 1 });
    res.json({ success: true, data: schemes, fallbackBands: svc.FALLBACK_BANDS });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/grading-schemes', authorize(...ADMIN), async (req, res) => {
  try {
    const bands = req.body.bands || [];
    // Overlapping bands would make grading ambiguous, so reject them up front.
    const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].minPercent <= sorted[i - 1].maxPercent) {
        return res.status(400).json({
          success: false,
          message: `Grade bands overlap: "${sorted[i - 1].grade}" and "${sorted[i].grade}"`,
        });
      }
    }
    if (req.body.isDefault) {
      await GradingScheme.updateMany({ school: req.user.school }, { isDefault: false });
    }
    const s = await GradingScheme.create({ ...req.body, school: req.user.school, createdBy: req.user._id });
    res.status(201).json({ success: true, data: s });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ success: false, message: 'A scheme with that name already exists' });
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/grading-schemes/:id', authorize(...ADMIN), async (req, res) => {
  try {
    if (req.body.isDefault) {
      await GradingScheme.updateMany({ school: req.user.school }, { isDefault: false });
    }
    const s = await GradingScheme.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school }, req.body, { new: true });
    if (!s) return res.status(404).json({ success: false, message: 'Scheme not found' });
    res.json({ success: true, data: s });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/grading-schemes/:id', authorize(...ADMIN), async (req, res) => {
  try {
    await GradingScheme.findOneAndUpdate({ _id: req.params.id, school: req.user.school }, { isActive: false });
    res.json({ success: true, message: 'Scheme removed' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════ EXAM GROUPS ═════
router.get('/groups', async (req, res) => {
  try {
    const filter = { school: req.user.school };
    if (req.query.status)       filter.status = req.query.status;
    if (req.query.academicYear) filter.academicYear = req.query.academicYear;
    if (req.query.classId)      filter.classes = req.query.classId;

    const groups = await ExamGroup.find(filter)
      .populate('examType', 'name code')
      .populate('classes', 'name section')
      .populate('gradingScheme', 'name mode passMark')
      .sort({ startDate: -1 });
    res.json({ success: true, count: groups.length, data: groups });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/groups/:id', async (req, res) => {
  try {
    const group = await ExamGroup.findOne({ _id: req.params.id, school: req.user.school })
      .populate('examType', 'name code')
      .populate('classes', 'name section')
      .populate('gradingScheme');
    if (!group) return res.status(404).json({ success: false, message: 'Exam not found' });

    const subjects = await ExamSubject.find({ examGroup: group._id })
      .populate('subject', 'name code')
      .populate('class', 'name section')
      .populate({ path: 'invigilator', populate: { path: 'user', select: 'name' } })
      .sort({ date: 1, startTime: 1 });

    res.json({ success: true, data: { ...group.toObject(), subjects } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/groups', authorize(...ADMIN), async (req, res) => {
  try {
    const g = await ExamGroup.create({ ...req.body, school: req.user.school, createdBy: req.user._id });
    res.status(201).json({ success: true, data: g });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/groups/:id', authorize(...ADMIN), async (req, res) => {
  try {
    const g = await ExamGroup.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school }, req.body, { new: true });
    if (!g) return res.status(404).json({ success: false, message: 'Exam not found' });
    res.json({ success: true, data: g });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/groups/:id', authorize(...ADMIN), async (req, res) => {
  try {
    const group = await ExamGroup.findOne({ _id: req.params.id, school: req.user.school });
    if (!group) return res.status(404).json({ success: false, message: 'Exam not found' });

    // Refuse to delete once marks exist — that would destroy student records.
    const markCount = await ExamMark.countDocuments({ examGroup: group._id });
    if (markCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${markCount} mark record(s) exist for this exam. Remove the marks first.`,
      });
    }
    await ExamSubject.deleteMany({ examGroup: group._id });
    await ExamGroup.deleteOne({ _id: group._id });
    res.json({ success: true, message: 'Exam deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═════════════════════════════════════════════════════════ EXAM SUBJECTS ═════
router.post('/groups/:id/subjects', authorize(...ADMIN), async (req, res) => {
  try {
    const group = await ExamGroup.findOne({ _id: req.params.id, school: req.user.school });
    if (!group) return res.status(404).json({ success: false, message: 'Exam not found' });

    const doc = await ExamSubject.create({
      ...req.body, examGroup: group._id, school: req.user.school,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ success: false, message: 'That subject is already scheduled for this class' });
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/subjects/:id', authorize(...ADMIN), async (req, res) => {
  try {
    const s = await ExamSubject.findOne({ _id: req.params.id, school: req.user.school });
    if (!s) return res.status(404).json({ success: false, message: 'Exam subject not found' });
    if (s.isLocked && !req.body.isLocked === false) {
      // Allow unlocking, but block edits while locked
      const onlyUnlocking = Object.keys(req.body).length === 1 && 'isLocked' in req.body;
      if (!onlyUnlocking) {
        return res.status(400).json({ success: false, message: 'This subject is locked. Unlock it before editing.' });
      }
    }
    Object.assign(s, req.body);
    await s.save();
    res.json({ success: true, data: s });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/subjects/:id', authorize(...ADMIN), async (req, res) => {
  try {
    const markCount = await ExamMark.countDocuments({ examSubject: req.params.id });
    if (markCount > 0) {
      return res.status(400).json({ success: false, message: `Cannot remove: ${markCount} mark record(s) exist for this subject.` });
    }
    await ExamSubject.deleteOne({ _id: req.params.id, school: req.user.school });
    res.json({ success: true, message: 'Subject removed from exam' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ══════════════════════════════════════════════════════════ MARKS ENTRY ══════
// Students of a subject's class, with any marks already entered.
router.get('/subjects/:id/marks', authorize(...STAFF), async (req, res) => {
  try {
    const examSubject = await ExamSubject.findOne({ _id: req.params.id, school: req.user.school })
      .populate('subject', 'name code').populate('class', 'name section');
    if (!examSubject) return res.status(404).json({ success: false, message: 'Exam subject not found' });

    const group = await ExamGroup.findById(examSubject.examGroup).populate('gradingScheme');

    const students = await Student.find({ class: examSubject.class._id, status: 'active' })
      .populate('user', 'name')
      .sort({ rollNumber: 1 })
      .lean();

    const marks = await ExamMark.find({ examSubject: examSubject._id }).lean();
    const byStudent = new Map(marks.map(m => [String(m.student), m]));

    const rows = students.map(s => ({
      student:    s._id,
      name:       s.user?.name || '—',
      rollNumber: s.rollNumber || '',
      admissionNumber: s.admissionNumber || '',
      mark: byStudent.get(String(s._id)) || null,
    }));

    res.json({
      success: true,
      data: {
        examSubject,
        gradingScheme: group?.gradingScheme || null,
        maxMarks: svc.maxMarksFor(examSubject),
        students: rows,
      },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Bulk save marks. Body: { marks: [{ studentId, marks:{...}, graceMarks, isAbsent, remarks }], publish }
router.post('/subjects/:id/marks', authorize(...STAFF), async (req, res) => {
  try {
    const examSubject = await ExamSubject.findOne({ _id: req.params.id, school: req.user.school });
    if (!examSubject) return res.status(404).json({ success: false, message: 'Exam subject not found' });
    if (examSubject.isLocked) {
      return res.status(400).json({ success: false, message: 'Marks are locked for this subject. Ask an administrator to unlock.' });
    }

    const group  = await ExamGroup.findById(examSubject.examGroup).populate('gradingScheme');
    const scheme = group?.gradingScheme || null;
    const rows   = req.body.marks || [];
    if (!rows.length) return res.status(400).json({ success: false, message: 'No marks supplied' });

    // Validate everything before writing anything, so a bad row can't leave
    // the batch half-saved.
    const problems = [];
    rows.forEach((r, i) => {
      const errs = svc.validateMarks(r, examSubject);
      if (errs.length) problems.push(`Row ${i + 1}: ${errs.join('; ')}`);
    });
    if (problems.length) {
      return res.status(400).json({ success: false, message: 'Invalid marks', errors: problems });
    }

    const status = req.body.publish ? 'published' : 'draft';
    const ops = rows.map(r => {
      const computed = svc.computeMark(r, examSubject, scheme);
      return {
        updateOne: {
          filter: { examSubject: examSubject._id, student: r.studentId },
          update: {
            $set: {
              examGroup:   examSubject.examGroup,
              examSubject: examSubject._id,
              student:     r.studentId,
              marks:       r.marks || {},
              graceMarks:  Number(r.graceMarks || 0),
              isAbsent:    !!r.isAbsent,
              remarks:     r.remarks || '',
              ...computed,
              status,
              enteredBy:   req.user._id,
              enteredAt:   new Date(),
              school:      req.user.school,
            },
          },
          upsert: true,
        },
      };
    });

    await ExamMark.bulkWrite(ops);
    res.json({ success: true, message: req.body.publish ? 'Marks published' : 'Draft saved', count: rows.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════ RESULTS ═════
// Consolidated results for an exam group, with ranks.
router.get('/groups/:id/results', authorize(...STAFF), async (req, res) => {
  try {
    const group = await ExamGroup.findOne({ _id: req.params.id, school: req.user.school })
      .populate('gradingScheme');
    if (!group) return res.status(404).json({ success: false, message: 'Exam not found' });

    const filter = { examGroup: group._id };
    const marks = await ExamMark.find(filter)
      .populate({ path: 'student', select: 'rollNumber admissionNumber user class',
                  populate: [{ path: 'user', select: 'name' }, { path: 'class', select: 'name section' }] })
      .populate({ path: 'examSubject', populate: { path: 'subject', select: 'name code' } })
      .lean();

    // Group marks by student
    const byStudent = new Map();
    marks.forEach(m => {
      const id = String(m.student?._id || m.student);
      if (!byStudent.has(id)) byStudent.set(id, { student: m.student, subjects: [] });
      byStudent.get(id).subjects.push(m);
    });

    let results = [...byStudent.values()].map(entry => {
      const summary = svc.computeStudentResult(entry.subjects, group.gradingScheme);
      return {
        student:  entry.student,
        subjects: entry.subjects,
        ...summary,
      };
    });

    // Optional per-class ranking, otherwise rank across the whole exam
    if (req.query.classId) {
      results = results.filter(r => String(r.student?.class?._id || r.student?.class) === req.query.classId);
    }
    results = svc.assignRanks(results);

    res.json({ success: true, count: results.length, data: results });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Publish/unpublish all results for an exam
router.put('/groups/:id/publish', authorize(...ADMIN), async (req, res) => {
  try {
    const publish = req.body.publish !== false;
    const group = await ExamGroup.findOne({ _id: req.params.id, school: req.user.school });
    if (!group) return res.status(404).json({ success: false, message: 'Exam not found' });

    await ExamMark.updateMany({ examGroup: group._id }, { status: publish ? 'published' : 'draft' });
    await ExamSubject.updateMany({ examGroup: group._id }, { isLocked: publish });

    group.status = publish ? 'published' : 'completed';
    group.resultsPublishedAt = publish ? new Date() : null;
    group.resultsPublishedBy = publish ? req.user._id : null;
    await group.save();

    res.json({ success: true, message: publish ? 'Results published' : 'Results unpublished' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════ DASHBOARD ══════
router.get('/dashboard', async (req, res) => {
  try {
    const school = req.user.school;
    const now = new Date();

    const [groups, markStats] = await Promise.all([
      ExamGroup.find({ school }).populate('examType', 'name').lean(),
      ExamMark.aggregate([
        { $match: { school: require('mongoose').Types.ObjectId.createFromHexString(String(school)) } },
        { $group: { _id: null, total: { $sum: 1 },
                    passed: { $sum: { $cond: ['$isPass', 1, 0] } },
                    avgPct: { $avg: '$percentage' },
                    students: { $addToSet: '$student' } } },
      ]),
    ]);

    const upcoming  = groups.filter(g => g.startDate && new Date(g.startDate) > now).length;
    const ongoing   = groups.filter(g => g.startDate && g.endDate &&
                        new Date(g.startDate) <= now && new Date(g.endDate) >= now).length;
    const completed = groups.filter(g => g.endDate && new Date(g.endDate) < now).length;
    const published = groups.filter(g => g.status === 'published').length;

    const st = markStats[0] || {};
    const passPct = st.total ? Math.round((st.passed / st.total) * 1000) / 10 : 0;

    res.json({
      success: true,
      data: {
        totalExams: groups.length,
        upcoming, ongoing, completed, published,
        studentsAppearing: (st.students || []).length,
        passPercentage: passPct,
        schoolAverage: st.avgPct ? Math.round(st.avgPct * 10) / 10 : 0,
        pendingResultEntry: groups.filter(g => g.status !== 'published').length,
        recent: groups
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 5)
          .map(g => ({ _id: g._id, name: g.name, status: g.status, startDate: g.startDate,
                       examType: g.examType?.name || '' })),
      },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;