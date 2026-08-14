// backend/routes/permissionRoutes.js
// Role → module access matrix: read and save.
const express = require('express');
const router = express.Router();
const RolePermission = require('../models/RolePermission');
const { clearPermissionCache } = require('../middleware/checkPermission');
// FP-043 — access-control changes are audited at the ROUTE HANDLER, not in
// checkPermission. checkPermission runs on every gated request; logging there
// would emit an entry per request. A matrix EDIT is the sensitive event.
const auditService = require('../services/auditService');
const { protect, authorize } = require('../middleware/auth');

// ── Canonical module list (columns of the matrix) ──
// Keep in sync with the frontend sidebar. `key` is stored in the DB.
const MODULES = [
  { key: 'dashboard',     label: 'Dashboard' },
  { key: 'settings',      label: 'Settings' },
  { key: 'idCards',       label: 'ID Cards' },
  { key: 'students',      label: 'Students' },
  { key: 'teachers',      label: 'Employees' },
  { key: 'classes',       label: 'Classes' },
  { key: 'subjects',      label: 'Subjects' },
  { key: 'salary',        label: 'Salary' },
  { key: 'attendance',    label: 'Attendance' },
  { key: 'exams',         label: 'Exams' },
  { key: 'assignments',   label: 'Assignments' },
  { key: 'fees',          label: 'Fees' },
  { key: 'expenses',      label: 'Expenses' },
  { key: 'library',       label: 'Library' },
  { key: 'transport',     label: 'Transport' },
  { key: 'homework',      label: 'Homework' },
  { key: 'behaviourNotes', label: 'Behaviour Notes' },
  { key: 'timetable',     label: 'Timetable' },
  { key: 'meetings',      label: 'Meetings' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'admissions',    label: 'Admissions' },
  { key: 'reports',       label: 'Reports' },
  { key: 'accessControl', label: 'Access Control' },

  // ── TFS-EOS delta additions (FP-040) ───────────────────────────────────────
  // 21 new keys. schoolAdmin auto-grants via MODULES.reduce above; every other
  // role gets an explicit grant in DEFAULT_GRANTS below. A key with no grant
  // falls to 'none' in defaultPermsFor, which is safe here but must never be the
  // ONLY line of defence — see the note on checkPermission fail-open.
  { key: 'academicCalendar',  label: 'Academic Calendar' },
  { key: 'promotion',         label: 'Student Promotion' },
  { key: 'examsAdvanced',     label: 'Advanced Exams' },
  { key: 'studentInformation', label: 'Student Information' },
  { key: 'competencies',      label: 'Competency Framework' },
  { key: 'assessment',        label: 'Formative Assessment' },
  { key: 'curriculum',        label: 'Curriculum Repository' },
  { key: 'bestPractices',     label: 'Best Practice Library' },
  { key: 'lessonPlans',       label: 'Lesson Planner' },
  { key: 'passport',          label: 'Learning Passport' },
  { key: 'subjectModules',    label: 'Subject Modules' },
  { key: 'quality',           label: 'Quality & Accreditation' },
  { key: 'insights',          label: 'AI Insights' },
  { key: 'consent',           label: 'Consent & Privacy' },
  { key: 'notificationConfig', label: 'Notification Providers' },
  { key: 'auditConsole',      label: 'Audit Console' },
  { key: 'messaging',         label: 'Parent Messaging' },
  { key: 'peerObservations',  label: 'Peer Observations' },
  { key: 'copilot',           label: 'AI Copilot' },
  { key: 'principalCopilot',  label: 'Principal Copilot' },
  { key: 'parentAI',          label: 'Parent-Facing AI' },
];

const ROLES = [
  { key: 'schoolAdmin',      label: 'School Admin' },
  { key: 'teacher',          label: 'Teacher' },
  { key: 'accountant',       label: 'Accountant' },
  { key: 'librarian',        label: 'Librarian' },
  { key: 'transportManager', label: 'Transport Manager' },
  { key: 'student',          label: 'Student' },
  { key: 'parent',           label: 'Parent' },
  // TFS-EOS delta (FP-040). Added HERE and to User.role — a role in only one
  // place is invisible to the matrix. Both are governance oversight roles.
  { key: 'trustee',            label: 'Trustee' },
  { key: 'governanceCommittee', label: 'Governance Committee' },
];

// Access levels (least → most). Stored in the DB per role×module.
const LEVELS = [
  { key: 'none',  label: 'No Access' },
  { key: 'read',  label: 'Read Only' },
  { key: 'edit',  label: 'Read/Edit' },
  { key: 'admin', label: 'Admin' },
];
const LEVEL_KEYS = LEVELS.map(l => l.key);

// Normalise any stored value (including legacy booleans) to a level string.
function toLevel(v) {
  if (v === true)  return 'admin';
  if (v === false || v == null || v === '') return 'none';
  return LEVEL_KEYS.includes(v) ? v : 'none';
}

// Default access LEVEL per role (mirrors current sidebar visibility).
// Modules a role could see before → 'edit'; everything else → 'none'.
// superAdmin is intentionally excluded — it always has admin access.
const DEFAULT_GRANTS = {
  schoolAdmin:      MODULES.reduce((m, x) => (m[x.key] = 'admin', m), {}),
  teacher:          { dashboard:'read', students:'edit', classes:'read', subjects:'read', attendance:'edit', exams:'edit', assignments:'edit', homework:'edit', behaviourNotes:'edit', timetable:'read', meetings:'edit', admissions:'read', reports:'read',
                      // TFS-EOS: a teacher's day-to-day surface.
                      academicCalendar:'read', examsAdvanced:'edit', studentInformation:'read', competencies:'read', assessment:'edit', curriculum:'edit', bestPractices:'edit', lessonPlans:'edit', passport:'edit', subjectModules:'edit', messaging:'edit', peerObservations:'edit', copilot:'edit', consent:'read' },
  accountant:       { dashboard:'read', students:'read', classes:'read', salary:'edit', exams:'read', fees:'edit', expenses:'edit', timetable:'read', meetings:'edit', reports:'read' },
  librarian:        { dashboard:'read', classes:'read', exams:'read', library:'edit', timetable:'read', meetings:'edit', reports:'read' },
  transportManager: { dashboard:'read', classes:'read', exams:'read', transport:'edit', timetable:'read', meetings:'edit', reports:'read' },
  student:          { dashboard:'read', homework:'read', meetings:'read' },
  parent:           { dashboard:'read', homework:'read', meetings:'read',
                      // TFS-EOS: parents see their own child's passport and messages;
                      // per-child scoping is enforced in the controller (GAP-PA-004).
                      passport:'read', messaging:'edit', consent:'edit', parentAI:'read' },

  // TFS-EOS governance oversight — READ-CAPPED. These roles review, they do not
  // operate. peerObservations is 'none': a governance reviewer must not read a
  // private peer observation, and that is also enforced in the query layer.
  trustee:          { dashboard:'read', reports:'read', quality:'read', auditConsole:'read', insights:'read', academicCalendar:'read' },
  governanceCommittee: { dashboard:'read', reports:'read', quality:'read', auditConsole:'read' },
};

function defaultPermsFor(role) {
  const base = MODULES.reduce((m, x) => (m[x.key] = 'none', m), {});
  const granted = DEFAULT_GRANTS[role] || {};
  Object.keys(granted).forEach(k => { base[k] = toLevel(granted[k]); });
  return base;
}

router.use(protect);

// NOTE: reading the matrix must be open to EVERY authenticated role — the
// sidebar needs it to decide what to show. Blocking it here previously meant
// non-admins always fell back to the hardcoded menu, so Access Control grants
// appeared to do nothing. Writes stay admin-only (see PUT/POST below).

// @desc   Get the full matrix (roles, modules, and saved permissions)
// @route  GET /api/permissions
router.get('/', async (req, res) => {
  try {
    const saved = await RolePermission.find({ school: req.user.school });
    const savedByRole = {};
    saved.forEach(doc => {
      savedByRole[doc.role] = Object.fromEntries(doc.permissions || new Map());
    });

    // Build the matrix: saved values where present, else defaults.
    // Every value is normalised to a level string (handles legacy booleans).
    const matrix = {};
    ROLES.forEach(r => {
      const saved = savedByRole[r.key];
      const dflt  = defaultPermsFor(r.key);
      const perms = {};
      MODULES.forEach(m => {
        perms[m.key] = saved && saved[m.key] !== undefined ? toLevel(saved[m.key]) : dflt[m.key];
      });
      matrix[r.key] = perms;
    });

    res.json({ success: true, modules: MODULES, roles: ROLES, levels: LEVELS, matrix });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @desc   Save the matrix
// @route  PUT /api/permissions
// Body: { matrix: { role: { moduleKey: bool, ... }, ... } }
router.put('/', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  try {
    const { matrix } = req.body;
    if (!matrix || typeof matrix !== 'object') {
      return res.status(400).json({ success: false, message: 'matrix is required' });
    }

    const ops = Object.keys(matrix)
      .filter(role => ROLES.some(r => r.key === role)) // only known non-super roles
      .map(role => {
        // Keep only known module keys; normalise each to a valid level
        const clean = {};
        MODULES.forEach(m => { clean[m.key] = toLevel(matrix[role][m.key]); });
        return {
          updateOne: {
            filter: { role, school: req.user.school },
            update: {
              $set: {
                role,
                permissions: clean,
                school: req.user.school,
                updatedBy: req.user._id,
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        };
      });

    // Capture prior state for the audit before/after.
    const affectedRoles = ops.map((o) => o.updateOne.filter.role);
    const before = await RolePermission.find({
      role: { $in: affectedRoles }, school: req.user.school,
    }).lean();

    if (ops.length) await RolePermission.bulkWrite(ops);

    // Clear the cache FIRST so the audit reflects what is now in force, then log.
    clearPermissionCache();

    const after = await RolePermission.find({
      role: { $in: affectedRoles }, school: req.user.school,
    }).lean();

    await auditService.audit({
      actor: req.user._id,
      actorNameSnapshot: req.user.name,
      actorRoleSnapshot: req.user.role,
      action: 'permission.matrix.update',
      module: 'accessControl',
      recordRef: { collectionName: 'RolePermission', id: null },
      // Only the grant maps — never a credential or token.
      before: before.map((b) => ({ role: b.role, permissions: b.permissions })),
      after: after.map((a) => ({ role: a.role, permissions: a.permissions })),
      source: 'route',
      school: req.user.school,
    });

    res.json({ success: true, message: 'Permissions saved', count: ops.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @desc   Reset the matrix to defaults
// @route  POST /api/permissions/reset
router.post('/reset', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  try {
    await RolePermission.deleteMany({ school: req.user.school });
    clearPermissionCache();
    res.json({ success: true, message: 'Permissions reset to defaults' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

// BP-002: expose the permission registry for the startup assertion and for tests.
// Attached as properties on the router (a function) so `require(...)` continues to
// return a mountable router and server.js is unaffected.
module.exports.MODULES = MODULES;
module.exports.ROLES = ROLES;
module.exports.DEFAULT_GRANTS = DEFAULT_GRANTS;