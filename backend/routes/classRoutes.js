const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { Class } = require('../models/index');

router.use(protect);

router.get('/', async (req, res) => {
  const classes = await Class.find({ school: req.user.school })
    .populate({ path: 'classTeacher', populate: { path: 'user', select: 'name' } })
    .populate('subjects', 'name code')
    .sort({ grade: 1, section: 1 });
  res.json({ success: true, data: classes });
});

router.get('/:id', async (req, res) => {
  const cls = await Class.findById(req.params.id)
    .populate({ path: 'classTeacher', populate: { path: 'user', select: 'name email' } })
    .populate('subjects', 'name code type')
    .populate({ path: 'students', populate: { path: 'user', select: 'name profileImage' } });
  if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });
  res.json({ success: true, data: cls });
});

router.post('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const cls = await Class.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: cls });
});

router.put('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const cls = await Class.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });
  res.json({ success: true, data: cls });
});

router.delete('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  await Class.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Class deleted' });
});

module.exports = router;
