/**
 * auditConsoleController — FP-059 · GAP-GOV-001..003 · Decision ADR-04 (governance binding)
 * FINAL LLD 1.1 §28
 *
 * Read-only console over AuditLog for governance oversight. ADR-04 concerns the
 * PRINCIPAL role's relationship to governance; this console is bound to the
 * governance roles (trustee, governanceCommittee) plus schoolAdmin/superAdmin,
 * enforced by the route's authorize(). The console never mutates audit records —
 * an audit log a reviewer can edit is not an audit log.
 */
const AuditLog = require('../models/AuditLog');

exports.query = async (req, res) => {
  try {
    const filter = { school: req.user.school };
    if (req.query.action) filter.action = req.query.action;
    if (req.query.module) filter.module = req.query.module;
    if (req.query.actor) filter.actor = req.query.actor;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 50);

    const [entries, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ success: true, entries, page, limit, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** Distinct action types present, for building a filter UI. */
exports.actions = async (req, res) => {
  try {
    const actions = await AuditLog.distinct('action', { school: req.user.school });
    res.json({ success: true, actions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Security-relevant audit summary — authorization failures over a window. This
 * surfaces the ADR-13 authorization.failure records so a reviewer can see if the
 * authorization layer is erroring in production.
 */
exports.securitySummary = async (req, res) => {
  try {
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 7 * 86400000);
    const authFailures = await AuditLog.countDocuments({
      school: req.user.school,
      action: 'authorization.failure',
      createdAt: { $gte: since },
    });
    const permissionChanges = await AuditLog.countDocuments({
      school: req.user.school,
      action: 'permission.matrix.update',
      createdAt: { $gte: since },
    });
    res.json({
      success: true,
      since,
      authorizationFailures: authFailures,
      permissionMatrixChanges: permissionChanges,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
