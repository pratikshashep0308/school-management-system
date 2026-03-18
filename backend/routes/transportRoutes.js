const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { Transport } = require('../models/index');
const Student = require('../models/Student');

router.use(protect);

router.get('/', async (req, res) => {
  const routes = await Transport.find({ school: req.user.school })
    .populate({ path: 'students', populate: { path: 'user', select: 'name' } });
  res.json({ success: true, data: routes });
});

router.get('/:id', async (req, res) => {
  const route = await Transport.findById(req.params.id)
    .populate({ path: 'students', populate: { path: 'user', select: 'name profileImage' } });
  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
  res.json({ success: true, data: route });
});

router.post('/', authorize('superAdmin', 'schoolAdmin', 'transportManager'), async (req, res) => {
  const route = await Transport.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: route });
});

router.put('/:id', authorize('superAdmin', 'schoolAdmin', 'transportManager'), async (req, res) => {
  const route = await Transport.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: route });
});

router.delete('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  await Transport.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Route deleted' });
});

router.post('/:id/assign-student', authorize('superAdmin', 'schoolAdmin', 'transportManager'), async (req, res) => {
  await Transport.findByIdAndUpdate(req.params.id, { $addToSet: { students: req.body.studentId } });
  await Student.findByIdAndUpdate(req.body.studentId, { transportRoute: req.params.id });
  res.json({ success: true, message: 'Student assigned to route' });
});

module.exports = router;
