// backend/fms/middleware/fmsAuthorize.js
//
// The FMS's OWN authorization wrapper. Deny by default.
//
// Why this exists rather than reusing the SMS middleware:
// `backend/middleware/checkPermission.js` returns next() when no RolePermission
// row exists for the caller's role. Its own comments say so explicitly — it is a
// deliberate choice to preserve behaviour for schools that never configured
// Access Control. That is reasonable for the SMS. It is not acceptable in front
// of a financial ledger, where "no rule configured" must mean "no access".
//
// The SMS middleware is left exactly as-is. This is additive.
//
// FULL IMPLEMENTATION LANDS IN P1.3. At P1.1 this enforces the deny-by-default
// shape and authentication, so no FMS route can ever be accidentally open while
// the rest of the plugin is scaffolded out.

const LEVELS = ['none', 'read', 'edit', 'admin'];

/** FMS permission module keys (DATA_DICTIONARY §1). */
const MODULE_KEYS = [
  'accounts', 'income', 'expenses', 'approvals', 'budgets', 'vendors',
  'purchase', 'banking', 'pettyCash', 'ledger', 'journal', 'payments',
  'financialReports', 'audit', 'financialYear',
];

/** The 12 FMS finance roles (DATA_DICTIONARY §1). Seeded in P1.3. */
const FINANCE_ROLES = [
  'chairman', 'trustee', 'principal', 'vicePrincipal', 'accountsManager',
  'accountant', 'cashier', 'purchaseOfficer', 'deptHead', 'teacher',
  'auditor', 'readOnly',
];

function deny(res, message) {
  return res.status(403).json({ success: false, message });
}

/**
 * @param {string} moduleKey  one of MODULE_KEYS
 * @param {'read'|'edit'|'admin'} required  minimum level
 */
function fmsAuthorize(moduleKey, required = 'read') {
  if (!MODULE_KEYS.includes(moduleKey)) {
    throw new Error(`fmsAuthorize: unknown module key '${moduleKey}'`);
  }
  if (!LEVELS.includes(required)) {
    throw new Error(`fmsAuthorize: unknown level '${required}'`);
  }

  return async function (req, res, next) {
    // Must already have passed the SMS `protect` middleware.
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authorized. Please login.' });
    }

    // ── P1.3 will replace this block with a fms_roleAssignments lookup ───────
    //   const assignment = await FmsRoleAssignment.findOne({
    //     smsUserId: req.user._id, school: req.user.school, status: 'active',
    //   });
    //   if (!assignment) return deny(res, 'No FMS role assigned.');
    //   const level = assignment.permissions?.[moduleKey] || 'none';
    //   if (LEVELS.indexOf(level) < LEVELS.indexOf(required)) {
    //     return deny(res, `Requires '${required}' on '${moduleKey}'.`);
    //   }
    //   req.fmsRole = assignment.financeRole;
    //   req.fmsScope = { school: req.user.school };
    //
    // Until then: deny everything. There is no FMS business endpoint yet, so
    // this blocks nothing real — and it guarantees the plugin cannot ship a
    // route that is open because P1.3 slipped.
    return deny(
      res,
      'FMS authorization is not yet configured (P1.3). Access denied by default.'
    );
  };
}

module.exports = fmsAuthorize;
module.exports.LEVELS = LEVELS;
module.exports.MODULE_KEYS = MODULE_KEYS;
module.exports.FINANCE_ROLES = FINANCE_ROLES;