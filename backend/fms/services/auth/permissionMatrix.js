// backend/fms/services/auth/permissionMatrix.js
//
// The FMS permission model.
//
// ─── TWO VOCABULARIES, ONE STORAGE MODEL ─────────────────────────────────────
//
// The Prompt Playbook asks for 10 permission ACTIONS (CREATE, EDIT, DELETE,
// VIEW, APPROVE, REJECT, PRINT, EXPORT, CANCEL, REOPEN). The Data Dictionary §1
// specifies 4 LEVELS (none | read | edit | admin) and gives the mapping between
// them. The Data Dictionary is canonical — every other deliverable is written
// against it, and fms_roleassignments already stores levels.
//
// So: levels are stored, actions are the API. A caller writes
// `can(assignment, 'income', 'APPROVE')` and it resolves to the `admin` level
// internally. Both vocabularies stay honest and there is only one thing in the
// database to reason about.
//
// ─── DEFAULTS COME FROM THE SRS ──────────────────────────────────────────────
// The matrix below is a direct translation of SRS §9.10 (Role x Module Access
// Overview), not an invention. Translation rule:
//     V     → read      (view/print/export)
//     C/E   → edit      (create/edit/cancel)
//     A     → admin     (approve/reject/reopen)
//     -     → none
// A cell containing A always wins, since approving implies seeing.
//
// These are DEFAULTS. Per-user overrides live in
// fms_roleassignments.permissions and take precedence.

const LEVELS = ['none', 'read', 'edit', 'admin'];

/** FMS permission module keys (Data Dictionary §1). */
const MODULE_KEYS = [
  'accounts', 'income', 'expenses', 'approvals', 'budgets', 'vendors',
  'purchase', 'banking', 'pettyCash', 'ledger', 'journal', 'payments',
  'financialReports', 'audit', 'financialYear',
];

/** The 12 FMS finance roles (Data Dictionary §1). */
const FINANCE_ROLES = [
  'chairman', 'trustee', 'principal', 'vicePrincipal', 'accountsManager',
  'accountant', 'cashier', 'purchaseOfficer', 'deptHead', 'teacher',
  'auditor', 'readOnly',
];

/**
 * The 10 actions, each mapped to the minimum level that permits it.
 *
 * DELETE maps to 'admin' AND is only ever a soft-cancel — no FMS financial
 * document has a hard-delete path. The action name is kept because the SRS
 * uses it; the semantics are "cancel with admin authority".
 */
const ACTION_LEVEL = {
  VIEW: 'read',
  PRINT: 'read',
  EXPORT: 'read',
  CREATE: 'edit',
  EDIT: 'edit',
  CANCEL: 'edit',
  APPROVE: 'admin',
  REJECT: 'admin',
  REOPEN: 'admin',
  DELETE: 'admin',   // soft-cancel only
};

const ACTIONS = Object.keys(ACTION_LEVEL);

/** Is `have` at least `need`? */
function satisfies(have, need) {
  return LEVELS.indexOf(have || 'none') >= LEVELS.indexOf(need);
}

// ─────────────────────────────────────────────────────────────────────────────
// Default matrix — role → { moduleKey: level }
// Column order in SRS §9.10 matches FINANCE_ROLES order.
// ─────────────────────────────────────────────────────────────────────────────

//                        chair  trust  princ  vp     acctM  acct   cash   po     dept   teach  audit  readO
const SRS = {
  accounts:         ['read','read','read','none','edit','read','none','none','none','none','read','read'],
  income:           ['read','read','read','read','edit','edit','edit','none','none','none','read','read'],
  expenses:         ['read','read','admin','admin','edit','edit','read','edit','edit','edit','read','read'],
  approvals:        ['admin','admin','admin','admin','admin','read','none','none','admin','none','read','none'],
  budgets:          ['read','read','admin','read','edit','read','none','none','read','none','read','read'],
  vendors:          ['read','read','read','none','edit','read','none','edit','none','none','read','read'],
  purchase:         ['read','read','admin','admin','read','read','none','edit','edit','none','read','read'],
  banking:          ['read','read','read','none','edit','edit','read','none','none','none','read','read'],
  pettyCash:        ['read','read','read','none','admin','read','edit','none','none','none','read','read'],
  ledger:           ['read','read','read','none','read','read','none','none','none','none','read','read'],
  journal:          ['read','read','read','none','admin','edit','none','none','none','none','read','read'],
  financialReports: ['read','read','read','read','read','read','read','read','read','none','read','read'],
  audit:            ['read','read','read','none','read','none','none','none','none','none','read','none'],

  // Not in SRS §9.10 — derived from the workflows that use them.
  // payments: modelled on M9 Banking + M4 Expense payment release.
  payments:         ['read','read','admin','admin','edit','edit','edit','none','none','none','read','read'],
  // financialYear: closing and locking a year is a senior, rare action.
  financialYear:    ['admin','read','admin','none','edit','none','none','none','none','none','read','none'],
};

/** Build role → { module: level } from the column-oriented SRS table. */
function buildDefaults() {
  const out = {};
  FINANCE_ROLES.forEach((role, col) => {
    out[role] = {};
    MODULE_KEYS.forEach((mod) => {
      const row = SRS[mod];
      out[role][mod] = row ? row[col] : 'none';
    });
  });
  return out;
}

const DEFAULT_MATRIX = buildDefaults();

/**
 * Effective level for a role+module.
 *
 * Precedence: per-user override → role default → 'none'.
 * Deny by default: an unknown role or module yields 'none', never a fallback
 * that grants anything.
 */
function levelFor(financeRole, moduleKey, overrides) {
  if (!MODULE_KEYS.includes(moduleKey)) return 'none';

  if (overrides) {
    // fms_roleassignments.permissions is a Mongoose Map.
    const v = typeof overrides.get === 'function' ? overrides.get(moduleKey) : overrides[moduleKey];
    if (v && LEVELS.includes(v)) return v;
  }

  const role = DEFAULT_MATRIX[financeRole];
  return (role && role[moduleKey]) || 'none';
}

/**
 * Can this assignment perform `action` on `moduleKey`?
 * @param {{financeRole:string, permissions?:any}} assignment
 */
function can(assignment, moduleKey, action) {
  if (!assignment) return false;                       // deny by default
  const need = ACTION_LEVEL[action];
  if (!need) return false;                             // unknown action → deny
  return satisfies(levelFor(assignment.financeRole, moduleKey, assignment.permissions), need);
}

module.exports = {
  LEVELS,
  ACTIONS,
  ACTION_LEVEL,
  MODULE_KEYS,
  FINANCE_ROLES,
  DEFAULT_MATRIX,
  levelFor,
  satisfies,
  can,
};