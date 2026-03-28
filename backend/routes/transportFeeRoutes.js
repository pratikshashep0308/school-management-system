// backend/routes/transportFeeRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { TransportFee2 } = require('../models/index');

router.use(protect);
const admin = authorize('superAdmin','schoolAdmin','accountant','transportManager');

router.get('/', async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.status) filter.status = req.query.status;
  const fees = await TransportFee2.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: fees });
});

router.post('/', admin, async (req, res) => {
  const fee = await TransportFee2.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: fee });
});

router.put('/:id/pay', admin, async (req, res) => {
  const fee = await TransportFee2.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $set: { status: 'paid', paidDate: new Date() } },
    { new: true }
  );
  if (!fee) return res.status(404).json({ success: false, message: 'Fee record not found' });
  res.json({ success: true, data: fee });
});

router.delete('/:id', admin, async (req, res) => {
  await TransportFee2.findOneAndDelete({ _id: req.params.id, school: req.user.school });
  res.json({ success: true, message: 'Fee record deleted' });
});

module.exports = router;