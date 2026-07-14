// backend/routes/permissionRoutes.js
// Role → module access matrix: read and save.
const express = require('express');
const router = express.Router();
const RolePermission = require('../models/RolePermission');
const { clearPermissionCache } = require('../middleware/checkPermission');
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
];

const ROLES = [
  { key: 'schoolAdmin',      label: 'School Admin' },
  { key: 'teacher',          label: 'Teacher' },
  { key: 'accountant',       label: 'Accountant' },
  { key: 'librarian',        label: 'Librarian' },
  { key: 'transportManager', label: 'Transport Manager' },
  { key: 'student',          label: 'Student' },
  { key: 'parent',           label: 'Parent' },
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
  teacher:          { dashboard:'read', students:'edit', classes:'read', subjects:'read', attendance:'edit', exams:'edit', assignments:'edit', homework:'edit', behaviourNotes:'edit', timetable:'read', meetings:'edit', admissions:'read', reports:'read' },
  accountant:       { dashboard:'read', students:'read', classes:'read', salary:'edit', exams:'read', fees:'edit', expenses:'edit', timetable:'read', meetings:'edit', reports:'read' },
  librarian:        { dashboard:'read', classes:'read', exams:'read', library:'edit', timetable:'read', meetings:'edit', reports:'read' },
  transportManager: { dashboard:'read', classes:'read', exams:'read', transport:'edit', timetable:'read', meetings:'edit', reports:'read' },
  student:          { dashboard:'read', homework:'read', meetings:'read' },
  parent:           { dashboard:'read', homework:'read', meetings:'read' },
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

    if (ops.length) await RolePermission.bulkWrite(ops);
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