const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { Notification } = require('../models/index');

const notifRouter = express.Router();
notifRouter.use(protect);

notifRouter.get('/', async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.audience && req.query.audience !== 'all') filter.audience = { $in: [req.query.audience, 'all'] };
  const notifications = await Notification.find(filter)
    .populate('sentBy', 'name role')
    .sort({ createdAt: -1 })
    .limit(50);
  res.json({ success: true, data: notifications });
});

notifRouter.post('/', authorize('superAdmin', 'schoolAdmin', 'teacher'), async (req, res) => {
  const notification = await Notification.create({
    ...req.body,
    sentBy: req.user.id,
    school: req.user.school
  });
  res.status(201).json({ success: true, data: notification });
});

notifRouter.put('/:id/read', async (req, res) => {
  await Notification.findByIdAndUpdate(req.params.id, { $addToSet: { readBy: req.user.id } });
  res.json({ success: true, message: 'Marked as read' });
});

notifRouter.delete('/:id', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  await Notification.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Notification deleted' });
});

module.exports = notifRouter;
