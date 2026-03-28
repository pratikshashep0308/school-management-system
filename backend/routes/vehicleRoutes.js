// backend/routes/vehicleRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { Vehicle } = require('../models/index');

router.use(protect);
const admin = authorize('superAdmin','schoolAdmin','transportManager');

router.get('/', async (req, res) => {
  const vehicles = await Vehicle.find({ school: req.user.school }).populate('assignedRoute','routeName').sort({ registrationNo: 1 });
  res.json({ success: true, data: vehicles });
});

router.post('/', admin, async (req, res) => {
  const exists = await Vehicle.findOne({ registrationNo: req.body.registrationNo?.toUpperCase(), school: req.user.school });
  if (exists) return res.status(400).json({ success: false, message: 'Vehicle already registered' });
  const v = await Vehicle.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: v });
});

router.put('/:id', admin, async (req, res) => {
  const v = await Vehicle.findOneAndUpdate({ _id: req.params.id, school: req.user.school }, req.body, { new: true });
  if (!v) return res.status(404).json({ success: false, message: 'Vehicle not found' });
  res.json({ success: true, data: v });
});

router.delete('/:id', admin, async (req, res) => {
  await Vehicle.findOneAndDelete({ _id: req.params.id, school: req.user.school });
  res.json({ success: true, message: 'Vehicle removed' });
});

module.exports = router;