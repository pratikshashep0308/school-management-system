// backend/middleware/checkPermission.js
//
// Enforces the Access Control matrix (RolePermission) on API routes.
//
// Levels:  'none' → blocked entirely
//          'read' → GET allowed; POST/PUT/PATCH/DELETE blocked
//          'edit' → all methods allowed (except destructive admin-only ones)
//          'admin'→ everything allowed
//
// Usage:  router.use(checkPermission('students'));
//         ...applied AFTER protect (so req.user exists).
//
// Design notes:
//   • superAdmin always bypasses the matrix.
//   • If no matrix row exists for the role, we DON'T block — we fall through to
//     the route's own authorize() check. This keeps existing behaviour intact
//     for any school that never configured Access Control.
//   • The matrix is cached briefly to avoid a DB hit on every request.

const RolePermission = require('../models/RolePermission');

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// ── Tiny cache: role+school → permissions map ────────────────────────────────
const cache = new Map();
const TTL_MS = 30 * 1000;   // 30s — short enough that saved changes apply fast

function cacheKey(role, school) { return `${role}:${school}`; }

async function getPermissions(role, school) {
  const key = cacheKey(role, school);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.perms;

  const doc = await RolePermission.findOne({ role, school });
  // Mongoose Map → plain object
  const perms = doc?.permissions
    ? (doc.permissions instanceof Map
        ? Object.fromEntries(doc.permissions)
        : { ...doc.permissions })
    : null;

  cache.set(key, { perms, at: Date.now() });
  return perms;
}

// Call this after the matrix is saved so changes take effect immediately.
function clearPermissionCache() { cache.clear(); }

/**
 * @param {string} moduleKey  e.g. 'students', 'fees', 'library'
 */
function checkPermission(moduleKey) {
  return async function (req, res, next) {
    try {
      const role   = req.user?.role;
      const school = req.user?.school;

      // Not authenticated → let protect/authorize handle it.
      if (!role) return next();

      // superAdmin bypasses the matrix entirely.
      if (role === 'superAdmin') return next();

      let perms = await getPermissions(role, school);

      // No matrix configured for this role → don't interfere; the route's own
      // authorize() still applies.
      if (!perms) return next();

      // ── FP-041 — secondary roles grant READ only ────────────────────────────
      // Re-read from req.user (server-side), never from the JWT, so a stale token
      // cannot widen access. A secondary role can raise 'none' to 'read'; it can
      // never grant a write or lower an existing grant.
      const secondaryRoles = Array.isArray(req.user?.secondaryRoles) ? req.user.secondaryRoles : [];
      if (secondaryRoles.length > 0) {
        perms = { ...perms };
        for (const secondary of secondaryRoles) {
          if (secondary === role) continue;
          const secPerms = await getPermissions(secondary, school);
          if (!secPerms) continue;
          const secLevel = secPerms[moduleKey];
          const hasReadable = secLevel === 'read' || secLevel === 'edit' || secLevel === 'admin';
          const primaryDenied = perms[moduleKey] === undefined || perms[moduleKey] === null ||
                                perms[moduleKey] === 'none' || perms[moduleKey] === false;
          // Cap at read: a secondary edit/admin becomes read here.
          if (hasReadable && primaryDenied) {
            perms[moduleKey] = 'read';
          }
        }
      }

      const level = perms[moduleKey];

      // Module not present in the matrix → fall through to authorize().
      if (level === undefined || level === null) return next();

      // Explicitly denied.
      if (level === 'none' || level === false) {
        return res.status(403).json({
          success: false,
          message: `Your role does not have access to ${moduleKey}.`,
        });
      }

      // Read-only → block every write.
      if (level === 'read' && WRITE_METHODS.includes(req.method)) {
        return res.status(403).json({
          success: false,
          message: `You have read-only access to ${moduleKey}. Editing is not permitted.`,
        });
      }

      // 'edit' and 'admin' → allowed. The route's own authorize() still runs
      // afterwards, so a role can never gain more than the route permits.
      return next();
    } catch (err) {
      // ── ADR-13 — authorization infrastructure failure FAILS CLOSED ──────────
      // Previously this returned next(), allowing the request. A transient error
      // during permission resolution (matrix lookup, role resolution) must NOT
      // grant access: an authorization layer that cannot decide must deny.
      //
      // The client receives a generic 403 with no internal detail. The full
      // error is audited server-side, never returned.
      const safeRef = `authz-${Date.now().toString(36)}`;
      console.error(`[checkPermission] authorization failure ${safeRef}:`, err.message);

      // Record the infrastructure failure per the audit policy. Best-effort and
      // itself wrapped, so an audit failure cannot turn a deny back into an allow.
      try {
        const auditService = require('../services/auditService');
        await auditService.audit({
          actor: req.user?._id || null,
          actorRoleSnapshot: req.user?.role || null,
          action: 'authorization.failure',
          module: moduleKey,
          // No before/after state, and crucially no error internals or secrets.
          before: null,
          after: null,
          source: 'checkPermission',
          school: req.user?.school || null,
          meta: { ref: safeRef, reason: 'authorization_dependency_error' },
        });
      } catch (auditErr) {
        // Deny regardless. The audit is secondary to the security decision.
        console.error(`[checkPermission] audit of ${safeRef} failed:`, auditErr.message);
      }

      return res.status(403).json({
        success: false,
        message: 'Authorization could not be verified for this request.',
        ref: safeRef,
      });
    }
  };
}

module.exports = checkPermission;
module.exports.clearPermissionCache = clearPermissionCache;