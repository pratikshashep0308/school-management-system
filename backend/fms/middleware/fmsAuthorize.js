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

function deny(res, message, detail) {
  return res.status(403).json({
    success: false,
    message,
    ...(detail ? { detail } : {}),
  });
}

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
      return res.status(401).json({ success: false, message: 'Not authorized. Please login.' });
    }

    const school = req.user.school;
    if (!school) {
      return deny(res, 'No branch assigned to this account.');
    }

    // 2 — has an active FMS role
    let assignment;
    try {
      assignment = await loadAssignment(req.user._id, school);
    } catch (err) {
      // A lookup failure must not fail open.
      return res.status(503).json({
        success: false,
        message: 'Authorization check unavailable.',
      });
    }

    if (!assignment) {
      return deny(
        res,
        'No FMS role assigned to this account.',
        'An administrator must grant an FMS finance role before this area is accessible.'
      );
    }

    // 3 — permitted
    if (!matrix.can(assignment, moduleKey, action)) {
      return deny(
        res,
        `Your role does not permit ${action} on ${moduleKey}.`,
        `Role '${assignment.financeRole}' has '${matrix.levelFor(
          assignment.financeRole, moduleKey, assignment.permissions
        )}' on '${moduleKey}'; ${action} requires '${matrix.ACTION_LEVEL[action]}'.`
      );
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
      return deny(
        res,
        'Separation of duties: you cannot approve your own request.',
        'A different authorised user must action this.'
      );
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