const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { Subject } = require('../models/index');

const router = express.Router();
router.use(protect);

router.get('/', async (req, res) => {
  const subjects = await Subject.find({ school: req.user.school }).sort({ name: 1 });
  res.json({ success: true, data: subjects });
});
router.post('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const subject = await Subject.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: subject });
});
router.put('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: subject });
});
router.delete('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  await Subject.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Subject deleted' });
});

module.exports = router;
