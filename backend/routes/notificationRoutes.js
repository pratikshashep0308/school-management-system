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
  // Dashboard passes excludeResolved=true so handled alerts drop off it while
  // remaining visible here in the Notifications module.
  if (req.query.excludeResolved === 'true') {
    filter.$or = [
      { actionStatus: { $exists: false } },
      { actionStatus: { $ne: 'resolved' } },
    ];
  }
  if (req.query.actionStatus) filter.actionStatus = req.query.actionStatus;

  // Audience filtering — show 'all' audience + user's specific audience
  const roleAudienceMap = { student: 'students', teacher: 'teachers', parent: 'parents' };
  const myAudience = roleAudienceMap[req.user.role];
  if (myAudience) filter.audience = { $in: ['all', myAudience] };

  const notifications = await Notification.find(filter)
    .populate('sentBy', 'name role')
    .populate('actionBy', 'name role')
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
// ── RECORD ACTION TAKEN on an alert ──────────────────────────────────────────
// Body: { actionStatus, actionDetails }
// Every change is appended to actionLog with the user and timestamp.
const ACTION_STATUSES = ['pending', 'resolved', 'in_progress', 'no_action_required'];

router.put('/:id/action', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  try {
    const { actionStatus, actionDetails = '' } = req.body;
    if (!ACTION_STATUSES.includes(actionStatus)) {
      return res.status(400).json({
        success: false,
        message: `actionStatus must be one of: ${ACTION_STATUSES.join(', ')}`,
      });
    }

    const n = await Notification.findOne({ _id: req.params.id, school: req.user.school });
    if (!n) return res.status(404).json({ success: false, message: 'Notification not found' });

    n.actionStatus  = actionStatus;
    n.actionDetails = actionDetails;
    n.actionBy      = req.user._id;
    n.actionByName  = req.user.name;
    n.actionAt      = new Date();
    n.actionLog     = n.actionLog || [];
    n.actionLog.push({
      status:   actionStatus,
      details:  actionDetails,
      user:     req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      at:       new Date(),
    });
    await n.save();

    res.json({ success: true, message: 'Action recorded', data: n });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

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