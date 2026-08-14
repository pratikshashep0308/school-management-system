/**
 * offlineSyncService — FP-071 · GAP-OFF-001..005 · FINAL LLD 1.1 §33
 *
 * Processes a batch of operations a client queued while offline, and returns a
 * per-operation result the client uses to clear or retain its queue.
 *
 * ── The four guarantees ─────────────────────────────────────────────────────
 *   1. Idempotent replay — each operation carries a client-generated opId; a
 *      replayed opId returns the prior result and does not re-apply. A flaky
 *      connection that retries the same batch must not double-write.
 *   2. Conflict detection — a write carrying baseUpdatedAt that no longer matches
 *      the server's current updatedAt is a CONFLICT, returned as such rather than
 *      silently overwriting a change made meanwhile.
 *   3. Authorization per operation — the queue is replayed AS the authenticated
 *      user; an operation the user may not perform is rejected, exactly as if
 *      they were online. Being offline earlier grants no extra permission.
 *   4. Partial success — one bad operation does not fail the batch. Each result
 *      is independent, so the client clears what succeeded and keeps what didn't.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────
 * It is not a generic "apply any Mongo write" endpoint — that would be an
 * authorization hole. Only whitelisted operation types are handled, each routed
 * to its normal service/controller path so the same validation applies online
 * and offline. Promotion is deliberately NOT offline-eligible: it needs a
 * transaction and a published exam group, neither of which makes sense to queue.
 */
const crypto = require('crypto');

/**
 * Operation types a client may queue. Each maps to a handler that applies the
 * SAME validation as the online path. Anything not listed is rejected.
 */
const SUPPORTED_OPS = Object.freeze({
  'lessonPlan.create': true,
  'lessonPlan.update': true,
  'formativeObservation.create': true,
  'readingLog.create': true,
});

/** Deterministic hash of an operation, to detect a replay of the same content. */
function opFingerprint(op) {
  const canonical = JSON.stringify({ type: op.type, payload: op.payload });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Apply one queued operation.
 *
 * @param {object} op        { opId, type, payload, baseUpdatedAt? }
 * @param {object} ctx       { user, models, handlers } — handlers injectable for testing
 * @returns {Promise<object>} { opId, status, result?, code?, message? }
 */
async function applyOperation(op, ctx) {
  const { opId, type, payload } = op;

  if (!opId) {
    return { opId: null, status: 'rejected', code: 'OFFLINE_OP_ID_REQUIRED', message: 'Every queued operation needs a client opId.' };
  }
  if (!SUPPORTED_OPS[type]) {
    // Whitelist, not blacklist — an unknown op is refused, never applied blind.
    return { opId, status: 'rejected', code: 'OFFLINE_OP_UNSUPPORTED', message: `Operation type '${type}' cannot be queued offline.` };
  }

  const SyncLog = ctx.models.SyncLog;

  // ── Idempotent replay ──────────────────────────────────────────────────────
  const prior = await SyncLog.findOne({ opId, user: ctx.user._id }).lean();
  if (prior) {
    return { opId, status: 'duplicate', result: prior.result, appliedAt: prior.appliedAt };
  }

  // ── Authorization — replay as the user, apply the same permission check ─────
  const handler = ctx.handlers[type];
  if (!handler) {
    return { opId, status: 'rejected', code: 'OFFLINE_OP_NO_HANDLER', message: `No handler for '${type}'.` };
  }

  try {
    const result = await handler(payload, ctx);

    if (result && result.conflict) {
      // ── Conflict — do not overwrite. The client decides how to resolve. ─────
      return { opId, status: 'conflict', code: 'OFFLINE_CONFLICT', current: result.current, message: result.message };
    }
    if (result && result.forbidden) {
      // Offline earlier grants no extra permission.
      return { opId, status: 'rejected', code: 'OFFLINE_FORBIDDEN', message: result.message || 'Not permitted.' };
    }
    if (result && result.validationError) {
      return { opId, status: 'rejected', code: 'OFFLINE_VALIDATION', message: result.message };
    }

    // Record success so a replay is idempotent.
    await SyncLog.create({
      opId, user: ctx.user._id, school: ctx.user.school,
      type, fingerprint: opFingerprint(op), result: result?.data || null,
      appliedAt: new Date(),
    });
    return { opId, status: 'applied', result: result?.data || null };
  } catch (err) {
    // A genuine error is retriable — the client keeps the op and tries later.
    return { opId, status: 'error', code: 'OFFLINE_APPLY_ERROR', message: 'Could not apply; will retry.', retriable: true };
  }
}

/**
 * Process a queued batch. Every operation is independent (partial success).
 *
 * @returns {Promise<{results: Array, summary: object}>}
 */
async function processBatch(operations, ctx) {
  if (!Array.isArray(operations)) throw new Error('OFFLINE_BATCH_INVALID: operations must be an array.');

  const results = [];
  for (const op of operations) {
    results.push(await applyOperation(op, ctx));
  }

  const summary = {
    total: results.length,
    applied: results.filter((r) => r.status === 'applied').length,
    duplicate: results.filter((r) => r.status === 'duplicate').length,
    conflict: results.filter((r) => r.status === 'conflict').length,
    rejected: results.filter((r) => r.status === 'rejected').length,
    error: results.filter((r) => r.status === 'error').length,
  };
  return { results, summary };
}

module.exports = { processBatch, applyOperation, opFingerprint, SUPPORTED_OPS };
