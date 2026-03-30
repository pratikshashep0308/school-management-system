// backend/routes/notificationRoutes.js
const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { Notification } = require('../models/index');

const router = express.Router();
router.use(protect);

// ── GET notifications ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;
  if (req.query.priority) filter.priority = req.query.priority;

  // Audience filtering — show 'all' audience + user's specific audience
  const roleAudienceMap = { student: 'students', teacher: 'teachers', parent: 'parents' };
  const myAudience = roleAudienceMap[req.user.role];
  if (myAudience) filter.audience = { $in: ['all', myAudience] };

  const notifications = await Notification.find(filter)
    .populate('sentBy', 'name role')
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({ success: true, data: notifications });
});

// ── CREATE notification ───────────────────────────────────────────────────────
router.post('/', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  const notification = await Notification.create({
    ...req.body,
    sentBy: req.user.id,
    school: req.user.school,
  });

  await notification.populate('sentBy', 'name role');

  // Emit real-time socket event if io is available
  const io = req.app.get('io');
  if (io) {
    io.to('school_' + req.user.school).emit('notification:new', {
      ...notification.toObject(),
      isRealTime: true,
    });
  }

  res.status(201).json({ success: true, data: notification });
});

// ── MARK READ ─────────────────────────────────────────────────────────────────
router.put('/:id/read', async (req, res) => {
  await Notification.findByIdAndUpdate(req.params.id, { $addToSet: { readBy: req.user.id } });
  res.json({ success: true, message: 'Marked as read' });
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  await Notification.findOneAndDelete({ _id: req.params.id, school: req.user.school });
  res.json({ success: true, message: 'Notification deleted' });
});

// ── BULK DELETE (admin) ───────────────────────────────────────────────────────
router.delete('/bulk/old', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await Notification.deleteMany({ school: req.user.school, createdAt: { $lt: thirtyDaysAgo } });
  res.json({ success: true, message: `Deleted ${result.deletedCount} old notifications` });
});

// ── STATS ─────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const school = req.user.school;
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const [total, todayCount, urgent] = await Promise.all([
    Notification.countDocuments({ school }),
    Notification.countDocuments({ school, createdAt: { $gte: today } }),
    Notification.countDocuments({ school, priority: 'urgent' }),
  ]);
  res.json({ success: true, data: { total, today: todayCount, urgent } });
});

module.exports = router;