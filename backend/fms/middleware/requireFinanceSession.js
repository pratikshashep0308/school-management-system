// backend/fms/middleware/requireFinanceSession.js
//
// The second gate. Runs after `protect` (which proves who you are) and before
// `fmsAuthorize` (which decides what you may do).
//
// Order matters and is deliberate:
//
//   protect                → are you signed in to the school system?
//   requireFinanceSession  → have you re-proved it to open the books?
//   fmsAuthorize           → does your finance role permit this action?
//
// A valid SMS session on its own gets you nothing here. That is the point: a
// borrowed laptop with a logged-in browser is the realistic threat in a school
// office, and it stops at this line.
//
// ─── WHAT IS DELIBERATELY LEFT OPEN ──────────────────────────────────────────
// Two endpoints must work without a finance session or nobody could ever get
// one:
//
//   GET  /api/fms/status        — is the plugin even switched on?
//   POST /api/fms/auth/unlock   — the exchange itself
//
// Everything else requires the session. `/status` is deliberately thin: it
// reports whether the module exists, never any figure.

const financeSession = require('../services/auth/financeSession');

/** Paths that must remain reachable without a finance session. */
const OPEN_PATHS = new Set(['/status', '/auth/unlock', '/auth/session']);

/**
 * When FMS_REQUIRE_SESSION is not 'true' this middleware passes everything
 * through. It ships OFF so that deploying the code cannot lock an existing
 * deployment out of its own books before anyone has been told the module now
 * asks for a password. Switch it on deliberately, once the people who use it
 * know to expect it.
 */
function enabled() {
  return String(process.env.FMS_REQUIRE_SESSION || '').toLowerCase() === 'true';
}

function requireFinanceSession(req, res, next) {
  if (!enabled()) return next();

  // req.path here is relative to the /api/fms mount.
  if (OPEN_PATHS.has(req.path)) return next();

  const header = req.get('x-fms-session') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;

  const result = financeSession.verify(token, req.user);

  if (!result.ok) {
    // 401 rather than 403, and a machine-readable code: the client needs to
    // tell "open the unlock prompt" apart from "you are not allowed to do
    // this", and those call for completely different screens.
    return res.status(401).json({
      success: false,
      error: {
        code: 'FMS_SESSION_REQUIRED',
        reason: result.reason,
        message: result.reason === 'expired'
          ? 'Your finance session has expired. Enter your password to continue.'
          : 'Enter your password to open the finance module.',
      },
    });
  }

  req.fmsSession = result.claims;
  return next();
}

module.exports = requireFinanceSession;
module.exports.OPEN_PATHS = OPEN_PATHS;
module.exports.enabled = enabled;
