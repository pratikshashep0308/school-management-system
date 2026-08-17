/**
 * MessageThread / Message — FP-017 · GAP-PA-001 · FINAL LLD 1.1 §10.1
 *
 * Direct asynchronous Parent-Teacher communication. The closest existing
 * features are the one-way broadcast Notification and the scheduled Meeting, so
 * this is genuinely new.
 *
 * ── Safeguarding ────────────────────────────────────────────────────────────
 * `schoolVisible` defaults true: the conversation is presented as private
 * between parent and teacher, but remains readable by the school for
 * safeguarding and audit.
 *
 * The flag alone is not the control. Visibility must be enforced by the READ
 * AUTHORIZATION — a schoolAdmin read path must exist and be permission-gated —
 * because a boolean nobody checks protects nobody.
 */
const mongoose = require('mongoose');

const MessageThreadSchema = new mongoose.Schema(
  {
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // The child the conversation concerns. Required — a thread with no student
    // context cannot be safeguarding-reviewed meaningfully.
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },

    subject: { type: String, trim: true },
    lastMessageAt: { type: Date, default: Date.now },
    schoolVisible: { type: Boolean, default: true },
    status: { type: String, enum: ['open', 'archived'], default: 'open' },

    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  },
  { timestamps: true }
);

MessageThreadSchema.index({ school: 1, parent: 1, lastMessageAt: -1 });
MessageThreadSchema.index({ school: 1, teacher: 1, lastMessageAt: -1 });
MessageThreadSchema.index({ school: 1, student: 1 });

const MessageSchema = new mongoose.Schema(
  {
    thread: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageThread', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true },
    attachments: { type: [String], default: [] },
    readBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    sentAt: { type: Date, default: Date.now },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  },
  { timestamps: true }
);

MessageSchema.index({ thread: 1, sentAt: 1 });

/**
 * Append-only. Editing a sent message is not supported in this release — a
 * safeguarding record that can be rewritten after the fact is not a record.
 */
MessageSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified('body')) {
    return next(
      new Error(
        'MESSAGE_IMMUTABLE: a sent message cannot be edited. Send a follow-up message instead.'
      )
    );
  }
  return next();
});

module.exports =
  mongoose.models.MessageThread || mongoose.model('MessageThread', MessageThreadSchema);
module.exports.Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);
