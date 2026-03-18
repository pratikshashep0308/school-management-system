const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { FeeStructure, FeePayment } = require('../models/index');

router.use(protect);

// Fee Structures
router.get('/structures', async (req, res) => {
  const structures = await FeeStructure.find({ school: req.user.school })
    .populate('class', 'name grade section');
  res.json({ success: true, data: structures });
});

router.post('/structures', authorize('superAdmin', 'schoolAdmin', 'accountant'), async (req, res) => {
  const structure = await FeeStructure.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: structure });
});

router.put('/structures/:id', authorize('superAdmin', 'schoolAdmin', 'accountant'), async (req, res) => {
  const structure = await FeeStructure.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: structure });
});

// Fee Payments
router.get('/payments', async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.studentId) filter.student = req.query.studentId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.month) filter.month = req.query.month;

  const payments = await FeePayment.find(filter)
    .populate({ path: 'student', populate: { path: 'user', select: 'name profileImage' } })
    .populate('feeStructure', 'name amount')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: payments });
});

router.post('/payments', authorize('superAdmin', 'schoolAdmin', 'accountant'), async (req, res) => {
  const payment = await FeePayment.create({
    ...req.body,
    school: req.user.school,
    collectedBy: req.user.id
  });
  res.status(201).json({ success: true, data: payment });
});

// Fee summary stats
router.get('/summary', authorize('superAdmin', 'schoolAdmin', 'accountant'), async (req, res) => {
  const school = req.user.school;
  const monthStart = new Date(new Date().setDate(1));
  monthStart.setHours(0,0,0,0);

  const [collected, pending, overdue] = await Promise.all([
    FeePayment.aggregate([
      { $match: { school, status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    FeePayment.countDocuments({ school, status: 'pending' }),
    FeePayment.countDocuments({ school, status: 'overdue' })
  ]);

  res.json({
    success: true,
    data: {
      totalCollected: collected[0]?.total || 0,
      pendingCount: pending,
      overdueCount: overdue
    }
  });
});

module.exports = router;
