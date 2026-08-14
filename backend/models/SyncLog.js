/**
 * SyncLog — FP-071 · GAP-OFF-003 · FINAL LLD 1.1 §33
 *
 * One row per successfully-applied offline operation, keyed by the client's opId.
 * This is what makes replay idempotent: a returning opId is served from here
 * rather than re-applied. Retained long enough to cover realistic offline
 * windows; a TTL prunes old rows so the collection does not grow unbounded.
 */
const mongoose = require('mongoose');

const SyncLogSchema = new mongoose.Schema(
  {
    // Client-generated, globally unique per user. The idempotency key.
    opId: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    type: { type: String, required: true },
    fingerprint: { type: String },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One applied result per opId per user — a replay cannot create a second.
SyncLogSchema.index({ opId: 1, user: 1 }, { unique: true });
// Prune after 30 days; longer than any realistic offline window.
SyncLogSchema.index({ appliedAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

module.exports = mongoose.models.SyncLog || mongoose.model('SyncLog', SyncLogSchema);
