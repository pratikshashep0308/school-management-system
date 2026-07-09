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