// timetableRoutes.js
const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { Timetable } = require('../models/index');

const router = express.Router();
router.use(protect);

router.get('/', async (req, res) => {
  const { classId } = req.query;
  const filter = { school: req.user.school };
  if (classId) filter.class = classId;
  const timetables = await Timetable.find(filter)
    .populate('periods.subject', 'name code')
    .populate({ path: 'periods.teacher', populate: { path: 'user', select: 'name' } })
    .sort({ day: 1 });
  res.json({ success: true, data: timetables });
});

router.post('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const tt = await Timetable.findOneAndUpdate(
    { class: req.body.class, day: req.body.day, school: req.user.school },
    { ...req.body, school: req.user.school },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.status(201).json({ success: true, data: tt });
});

router.delete('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  await Timetable.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Timetable entry deleted' });
});

module.exports = router;
