// backend/fms/models/notification/index.js
//
// fms_notifications      what was sent, to whom, on which channel, and whether it worked
// fms_notificationprefs  per-user narrowing of the defaults
//
// SRS M19 / FR-M19, screen SCR-64.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const DELIVERY_STATUS = [
  'pending',
  'sent',
  'failed',
  /** The channel exists in the design but not in this deployment (sms, whatsapp). */
  'notConfigured',
  /** The recipient muted this event. */
  'suppressed',
  /** In-app only: delivered and the person has seen it. */
  'read',
];

const NotificationSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },

  event: { type: String, required: true },
  channel: { type: String, required: true },

  recipient: { type: ObjectId, default: null },      // SMS User._id
  recipientEmail: { type: String },
  recipientRole: { type: String },

  subject: { type: String },
  body: { type: String },
  urgency: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },

  /** What the notification is about, so a click can open it. */
  entity: { type: String },
  entityId: { type: ObjectId, default: null },

  deliveryStatus: { type: String, enum: DELIVERY_STATUS, default: 'pending', index: true },
  /**
   * Why it did not go. Kept for BOTH failures and notConfigured, so the log
   * answers "was anyone told?" rather than merely "did we try".
   */
  statusReason: { type: String },

  sentAt: { type: Date },
  readAt: { type: Date },
  attempts: { type: Number, default: 0 },

  createdBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_notifications' });

NotificationSchema.index({ school: 1, recipient: 1, deliveryStatus: 1, createdAt: -1 });
NotificationSchema.index({ school: 1, event: 1, createdAt: -1 });
NotificationSchema.index({ school: 1, entity: 1, entityId: 1 });

// The log is evidence that somebody was — or was not — told. Marking read is
// the only permitted change.
['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  NotificationSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error(
      'fms_notifications: the notification log is evidence of who was told and ' +
      'is never deleted'
    );
  })
);

// ─────────────────────────────────────────────────────────────────────────────

const PreferenceSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  user: { type: ObjectId, required: true },
  userEmail: { type: String },

  event: { type: String, required: true },

  /**
   * Which channels this person wants. NARROWS the event's defaults and can
   * never widen them — a preference must not become a way to route payroll
   * detail to a mailbox the event was never meant to reach.
   */
  channels: [{ type: String }],
  muted: { type: Boolean, default: false },

  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_notificationprefs' });

PreferenceSchema.index({ school: 1, user: 1, event: 1 }, { unique: true });

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsNotification: reg('FmsNotification', NotificationSchema),
  FmsNotificationPreference: reg('FmsNotificationPreference', PreferenceSchema),
  DELIVERY_STATUS,
};