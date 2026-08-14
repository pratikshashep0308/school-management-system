/**
 * AuditLog — BP-014 · GAP-AUD-001 · LLD §10.8, §14, §17.11
 *
 * The centralised audit trail. Highest fan-out item in Phase 1: seven downstream
 * Must requirements depend on it (GAP-IAM-005, GAP-AUD-003/004, GAP-AI-004,
 * GAP-CON-004, GAP-PC-003, GAP-TC-005).
 *
 * ADDITIVE ONLY. This does not replace the five existing embedded logs —
 * AttendanceSubmission.auditLog, Expense.editHistory, Notification.actionLog,
 * FeeEditRequest history, and ExamMark.corrections[]. Those remain authoritative
 * for their own modules and are read, never written or migrated, by the audit
 * console aggregation (BP-085).
 */
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Snapshotted so history stays readable after a user is renamed, reassigned
    // or deleted. An audit trail that degrades when its subject changes is not
    // an audit trail.
    actorNameSnapshot: { type: String },
    actorRoleSnapshot: { type: String },

    action: { type: String, required: true },
    module: { type: String, required: true },

    recordRef: {
      collection: { type: String },
      id: { type: mongoose.Schema.Types.ObjectId },
    },

    // Recorded only where a record is mutated. Creation records `after` alone.
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },

    source: {
      type: String,
      enum: ['ui', 'api', 'job', 'sync', 'migration'],
      default: 'api',
    },
    correlationId: { type: String },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

AuditLogSchema.index({ school: 1, timestamp: -1 });
AuditLogSchema.index({ school: 1, module: 1, timestamp: -1 });
AuditLogSchema.index({ school: 1, actor: 1, timestamp: -1 });
AuditLogSchema.index({ 'recordRef.id': 1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
