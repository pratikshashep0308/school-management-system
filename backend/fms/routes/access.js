// backend/fms/routes/access.js
//
// Finance access control, and the step-up session that guards the module.
//
// Two concerns in one file because they are the same concern from two sides:
// who may open the books at all, and who may say so.

const express = require('express');

const accessService = require('../services/access/accessService');
const financeSession = require('../services/auth/financeSession');
const fmsAuthorize = require('../middleware/fmsAuthorize');
const { FmsRoleAssignment } = require('../models/core');
const { ok, errors, validate, check } = require('../utils/apiResponse');

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── Step-up session ─────────────────────────────────────────────────────────
// These two are reachable WITHOUT a finance session — see OPEN_PATHS in
// requireFinanceSession. They have to be, or there would be no way to get one.
// They still require a valid SMS login: `protect` runs before this router.

/**
 * POST /api/fms/auth/unlock
 *
 * Exchange the signed-in user's password for a short-lived finance session.
 *
 * Not a second set of credentials — the same password, re-proved, in exchange
 * for a token only the finance module accepts and which expires in minutes. A
 * borrowed browser with a live school-system session does not get past here.
 *
 * No fmsAuthorize: whether the person holds a finance role is a separate
 * question, answered by every route below. Checking it here would tell an
 * attacker which accounts are worth attacking.
 */
router.post('/auth/unlock', asyncHandler(async (req, res) => {
  const session = await financeSession.unlock(req.user, req.body?.password, req);
  return ok(res, session, { message: `Finance unlocked for ${financeSession.SESSION_MINUTES} minutes` });
}));

/**
 * GET /api/fms/auth/session
 *
 * Two questions in one call: is the finance session still good, and what
 * finance role does the caller hold?
 *
 * The role belongs here rather than on a route of its own because the browser
 * needs it at exactly the same moment and under exactly the same conditions —
 * before any finance session exists, and without a permission check, since
 * refusing to tell somebody their own role would leave the menu unable to draw
 * itself.
 *
 * It was previously read from the notification-preferences endpoint, which does
 * not return a role. `fmsRole` was therefore always null, and every role-gated
 * menu entry was invisible to everybody — including a chairman with a perfectly
 * good assignment. That is the bug this closes.
 */
router.get('/auth/session', asyncHandler(async (req, res) => {
  const header = req.get('x-fms-session') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  const result = financeSession.verify(token, req.user);

  // The caller's OWN role only. No lookup of anybody else's.
  const assignment = req.user?._id
    ? await FmsRoleAssignment.findOne({
      smsUserId: req.user._id,
      school: req.user.school,
      status: 'active',
    }).select('financeRole multiBranch').lean()
    : null;

  return ok(res, {
    valid: result.ok,
    reason: result.reason || null,
    expiresAt: result.ok ? new Date(result.claims.exp * 1000) : null,
    sessionMinutes: financeSession.SESSION_MINUTES,

    // The caller's own id. Screens that filter "only what I did" need it, and
    // asking a separate endpoint for something this call already knows would be
    // an extra round trip for one field.
    userId: req.user?._id || null,

    hasRole: !!assignment,
    fmsRole: assignment?.financeRole || null,
    multiBranch: assignment?.multiBranch || false,
  });
}));

/** POST /api/fms/auth/lock — close the session deliberately. */
router.post('/auth/lock', asyncHandler(async (req, res) => {
  return ok(res, await financeSession.lock(req.user, req), { message: 'Finance locked' });
}));

// ─── Access control ──────────────────────────────────────────────────────────
// Everything below is chairman and trustee only. Granting somebody the ability
// to approve payments is a governance decision, not an administrative one — the
// system administrator should not be able to quietly give themselves approval
// rights, and neither should anyone else.

// `settings` is not a module in the finance permission matrix, and inventing a
// key for it would put a governance decision inside a table that exists to
// answer operational ones. So: fmsAuthorize establishes identity, branch scope
// and a real finance role — then this checks the one thing that matters here.
//
// Explicit rather than matrix-driven on purpose. "Only the chairman and
// trustees may grant finance access" is a rule somebody should be able to read
// in the code, not derive from a permission table.
const requireGovernance = (req, res, next) => {
  if (accessService.ADMIN_ROLES.includes(req.fmsRole)) return next();

  return next(errors.forbidden(
    'Only the Chairman or a Trustee can change who has access to the finance module.',
    { yourRole: req.fmsRole || null }
  ));
};

// Deliberately NOT collapsed into a shared `const governance = [...]` array.
// It reads better, but the route-guard audit is a static check over the source:
// a guard hidden behind a spread is invisible to it, and four genuinely guarded
// routes were reported as unguarded. A safety check that cannot see the safety
// is worse than the small repetition below.
//
// audit/VIEW is the lightest permission every governance role already holds. It
// is here to populate req.fmsScope and req.fmsRole, not to decide anything —
// requireGovernance does the deciding.

/** GET /api/fms/access/roles — the catalogue, so the screen can explain itself. */
router.get('/access/roles', fmsAuthorize('audit', 'VIEW'), requireGovernance, asyncHandler(async (req, res) => {
  return ok(res, {
    roles: accessService.ROLE_CATALOGUE,
    administratorRoles: accessService.ADMIN_ROLES,
  });
}));

/**
 * GET /api/fms/access/users
 *
 * Everyone in the school with the finance role they hold — including the many
 * who hold none, because granting access to somebody new is the main thing this
 * screen exists for.
 */
router.get('/access/users', fmsAuthorize('audit', 'VIEW'), requireGovernance, asyncHandler(async (req, res) => {
  return ok(res, await accessService.listUsers(req.fmsScope.school));
}));

/**
 * PUT /api/fms/access/users/:smsUserId
 *
 * Grant or change a finance role. Upserts — changing a role and granting one
 * are the same operation.
 */
router.put('/access/users/:smsUserId', fmsAuthorize('audit', 'VIEW'), requireGovernance, asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    financeRole: { required: true, rules: [check.nonEmpty] },
    multiBranch: { rules: [check.boolean] },
  });

  const doc = await accessService.assign(
    req.fmsScope.school,
    req.params.smsUserId,
    req.body.financeRole,
    { multiBranch: req.body.multiBranch === true },
    req
  );

  return ok(res, doc, { message: `Finance role set to ${doc.financeRole}` });
}));

/**
 * DELETE /api/fms/access/users/:smsUserId
 *
 * Withdraw finance access. Deactivates rather than deletes: the row is the
 * record that this person once had access, which is what gets asked about
 * afterwards.
 */
router.delete('/access/users/:smsUserId', fmsAuthorize('audit', 'VIEW'), requireGovernance, asyncHandler(async (req, res) => {
  const doc = await accessService.revoke(req.fmsScope.school, req.params.smsUserId, req);
  return ok(res, doc, { message: 'Finance access withdrawn' });
}));

module.exports = router;
