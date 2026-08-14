/**
 * auditService — BP-014 · GAP-AUD-001 · LLD §14
 *
 * One entry point for audit writes. New modules must not construct AuditLog
 * documents ad hoc, or the shapes diverge and the console cannot aggregate them.
 *
 * Deliberate design choice: audit() NEVER throws into the caller's path. Losing
 * an audit entry is bad; rolling back a legitimate business operation because the
 * audit write failed is worse. Failures are logged and counted so they surface in
 * observability (§25) rather than vanishing.
 */
const mongoose = require('mongoose');
require('../models/AuditLog');

const stats = { written: 0, failed: 0 };

/** Shallow before/after diff — only keys whose values actually changed. */
function diff(before, after) {
  if (!before || !after) return { before: before || null, after: after || null };
  const b = {};
  const a = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const bv = before[k];
    const av = after[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[k] = bv;
      a[k] = av;
    }
  }
  return { before: b, after: a };
}

/**
 * @param {object} entry
 * @param {object} [entry.actor]        User document or {_id, name, role}
 * @param {string} entry.action         e.g. 'PROMOTION_CONFIRMED'
 * @param {string} entry.module         moduleKey the action belongs to
 * @param {object} [entry.recordRef]    {collectionName, id}
 * @param {object} [entry.before]       prior state (updates only)
 * @param {object} [entry.after]        new state
 * @param {string} [entry.source]       'ui'|'api'|'job'|'sync'|'migration'
 * @param {string} [entry.correlationId]
 * @param {*}      entry.school
 * @returns {Promise<object|null>} the created document, or null on failure
 */
async function audit(entry) {
  try {
    const AuditLog = mongoose.model('AuditLog');
    const actor = entry.actor || {};
    const changed =
      entry.before !== undefined && entry.after !== undefined
        ? diff(entry.before, entry.after)
        : { before: entry.before, after: entry.after };

    const doc = await AuditLog.create({
      actor: actor._id || entry.actorId || undefined,
      actorNameSnapshot: actor.name || entry.actorName,
      actorRoleSnapshot: actor.role || entry.actorRole,
      action: entry.action,
      module: entry.module,
      recordRef: entry.recordRef,
      before: changed.before,
      after: changed.after,
      source: entry.source || 'api',
      correlationId: entry.correlationId,
      school: entry.school,
      timestamp: entry.timestamp || new Date(),
    });
    stats.written += 1;
    return doc;
  } catch (err) {
    stats.failed += 1;
    // Never rethrow. See the module comment.
    console.error(
      `[audit] write failed (${stats.failed} total): ${err.message} ` +
        `— action=${entry && entry.action} module=${entry && entry.module}`
    );
    return null;
  }
}

const getStats = () => ({ ...stats });
const resetStats = () => {
  stats.written = 0;
  stats.failed = 0;
};

module.exports = { audit, diff, getStats, resetStats };
