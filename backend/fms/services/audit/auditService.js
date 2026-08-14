// backend/fms/services/audit/auditService.js
//
// Audit Trail. SRS M17 / FR-M17, screen SCR-61.
//
// ─── WHAT ALREADY EXISTS ─────────────────────────────────────────────────────
// Recording is done. Thirty-one services write to fms_audittrail with actor,
// role, IP, user agent, and before/after snapshots. This module does not add a
// second way of writing — it makes the trail READABLE, and it proves the
// claims made about it.
//
// ─── THE CLAIM THAT NEEDED PROVING ───────────────────────────────────────────
// "No hard deletes anywhere" was documented and was NOT TRUE — sixteen models
// permitted them, including fms_vouchers (deleting a header orphans its ledger
// entries) and fms_ingeststate (deleting a row releases an idempotency key and
// causes double-posting). deleteGuards.test.js now enumerates every model, so
// the claim is checked rather than asserted.

const mongoose = require('mongoose');
const { FmsAuditTrail } = require('../../models/core');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** FR-M17: ten-year retention. Nothing is purged before this. */
const RETENTION_YEARS = 10;

/**
 * Record an audit entry.
 *
 * Provided so new code has one obvious way to do it. Existing services write
 * directly and equivalently — refactoring thirty-one call sites would risk more
 * than it would gain, and the shape they write is identical.
 */
async function record({ school, entity, entityId, action, before, after, req, notes }) {
  return FmsAuditTrail.create({
    school: oid(school),
    entity,
    entityId,
    action,
    before,
    after,
    actor: req?.user?._id,
    actorEmail: req?.user?.email,
    actorRole: req?.fmsRole,
    ipAddress: req?.ip,
    userAgent: req?.get?.('user-agent'),
    notes,
  });
}

/**
 * What changed between two snapshots.
 *
 * Comparing whole documents is what makes an audit trail unreadable — every
 * entry looks like a wall of unchanged fields. This reduces it to the fields
 * that actually moved.
 */
function diff(before, after) {
  if (!before && !after) return [];
  const NOISE = new Set(['updatedAt', 'createdAt', '__v', 'updatedBy']);

  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);

  const changes = [];
  for (const k of keys) {
    if (NOISE.has(k)) continue;
    const b = before?.[k];
    const a = after?.[k];

    const bs = b === undefined ? undefined : JSON.stringify(b);
    const as = a === undefined ? undefined : JSON.stringify(a);
    if (bs === as) continue;

    changes.push({
      field: k,
      from: b === undefined ? null : b,
      to: a === undefined ? null : a,
      // Worth flagging: a money field moving is different from a note changing.
      isMoney: /amount|debit|credit|total|balance|salary|paise/i.test(k),
    });
  }

  return changes.sort((x, y) => (y.isMoney - x.isMoney) || x.field.localeCompare(y.field));
}

/** Search the trail (SCR-61). */
async function query(school, filters = {}, page = {}) {
  const f = { school: oid(school) };

  if (filters.entity) f.entity = filters.entity;
  if (filters.entityId) {
    if (!mongoose.isValidObjectId(filters.entityId)) {
      throw errors.badRequest('Invalid entityId');
    }
    f.entityId = oid(filters.entityId);
  }
  if (filters.action) f.action = filters.action;
  if (filters.actor) {
    if (!mongoose.isValidObjectId(filters.actor)) throw errors.badRequest('Invalid actor id');
    f.actor = oid(filters.actor);
  }
  if (filters.actorEmail) f.actorEmail = new RegExp(escapeRe(filters.actorEmail), 'i');
  if (filters.actorRole) f.actorRole = filters.actorRole;
  if (filters.ipAddress) f.ipAddress = filters.ipAddress;

  if (filters.from || filters.to) {
    f.createdAt = {};
    if (filters.from) f.createdAt.$gte = new Date(filters.from);
    if (filters.to) {
      const d = new Date(filters.to);
      d.setUTCHours(23, 59, 59, 999);
      f.createdAt.$lte = d;
    }
  }

  const limit = Math.min(page.limit || 50, 200);
  const skip = page.skip || 0;

  const [rows, total] = await Promise.all([
    FmsAuditTrail.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    FmsAuditTrail.countDocuments(f),
  ]);

  return {
    total,
    count: rows.length,
    entries: rows.map((r) => ({
      _id: r._id,
      entity: r.entity,
      entityId: r.entityId,
      action: r.action,
      actorEmail: r.actorEmail,
      actorRole: r.actorRole,
      ipAddress: r.ipAddress,
      at: r.createdAt,
      notes: r.notes,
      changes: diff(r.before, r.after),
      // The raw snapshots stay available but are not the default view — an
      // entry with forty unchanged fields is unreadable.
      hasSnapshots: !!(r.before || r.after),
    })),
  };
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One entry with its full before/after, for when the diff is not enough. */
async function detail(school, id) {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid id');
  const r = await FmsAuditTrail.findOne({ _id: id, school: oid(school) }).lean();
  if (!r) throw errors.notFound('Audit entry');

  return {
    ...r,
    changes: diff(r.before, r.after),
  };
}

/**
 * The full history of one document, oldest first.
 *
 * This is the question people actually ask: "what happened to this voucher?"
 */
async function history(school, entity, entityId) {
  if (!mongoose.isValidObjectId(entityId)) throw errors.badRequest('Invalid entityId');

  const rows = await FmsAuditTrail.find({
    school: oid(school), entity, entityId: oid(entityId),
  }).sort({ createdAt: 1 }).lean();

  return {
    entity,
    entityId,
    count: rows.length,
    timeline: rows.map((r) => ({
      action: r.action,
      at: r.createdAt,
      actorEmail: r.actorEmail,
      actorRole: r.actorRole,
      ipAddress: r.ipAddress,
      changes: diff(r.before, r.after),
      notes: r.notes,
    })),
  };
}

/** Who has been doing what — for spotting the unusual. */
async function activity(school, { from, to } = {}) {
  const match = { school: oid(school) };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) {
      const d = new Date(to); d.setUTCHours(23, 59, 59, 999);
      match.createdAt.$lte = d;
    }
  }

  const [byActor, byAction, byEntity] = await Promise.all([
    FmsAuditTrail.aggregate([
      { $match: match },
      { $group: { _id: { email: '$actorEmail', role: '$actorRole' }, count: { $sum: 1 },
        last: { $max: '$createdAt' } } },
      { $sort: { count: -1 } }, { $limit: 50 },
    ]),
    FmsAuditTrail.aggregate([
      { $match: match },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    FmsAuditTrail.aggregate([
      { $match: match },
      { $group: { _id: '$entity', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    period: { from: from || null, to: to || null },
    byActor: byActor.map((a) => ({
      actorEmail: a._id.email, actorRole: a._id.role, count: a.count, lastAt: a.last,
    })),
    byAction: byAction.map((a) => ({ action: a._id, count: a.count })),
    byEntity: byEntity.map((a) => ({ entity: a._id, count: a.count })),
    total: byAction.reduce((s, a) => s + a.count, 0),
  };
}

/** Flat rows for CSV or Excel export. */
async function exportRows(school, filters = {}) {
  const { entries } = await query(school, filters, { limit: 200, skip: 0 });

  return entries.map((e) => ({
    at: e.at,
    entity: e.entity,
    entityId: String(e.entityId || ''),
    action: e.action,
    actor: e.actorEmail || '',
    role: e.actorRole || '',
    ip: e.ipAddress || '',
    fieldsChanged: e.changes.map((c) => c.field).join(', '),
    detail: e.changes
      .map((c) => `${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`)
      .join(' | ')
      .slice(0, 2000),
  }));
}

/**
 * Retention position.
 *
 * FR-M17 requires ten years. Nothing here PURGES — deletion is blocked at the
 * model, so a purge would need a deliberate, separately-reviewed migration.
 * This only reports how much is held and how old it is.
 */
async function retention(school) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);

  const [total, oldest, beyond] = await Promise.all([
    FmsAuditTrail.countDocuments({ school: oid(school) }),
    FmsAuditTrail.findOne({ school: oid(school) }).sort({ createdAt: 1 })
      .select('createdAt').lean(),
    FmsAuditTrail.countDocuments({ school: oid(school), createdAt: { $lt: cutoff } }),
  ]);

  return {
    retentionYears: RETENTION_YEARS,
    totalEntries: total,
    oldestEntry: oldest?.createdAt || null,
    entriesBeyondRetention: beyond,
    purgePolicy:
      'Nothing is purged automatically. Deletion is blocked at the model layer, ' +
      'so removing anything would require a deliberate migration and a reason.',
  };
}

module.exports = {
  record, diff, query, detail, history, activity, exportRows, retention,
  RETENTION_YEARS,
};