// backend/fms/routes/notifications.js
//
// Notifications — SRS M19 / FR-M19, screen SCR-64.
//
// ─── OWN-RESOURCE ROUTES USE fmsResolveScope, NOT fmsAuthorize ───────────────
// "Can you read your own inbox" is not a module permission. fmsResolveScope
// denies anyone without an active FMS role and sets req.fmsRole and
// req.fmsScope — it simply does not check a module.
//
// These routes previously checked `req.fmsRole` by hand with no middleware at
// all. Nothing else sets that field, so it was always undefined and every one
// of them threw: the inbox was unreachable. The service tests passed because
// they exercise the service, not the route.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { fmsResolveScope } = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const svc = require('../services/notification/notificationService');
const events = require('../services/notification/events');
const { ok, paginated, parsePagination, validate, check, errors } = require('../utils/apiResponse');
const { FmsNotification } = require('../models/notification');

/**
 * GET /api/fms/notifications
 * A person's own inbox. No module permission — everyone can read what was sent
 * TO THEM, and nothing else.
 */
router.get('/', fmsResolveScope(), asyncHandler(async (req, res) => {
  return ok(res, await svc.inbox(req.fmsScope.school, req.user._id, {
    unreadOnly: req.query.unread === 'true',
    limit: parseInt(req.query.limit, 10) || 50,
  }));
}));

router.post('/read', fmsResolveScope(), asyncHandler(async (req, res) => {
  validate(req.body, { ids: { required: true, rules: [check.array] } });
  return ok(res, await svc.markRead(req.fmsScope.school, req.user._id, req.body.ids));
}));

/** GET /api/fms/notifications/events — what can be subscribed to. */
router.get('/events', fmsResolveScope(), asyncHandler(async (req, res) => {
  return ok(res, {
    events: Object.values(events.EVENTS).map((e) => ({
      key: e.key, label: e.label, roles: e.roles,
      channels: e.defaultChannels, urgency: e.urgency,
    })),
    availableChannels: events.AVAILABLE_CHANNELS,
    unconfiguredChannels: Object.entries(events.UNAVAILABLE_REASON)
      .map(([channel, reason]) => ({ channel, reason })),
  });
}));

/**
 * PUT /api/fms/notifications/preferences
 * A preference can only NARROW what an event already sends.
 */
router.put('/preferences', fmsResolveScope(), asyncHandler(async (req, res) => {
  validate(req.body, {
    event: { required: true, rules: [check.nonEmpty] },
    channels: { rules: [check.array] },
    muted: { rules: [check.boolean] },
  });

  try {
    const doc = await svc.setPreference(
      req.fmsScope.school, req.user._id, req.body.event, req.body, req
    );
    return ok(res, doc, { message: 'Preference saved' });
  } catch (err) {
    if (err.code === 'VALIDATION') throw errors.validation('Validation failed', { channels: err.message });
    if (err.code === 'BAD_REQUEST') throw errors.badRequest(err.message);
    throw err;
  }
}));

router.get('/preferences', fmsResolveScope(), asyncHandler(async (req, res) => {
  const { FmsNotificationPreference } = require('../models/notification');
  return ok(res, await FmsNotificationPreference.find({
    school: req.fmsScope.school, user: req.user._id,
  }).lean());
}));

// ─── Administrative views ────────────────────────────────────────────────────

/**
 * GET /api/fms/notifications/log — everything sent, for anyone who can see the
 * audit trail. Includes what was NOT sent and why.
 */
router.get('/log', fmsAuthorize('audit', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ['createdAt', 'event'], defaultSort: '-createdAt',
  });

  const filter = { school: req.fmsScope.school };
  if (req.query.event) filter.event = req.query.event;
  if (req.query.channel) filter.channel = req.query.channel;
  if (req.query.deliveryStatus) filter.deliveryStatus = req.query.deliveryStatus;

  const [items, total] = await Promise.all([
    FmsNotification.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsNotification.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
}));

/** GET /api/fms/notifications/stats — is anything actually being delivered? */
router.get('/stats', fmsAuthorize('audit', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await svc.stats(req.fmsScope.school, {
    from: req.query.from, to: req.query.to,
  }));
}));

module.exports = router;