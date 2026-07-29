// backend/fms/routes/audit.js
//
// Audit Trail Viewer — SRS M17 / FR-M17, screen SCR-61.
//
// Read-only by construction: there is no write endpoint here, and the model
// blocks updates and deletes. An audit trail with an edit button is not one.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const svc = require('../services/audit/auditService');
const { FmsAuditTrail } = require('../models/core');
const { ok, paginated, parsePagination, check, errors } = require('../utils/apiResponse');

/**
 * Read lazily, not at module load.
 *
 * Touching another module's exports while this file is being required makes the
 * result depend on require ORDER — it worked standalone and failed when the
 * contract test loaded the app, which is the worst kind of fragility because it
 * looks fine locally.
 */
function auditActions() {
  return FmsAuditTrail.schema.path('action').enumValues;
}

function filtersFrom(req) {
  return {
    entity: req.query.entity,
    entityId: req.query.entityId,
    action: req.query.action,
    actor: req.query.actor,
    actorEmail: req.query.actorEmail,
    actorRole: req.query.actorRole,
    ipAddress: req.query.ipAddress,
    from: req.query.from,
    to: req.query.to,
  };
}

/** GET /api/fms/audit — search the trail. */
router.get('/', fmsAuthorize('audit', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, {
    allowedSort: ['createdAt'], defaultSort: '-createdAt',
  });

  const actions = auditActions();
  if (req.query.action && !actions.includes(req.query.action)) {
    throw errors.badRequest(`Unknown action '${req.query.action}'`, { allowed: actions });
  }

  const result = await svc.query(req.fmsScope.school, filtersFrom(req), { limit, skip });
  return paginated(res, result.entries, { page, limit, total: result.total });
}));

/** GET /api/fms/audit/actions — what can be filtered on. */
router.get('/actions', fmsAuthorize('audit', 'VIEW'), asyncHandler(async (req, res) => {
  const entities = await FmsAuditTrail.distinct('entity', { school: req.fmsScope.school });
  return ok(res, { actions: auditActions(), entities: entities.sort() });
}));

/**
 * GET /api/fms/audit/history/:entity/:entityId
 * The question people actually ask: what happened to this document?
 */
router.get('/history/:entity/:entityId', fmsAuthorize('audit', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await svc.history(req.fmsScope.school, req.params.entity, req.params.entityId));
}));

/** GET /api/fms/audit/activity — who has been doing what. */
router.get('/activity', fmsAuthorize('audit', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await svc.activity(req.fmsScope.school, {
    from: req.query.from, to: req.query.to,
  }));
}));

/** GET /api/fms/audit/retention — how much is held, and how old. */
router.get('/retention', fmsAuthorize('audit', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await svc.retention(req.fmsScope.school));
}));

/** GET /api/fms/audit/export — flat rows for CSV or Excel. */
router.get('/export', fmsAuthorize('audit', 'EXPORT'), asyncHandler(async (req, res) => {
  const rows = await svc.exportRows(req.fmsScope.school, filtersFrom(req));

  if ((req.query.format || 'json') === 'csv') {
    const cols = ['at', 'entity', 'entityId', 'action', 'actor', 'role', 'ip', 'fieldsChanged', 'detail'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',
      `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  }

  return ok(res, { count: rows.length, rows });
}));

/** GET /api/fms/audit/:id — one entry with its full before/after. */
router.get('/:id', fmsAuthorize('audit', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  return ok(res, await svc.detail(req.fmsScope.school, req.params.id));
}));

module.exports = router;