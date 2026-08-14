/**
 * Seed — new access-control module keys and roles
 *
 * Purpose:      Grant the TFS-EOS module keys in the stored permission matrix so
 *               the new route groups are actually governed.
 * Requirements: GAP-IAM-001, GAP-IAM-002
 * LLD:          §9, §17.1.13, Appendix A, Appendix R R.2.3, Appendix S §S.11.1
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Specification §7.2 instructs extending a "RolePermission.moduleKey enum". No
 * such enum exists: RolePermission.permissions is an unconstrained Map, and the
 * authoritative registry is the MODULES constant in routes/permissionRoutes.js.
 * Editing the model has no effect on the Access Control UI.
 *
 * checkPermission FAILS OPEN — it calls next() when a role has no matrix row,
 * when the key is absent from the stored map, and on any lookup error. So a new
 * module whose key is missing here is silently ungoverned. This seed closes that
 * for existing RolePermission documents; utils/assertModuleKeys.js closes it at
 * startup for the code side.
 *
 * NON-DESTRUCTIVE: existing grants are never lowered or removed. A key already
 * present on a role is left exactly as the administrator set it.
 *
 * Run:  mongosh "$MONGO_URI" --file database/seed/seed-module-keys.js
 */
/* global db, print */

// Levels: 'none' | 'read' | 'edit' | 'admin'. superAdmin bypasses the matrix.
const GRANTS = {
  academicCalendar:    { schoolAdmin: 'admin', teacher: 'read',  student: 'read', parent: 'read' },
  competencies:        { schoolAdmin: 'admin', teacher: 'edit',  student: 'none', parent: 'none' },
  formativeObservations:{ schoolAdmin: 'admin', teacher: 'edit', student: 'none', parent: 'none' },
  lessonPlans:         { schoolAdmin: 'read',  teacher: 'edit',  student: 'none', parent: 'none' },
  learningPassport:    { schoolAdmin: 'admin', teacher: 'edit',  student: 'read', parent: 'read' },
  reading:             { schoolAdmin: 'admin', teacher: 'edit',  student: 'read', parent: 'read' },
  numeracy:            { schoolAdmin: 'admin', teacher: 'edit',  student: 'read', parent: 'read' },
  science:             { schoolAdmin: 'admin', teacher: 'edit',  student: 'read', parent: 'read' },
  language:            { schoolAdmin: 'admin', teacher: 'edit',  student: 'read', parent: 'read' },
  qualityAccreditation:{ schoolAdmin: 'admin', teacher: 'read',  student: 'none', parent: 'none' },
  aiInsights:          { schoolAdmin: 'admin', teacher: 'read',  student: 'none', parent: 'none' },
  consent:             { schoolAdmin: 'admin', teacher: 'none',  student: 'none', parent: 'edit' },
  curriculumRepository:{ schoolAdmin: 'admin', teacher: 'edit',  student: 'read', parent: 'none' },
  messages:            { schoolAdmin: 'admin', teacher: 'edit',  student: 'none', parent: 'edit' },
  peerObservations:    { schoolAdmin: 'none',  teacher: 'edit',  student: 'none', parent: 'none' },
  bestPractices:       { schoolAdmin: 'admin', teacher: 'edit',  student: 'none', parent: 'none' },
  auditConsole:        { schoolAdmin: 'admin', teacher: 'none',  student: 'none', parent: 'none' },
  promotion:           { schoolAdmin: 'admin', teacher: 'read',  student: 'none', parent: 'none' },
  studentInformation:  { schoolAdmin: 'admin', teacher: 'read',  student: 'read', parent: 'read' },
  notificationConfig:  { schoolAdmin: 'admin', teacher: 'none',  student: 'none', parent: 'none' },
  // §S.11.1 — split out so advanced-mark entry can be granted without also
  // granting access to the legacy exam module.
  examsAdvanced:       { schoolAdmin: 'admin', teacher: 'edit',  student: 'read', parent: 'read' },
};

// PeerObservation is private between the two participating teachers by design;
// a principal must not read it through a generic list endpoint. 'none' for
// schoolAdmin is deliberate, not an oversight.

print('== Seeding TFS-EOS module keys ==');

const rows = db.rolepermissions.find({}).toArray();
if (rows.length === 0) {
  print('No RolePermission documents found. The application seeds defaults on');
  print('first run; re-run this script afterwards.');
}

let added = 0;
let preserved = 0;

rows.forEach(function (row) {
  const perms = row.permissions || {};
  const set = {};

  Object.keys(GRANTS).forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(perms, key)) {
      preserved += 1;   // never lower or overwrite an administrator's choice
      return;
    }
    const level = GRANTS[key][row.role];
    set['permissions.' + key] = level === undefined ? 'none' : level;
    added += 1;
  });

  if (Object.keys(set).length > 0) {
    db.rolepermissions.updateOne({ _id: row._id }, { $set: set });
    print('  ' + row.role + ': added ' + Object.keys(set).length + ' key(s)');
  } else {
    print('  ' + row.role + ': already complete');
  }
});

print('');
print('Grants added:     ' + added);
print('Grants preserved: ' + preserved + ' (existing administrator settings untouched)');
print('');
print('Reminder: the two new roles (trustee, governanceCommittee) must also be');
print('present in the ROLES constant and the User.role enum. A role added to');
print('only one location is invisible to the access-control matrix.');
