// backend/fms/middleware/fmsAuthorize.js
//
// The FMS's OWN authorization guard. Deny by default.
//
// ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// backend/middleware/checkPermission.js calls next() when no RolePermission row
// exists for the caller's role. Its own comments say so:
//
//     "If no matrix row exists for the role, we DON'T block — we fall through
//      to the route's own authorize() check. This keeps existing behaviour
//      intact for any school that never configured Access Control."
//
// That is a reasonable choice for the SMS. In front of a financial ledger it is
// not: "no rule configured" must mean "no access", not "ask someone else".
//
// The SMS middleware is untouched. This is additive and applies only to
// /api/fms/*.
//
// ─── LAYERS ──────────────────────────────────────────────────────────────────
//   1. authenticated?          — SMS `protect` must have run (req.user)
//   2. has an FMS role?        — fms_roleassignments row, active
//   3. permitted?              — role+module level ≥ action's required level
//   4. in scope?               — branch (school) scoping
//   5. separation of duties    — enforced per-route via requireDifferentActor

const { FmsRoleAssignment } = require('../models/core');
const matrix = require('../services/auth/permissionMatrix');
const { errors } = require('../utils/apiResponse');

const { MODULE_KEYS, ACTIONS } = matrix;

// Small TTL cache. Mirrors the SMS's approach so behaviour is familiar, but the
// miss path DENIES rather than falling through.
const cache = new Map();
const TTL_MS = 30 * 1000;

function cacheKey(userId, school) {
  return `${userId}:${school}`;
}

function clearAuthCache() {
  cache.clear();
}

async function loadAssignment(userId, school) {
  const key = cacheKey(userId, school);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.assignment;

  const doc = await FmsRoleAssignment.findOne({
    smsUserId: userId,
    school,
    status: 'active',
  }).lean();

  cache.set(key, { assignment: doc || null, at: Date.now() });
  return doc || null;
}

// Errors are THROWN, not written directly, so fmsErrorHandler renders them in
// the one standard envelope. Responding here would produce a second error shape
// for the same class of failure — which the contract test exists to catch.

/**
 * Guard a route.
 *
 * @param {string} moduleKey  one of MODULE_KEYS
 * @param {string} action     one of ACTIONS (default 'VIEW')
 *
 * Misconfiguration throws at mount time, not request time — a typo in a module
 * key should break the boot, not silently create an unguarded route.
 */
function fmsAuthorize(moduleKey, action = 'VIEW') {
  if (!MODULE_KEYS.includes(moduleKey)) {
    throw new Error(`fmsAuthorize: unknown module key '${moduleKey}'`);
  }
  if (!ACTIONS.includes(action)) {
    throw new Error(`fmsAuthorize: unknown action '${action}'`);
  }

  return async function (req, res, next) {
    // 1 — authenticated
    if (!req.user || !req.user._id) {
      return next(errors.unauthorized());
    }

    const school = req.user.school;
    if (!school) {
      return next(errors.forbidden('No branch assigned to this account.'));
    }

    // 2 — has an active FMS role
    let assignment;
    try {
      assignment = await loadAssignment(req.user._id, school);
    } catch (err) {
      // A lookup failure must NOT fail open. If permission cannot be
      // determined, access is refused.
      const e = errors.internal('Authorization check unavailable.');
      e.status = 503;
      e.code = 'AUTHZ_UNAVAILABLE';
      return next(e);
    }

    if (!assignment) {
      return next(errors.forbidden(
        'No FMS role assigned to this account.',
        { hint: 'An administrator must grant an FMS finance role before this area is accessible.' }
      ));
    }

    // 3 — permitted
    if (!matrix.can(assignment, moduleKey, action)) {
      return next(errors.forbidden(
        `Your role does not permit ${action} on ${moduleKey}.`,
        {
          role: assignment.financeRole,
          has: matrix.levelFor(assignment.financeRole, moduleKey, assignment.permissions),
          requires: matrix.ACTION_LEVEL[action],
          module: moduleKey,
        }
      ));
    }

    // 4 — branch scope. Every FMS query must filter on req.fmsScope.school.
    req.fmsRole = assignment.financeRole;
    req.fmsAssignment = assignment;
    req.fmsScope = {
      school,
      multiBranch: !!assignment.multiBranch,
    };

    next();
  };
}

/**
 * Separation of duties.
 *
 * Prevents the same person approving their own request. Mount AFTER
 * fmsAuthorize on any approve/reject route.
 *
 * @param {(req)=>Promise<string|null>} getOriginatorId  resolves the id of
 *        whoever created the document under action.
 */
function requireDifferentActor(getOriginatorId) {
  return async function (req, res, next) {
    const originator = await getOriginatorId(req);
    if (originator && String(originator) === String(req.user._id)) {
      return next(errors.forbidden(
        'Separation of duties: you cannot approve your own request.',
        { hint: 'A different authorised user must action this.' }
      ));
    }
    next();
  };
}

/**
 * Assert a document belongs to the caller's branch.
 * Multi-branch roles bypass. Use on every single-document read/write.
 */
function assertInScope(req, doc) {
  if (!doc) return false;
  if (req.fmsScope?.multiBranch) return true;
  return String(doc.school) === String(req.fmsScope?.school);
}

module.exports = fmsAuthorize;
module.exports.requireDifferentActor = requireDifferentActor;
module.exports.assertInScope = assertInScope;
module.exports.clearAuthCache = clearAuthCache;
module.exports.MODULE_KEYS = MODULE_KEYS;
module.exports.ACTIONS = ACTIONS;
module.exports.FINANCE_ROLES = matrix.FINANCE_ROLES;