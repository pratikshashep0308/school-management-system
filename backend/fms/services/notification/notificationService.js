// backend/fms/services/notification/notificationService.js
//
// Dispatch. SRS M19 / FR-M19, screen SCR-64.
//
// ─── THE RULE THAT MATTERS MOST ──────────────────────────────────────────────
// A NOTIFICATION MUST NEVER BE ABLE TO DISRUPT THE OPERATION THAT RAISED IT.
//
// If the mail server is down, the expense is still approved. If a recipient
// lookup fails, the payment still posts. `notify()` therefore catches
// everything, always resolves, and never rejects — a caller cannot accidentally
// couple a financial transaction to an SMTP timeout by forgetting a .catch().
//
// The cost of that choice is that a failure is invisible unless it is written
// down, so every outcome — including "nobody was told" — lands in
// fms_notifications with a reason.
//
// ─── CHANNELS ────────────────────────────────────────────────────────────────
//   email   nodemailer, using the EMAIL_* config the SMS already has
//   inApp   persisted, and emitted over socket.io if a server is attached
//   sms      not configured — recorded as such, never silently dropped
//   whatsapp not configured — same

const mongoose = require('mongoose');
const { FmsRoleAssignment } = require('../../models/core');
const { FmsNotification, FmsNotificationPreference } = require('../../models/notification');
const events = require('./events');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Set by the host app at startup if socket.io is available. */
let socketServer = null;
function attachSocketServer(io) { socketServer = io; }

/** Built lazily so a missing mail config cannot break module load. */
let transporter;
function mailTransport() {
  if (transporter !== undefined) return transporter;

  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    transporter = null;
    return null;
  }

  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: Number(EMAIL_PORT) || 587,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });
  } catch (_) {
    transporter = null;
  }
  return transporter;
}

/**
 * Who holds the roles this event is addressed to.
 *
 * Read from fms_roleassignments, which is the FMS's own record of who may do
 * what — NOT from SMS user roles. A person's SMS role does not imply they
 * should receive financial notifications.
 */
async function recipientsFor(school, roles) {
  if (!roles?.length) return [];

  // Field names follow fms_roleassignments as it actually is — smsUserId,
  // smsUserEmail, financeRole, status — which is the same shape fmsAuthorize
  // queries. An earlier version invented `user`/`fmsRole`/`isActive` and
  // matched nothing, which would have meant NOBODY WAS EVER NOTIFIED while
  // every dispatch reported success.
  const assignments = await FmsRoleAssignment.find({
    school: oid(school), financeRole: { $in: roles }, status: 'active',
  }).select('smsUserId smsUserEmail financeRole').lean();

  // One person may hold two of the addressed roles; they are told once.
  const byUser = new Map();
  for (const a of assignments) {
    const k = String(a.smsUserId || a.smsUserEmail);
    if (!byUser.has(k)) {
      byUser.set(k, { user: a.smsUserId, email: a.smsUserEmail, role: a.financeRole });
    }
  }
  return [...byUser.values()];
}

async function preferenceFor(school, user, event) {
  if (!user) return null;
  return FmsNotificationPreference.findOne({
    school: oid(school), user: oid(user), event,
  }).lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel senders. Each RESOLVES with an outcome; none throws.
// ─────────────────────────────────────────────────────────────────────────────

async function sendEmail(to, subject, body) {
  if (!to) return { status: 'failed', reason: 'no email address on file for this recipient' };

  const t = mailTransport();
  if (!t) {
    return {
      status: 'notConfigured',
      reason: 'No mail transport — EMAIL_HOST, EMAIL_USER and EMAIL_PASS must all be set',
    };
  }

  try {
    await t.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text: body,
    });
    return { status: 'sent' };
  } catch (err) {
    return { status: 'failed', reason: err.message?.slice(0, 300) };
  }
}

async function sendInApp(recipient, payload) {
  // The record IS the delivery — the socket emit is a convenience so an open
  // screen updates without a refresh. A missing socket server is not a failure.
  if (socketServer && recipient) {
    try {
      socketServer.to(`user:${recipient}`).emit('fms:notification', payload);
    } catch (_) { /* an emit failure must not fail the notification */ }
  }
  return { status: 'sent' };
}

/**
 * Raise an event.
 *
 * NEVER REJECTS. Returns a summary of what happened, which callers are free to
 * ignore — and mostly should, since a financial operation has nothing useful to
 * do about a failed email.
 */
async function notify(school, eventKey, payload = {}, options = {}) {
  const outcome = {
    event: eventKey, dispatched: 0, sent: 0, failed: 0,
    notConfigured: 0, suppressed: 0, records: [],
  };

  try {
    const message = events.compose(eventKey, payload);
    if (message.error) {
      outcome.error = message.error;
      return outcome;
    }

    const roleRecipients = await recipientsFor(school, message.roles);

    // The person who raised it, where the event says so.
    const all = [...roleRecipients];
    if (message.alsoNotifyRequester && payload.requesterId) {
      if (!all.some((r) => String(r.user) === String(payload.requesterId))) {
        all.push({
          user: payload.requesterId,
          email: payload.requesterEmail,
          role: 'requester',
        });
      }
    }

    if (!all.length) {
      // Worth recording: an event nobody is configured to receive is a gap,
      // and silence would hide it.
      await FmsNotification.create({
        school: oid(school), event: eventKey, channel: 'none',
        subject: message.subject, body: message.body, urgency: message.urgency,
        entity: payload.entity, entityId: payload.entityId || null,
        deliveryStatus: 'failed',
        statusReason: `No active user holds any of: ${message.roles.join(', ')}`,
        createdBy: options.actor,
      });
      outcome.failed += 1;
      outcome.error = 'no recipients';
      return outcome;
    }

    for (const r of all) {
      const pref = await preferenceFor(school, r.user, eventKey);
      const resolved = events.resolveChannels(eventKey, pref);

      if (resolved.suppressed) {
        await FmsNotification.create({
          school: oid(school), event: eventKey, channel: 'all',
          recipient: r.user || null, recipientEmail: r.email, recipientRole: r.role,
          subject: message.subject, body: message.body, urgency: message.urgency,
          entity: payload.entity, entityId: payload.entityId || null,
          deliveryStatus: 'suppressed',
          statusReason: 'The recipient muted this event',
          createdBy: options.actor,
        });
        outcome.suppressed += 1;
        continue;
      }

      // Channels the event wants but this deployment cannot reach.
      for (const u of resolved.unavailable) {
        await FmsNotification.create({
          school: oid(school), event: eventKey, channel: u.channel,
          recipient: r.user || null, recipientEmail: r.email, recipientRole: r.role,
          subject: message.subject, body: message.body, urgency: message.urgency,
          entity: payload.entity, entityId: payload.entityId || null,
          deliveryStatus: 'notConfigured', statusReason: u.reason,
          createdBy: options.actor,
        });
        outcome.notConfigured += 1;
      }

      for (const channel of resolved.channels) {
        outcome.dispatched += 1;

        let result;
        if (channel === 'email') {
          result = await sendEmail(r.email, message.subject, message.body);
        } else if (channel === 'inApp') {
          result = await sendInApp(r.user, {
            event: eventKey, subject: message.subject, body: message.body,
            urgency: message.urgency, entity: payload.entity, entityId: payload.entityId,
          });
        } else {
          result = { status: 'notConfigured', reason: `channel '${channel}' has no sender` };
        }

        const doc = await FmsNotification.create({
          school: oid(school), event: eventKey, channel,
          recipient: r.user || null, recipientEmail: r.email, recipientRole: r.role,
          subject: message.subject, body: message.body, urgency: message.urgency,
          entity: payload.entity, entityId: payload.entityId || null,
          deliveryStatus: result.status,
          statusReason: result.reason,
          sentAt: result.status === 'sent' ? new Date() : undefined,
          attempts: 1,
          createdBy: options.actor,
        });

        outcome.records.push(doc._id);
        if (result.status === 'sent') outcome.sent += 1;
        else if (result.status === 'failed') outcome.failed += 1;
        else if (result.status === 'notConfigured') outcome.notConfigured += 1;
      }
    }
  } catch (err) {
    // The last line of defence. Reaching here means the notification path
    // itself broke — which must still not disturb the caller.
    outcome.error = err.message;
    try {
      await FmsNotification.create({
        school: oid(school), event: eventKey, channel: 'none',
        subject: 'Notification dispatch failed', body: err.message?.slice(0, 500),
        deliveryStatus: 'failed', statusReason: 'dispatch threw',
      });
    } catch (_) { /* nothing further can be done */ }
  }

  return outcome;
}

/** What a person has waiting. */
async function inbox(school, user, { unreadOnly = false, limit = 50 } = {}) {
  const f = {
    school: oid(school), recipient: oid(user), channel: 'inApp',
    deliveryStatus: unreadOnly ? 'sent' : { $in: ['sent', 'read'] },
  };

  const [rows, unread] = await Promise.all([
    FmsNotification.find(f).sort({ createdAt: -1 }).limit(Math.min(limit, 200)).lean(),
    FmsNotification.countDocuments({
      school: oid(school), recipient: oid(user), channel: 'inApp', deliveryStatus: 'sent',
    }),
  ]);

  return { unread, count: rows.length, notifications: rows };
}

async function markRead(school, user, ids) {
  const r = await FmsNotification.updateMany(
    {
      school: oid(school), recipient: oid(user),
      _id: { $in: (ids || []).map(oid) }, deliveryStatus: 'sent',
    },
    { $set: { deliveryStatus: 'read', readAt: new Date() } }
  );
  return { marked: r.modifiedCount };
}

/** Set a preference. Validated so it can only narrow. */
async function setPreference(school, user, event, { channels, muted }, req) {
  const def = events.EVENTS[event];
  if (!def) {
    const err = new Error(`Unknown event '${event}'`);
    err.code = 'BAD_REQUEST';
    throw err;
  }

  // Silently ignoring an unusable channel would leave the user believing they
  // had enabled something.
  const invalid = (channels || []).filter((c) => !def.defaultChannels.includes(c));
  if (invalid.length) {
    const err = new Error(
      `'${event}' does not use ${invalid.join(', ')} — a preference can only narrow ` +
      `the channels an event already uses (${def.defaultChannels.join(', ')})`
    );
    err.code = 'VALIDATION';
    throw err;
  }

  return FmsNotificationPreference.findOneAndUpdate(
    { school: oid(school), user: oid(user), event },
    {
      $set: {
        channels: channels || [],
        muted: !!muted,
        userEmail: req?.user?.email,
        updatedBy: req?.user?._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Delivery summary — mostly for spotting a mail transport that has stopped working. */
async function stats(school, { from, to } = {}) {
  const match = { school: oid(school) };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) {
      const d = new Date(to); d.setUTCHours(23, 59, 59, 999);
      match.createdAt.$lte = d;
    }
  }

  const rows = await FmsNotification.aggregate([
    { $match: match },
    { $group: { _id: { channel: '$channel', status: '$deliveryStatus' }, count: { $sum: 1 } } },
  ]);

  const byChannel = {};
  for (const r of rows) {
    const c = r._id.channel;
    byChannel[c] = byChannel[c] || {};
    byChannel[c][r._id.status] = r.count;
  }

  const failed = rows.filter((r) => r._id.status === 'failed')
    .reduce((s, r) => s + r.count, 0);

  return {
    byChannel,
    totalFailed: failed,
    availableChannels: events.AVAILABLE_CHANNELS,
    unconfiguredChannels: Object.entries(events.UNAVAILABLE_REASON)
      .map(([channel, reason]) => ({ channel, reason })),
    mailConfigured: !!mailTransport(),
    warning: failed > 0
      ? `${failed} notification(s) failed to send — check the mail configuration`
      : undefined,
  };
}

module.exports = {
  notify, inbox, markRead, setPreference, stats,
  attachSocketServer, recipientsFor, mailTransport,
};