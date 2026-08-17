/**
 * Index creation — TFS-EOS Delta Build
 *
 * Purpose:   Create the indexes the new collections need. Idempotent:
 *            createIndex is a no-op when an identical index already exists.
 * LLD:       §10.2, §10.8, §30
 * Safety:    This script NEVER drops an index. Section 11 of the build
 *            instruction forbids silently removing indexes, and the Class unique
 *            index on {name, section, school} is protected by approved decision
 *            D-002 — it must not be removed, weakened, or replaced.
 *
 * Run:  mongosh "$MONGO_URI" --file database/indexes/create-indexes.js
 */
/* global db, print */

print('== Creating TFS-EOS indexes ==');

const SPEC = [
  ['academicyears', { school: 1, name: 1 }, { unique: true, name: 'ay_school_name_uniq' }],
  ['academicyears', { school: 1, isActive: 1 }, { name: 'ay_school_active' }],
  ['academicyears', { school: 1, startDate: 1, endDate: 1 }, { name: 'ay_school_range' }],

  ['holidays', { school: 1, date: 1 }, { name: 'hol_school_date' }],
  ['holidays', { school: 1, academicYearId: 1 }, { name: 'hol_school_year' }],
  ['holidays', { school: 1, recurringAnnually: 1 }, { name: 'hol_school_recurring' }],

  ['specialevents', { school: 1, date: 1 }, { name: 'se_school_date' }],
  ['specialevents', { school: 1, academicYearId: 1 }, { name: 'se_school_year' }],
  ['specialevents', { school: 1, instructionSuspended: 1, date: 1 }, { name: 'se_school_suspended_date' }],

  ['auditlogs', { school: 1, timestamp: -1 }, { name: 'audit_school_ts' }],
  ['auditlogs', { school: 1, module: 1, timestamp: -1 }, { name: 'audit_school_module_ts' }],
  ['auditlogs', { school: 1, actor: 1, timestamp: -1 }, { name: 'audit_school_actor_ts' }],
  ['auditlogs', { 'recordRef.id': 1 }, { name: 'audit_record_ref' }],

  // Supports the historical-enrolment read path (D-006), which correlates
  // year-stamped records rather than reading Class.students[].
  ['attendances', { school: 1, academicYearId: 1, student: 1 }, { name: 'att_school_year_student' }],
  ['results', { school: 1, academicYearId: 1, student: 1 }, { name: 'res_school_year_student' }],
  ['timetables', { school: 1, academicYearId: 1 }, { name: 'tt_school_year' }],
  ['examgroups', { school: 1, academicYearId: 1 }, { name: 'eg_school_year' }],
];

let created = 0;
let skipped = 0;

SPEC.forEach(function (entry) {
  const coll = entry[0];
  const keys = entry[1];
  const opts = entry[2];

  if (db.getCollectionNames().indexOf(coll) === -1) {
    print('  ' + coll + ': collection absent, skipped');
    skipped += 1;
    return;
  }
  try {
    db[coll].createIndex(keys, opts);
    print('  ' + coll + '.' + opts.name + ': ok');
    created += 1;
  } catch (e) {
    print('  ' + coll + '.' + opts.name + ': FAILED — ' + e.message);
  }
});

print('');
print('Indexes ensured: ' + created + ', skipped: ' + skipped);
print('No index was dropped. The Class unique index on {name, section, school}');
print('is protected by approved decision D-002 and is untouched.');
