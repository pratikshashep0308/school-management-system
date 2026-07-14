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

      const perms = await getPermissions(role, school);

      // No matrix configured for this role → don't interfere; the route's own
      // authorize() still applies.
      if (!perms) return next();

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
      // Never take the API down because of a permission-lookup failure.
      console.error('[checkPermission] error:', err.message);
      return next();
    }
  };
}

module.exports = checkPermission;
module.exports.clearPermissionCache = clearPermissionCache;