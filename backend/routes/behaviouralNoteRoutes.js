const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const BehaviouralNote = require('../models/BehaviouralNote');

router.use(protect);

const STAFF = ['superAdmin', 'schoolAdmin', 'teacher'];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// GET /api/behavioural-notes  — staff: list all notes (for the Behaviour module)
//   ?date=YYYY-MM-DD   → only that day
//   ?classId=<id>      → only students in that class
//   ?category=positive → filter by category
// Returns newest first, with student + class populated.
router.get('/', authorize(...STAFF), async (req, res) => {
  try {
    const Student = require('../models/Student');
    const filter = { school: req.user.school };

    if (req.query.date) {
      const day = startOfDay(req.query.date);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      filter.date = { $gte: day, $lt: next };
    }
    if (req.query.category) filter.category = req.query.category;

    // Narrow to a class by first finding that class's students
    if (req.query.classId) {
      const ids = await Student.find({ class: req.query.classId, school: req.user.school })
        .distinct('_id');
      filter.student = { $in: ids };
    }

    const notes = await BehaviouralNote.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(500)
      .populate({
        path: 'student',
        select: 'rollNumber class user',
        populate: [
          { path: 'user',  select: 'name' },
          { path: 'class', select: 'name section' },
        ],
      });

    res.json({ success: true, data: notes });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/behavioural-notes/roster?classId=<id>&date=YYYY-MM-DD
// Staff: every student in the class, each with their note for that day (or null).
// This powers the "Class Roster" daily-entry view.
router.get('/roster', authorize(...STAFF), async (req, res) => {
  try {
    const Student = require('../models/Student');
    const { classId } = req.query;
    if (!classId) {
      return res.status(400).json({ success: false, message: 'classId is required' });
    }

    const day  = startOfDay(req.query.date || new Date());
    const next = new Date(day);
    next.setDate(next.getDate() + 1);

    const students = await Student.find({ class: classId, school: req.user.school })
      .select('rollNumber user')
      .populate('user', 'name')
      .sort({ rollNumber: 1 });

    const notes = await BehaviouralNote.find({
      school:  req.user.school,
      student: { $in: students.map(s => s._id) },
      date:    { $gte: day, $lt: next },
    });

    const noteMap = {};
    notes.forEach(n => { noteMap[n.student.toString()] = n; });

    const roster = students.map(s => {
      const n = noteMap[s._id.toString()];
      return {
        student:    s._id,
        name:       s.user?.name || s.name || 'Student',
        rollNumber: s.rollNumber || '',
        noteId:     n ? n._id : null,
        note:       n ? n.note : '',
        category:   n ? n.category : 'general',
        createdByName: n ? n.createdByName : '',
      };
    });

    res.json({ success: true, data: roster, date: day });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/behavioural-notes/:studentId
//   ?date=YYYY-MM-DD  → that day's note only (defaults to today)
//   ?history=1        → full history for the student (newest first)
router.get('/:studentId', authorize(...STAFF, 'student', 'parent'), async (req, res) => {
  try {
    const filter = { student: req.params.studentId, school: req.user.school };

    if (req.query.history) {
      const notes = await BehaviouralNote.find(filter).sort({ date: -1 });
      return res.json({ success: true, data: notes });
    }

    const day = startOfDay(req.query.date || new Date());
    const note = await BehaviouralNote.findOne({ ...filter, date: day });
    res.json({ success: true, data: note || null });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/behavioural-notes  — create/update today's (or given date's) note (staff only)
// body: { studentId, note, category?, date? }
router.post('/', authorize(...STAFF), async (req, res) => {
  try {
    const { studentId, note, category, date } = req.body;
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId is required' });
    if (note == null || String(note).trim() === '') {
      return res.status(400).json({ success: false, message: 'Note cannot be empty' });
    }

    const day = startOfDay(date || new Date());
    const saved = await BehaviouralNote.findOneAndUpdate(
      { student: studentId, school: req.user.school, date: day },
      {
        $set: {
          note: String(note).trim(),
          category: category || 'general',
          createdBy: req.user._id,
          createdByName: req.user.name || '',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ success: true, message: 'Behavioural note saved', data: saved });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/behavioural-notes/:id  (staff only)
router.delete('/:id', authorize(...STAFF), async (req, res) => {
  try {
    await BehaviouralNote.findOneAndDelete({ _id: req.params.id, school: req.user.school });
    res.json({ success: true, message: 'Note deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;