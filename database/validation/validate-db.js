/**
 * Database validation — TFS-EOS Delta Build
 *
 * Verifies that the database is in the state the approved design requires.
 * Read-only: this script never writes. Exit code 0 = all checks pass.
 *
 * Run:  mongosh "$MONGO_URI" --file database/validation/validate-db.js
 */
/* global db, print, quit */

print('== TFS-EOS database validation ==');
print('');

let failed = 0;
let warned = 0;

function check(label, ok, detail) {
  if (ok) { print('  PASS  ' + label); }
  else { print('  FAIL  ' + label + (detail ? ' — ' + detail : '')); failed += 1; }
}
function warn(label, detail) {
  print('  WARN  ' + label + (detail ? ' — ' + detail : ''));
  warned += 1;
}

// ── Migrations ───────────────────────────────────────────────────────────────
print('Migrations');
['001-academic-year-and-calendar', '002-academic-year-id-stamping'].forEach(function (id) {
  const m = db.migrations.findOne({ _id: id });
  check(id, Boolean(m && m.completedAt), m ? 'started but not completed' : 'not applied');
});

// ── Collections ──────────────────────────────────────────────────────────────
print('');
print('Collections');
const names = db.getCollectionNames();
['academicyears', 'holidays', 'specialevents', 'auditlogs'].forEach(function (c) {
  check(c + ' exists', names.indexOf(c) !== -1);
});

// ── Academic year invariants ─────────────────────────────────────────────────
print('');
print('Academic year');
const schools = db.schools.find({}, { _id: 1, name: 1 }).toArray();
schools.forEach(function (s) {
  const active = db.academicyears.countDocuments({ school: s._id, isActive: true });
  check(
    'exactly one active year for ' + (s.name || s._id),
    active === 1,
    active + ' found'
  );
});

const badRange = db.academicyears.countDocuments({ $expr: { $gte: ['$startDate', '$endDate'] } });
check('no academic year has startDate >= endDate', badRange === 0, badRange + ' invalid');

// ── D-002: Class must remain global ──────────────────────────────────────────
print('');
print('Approved decision invariants');
const classWithYear = db.classes.countDocuments({ academicYear: { $exists: true } });
check('D-002: no Class carries an academicYear field', classWithYear === 0,
      classWithYear + ' classes are year-scoped — Class must remain global');

const classIdx = db.classes.getIndexes().filter(function (i) {
  const k = Object.keys(i.key).sort().join(',');
  return k === 'name,school,section' && i.unique;
});
check('D-002: Class unique index on {name, section, school} intact', classIdx.length === 1);

const studentGrade = db.students.countDocuments({ grade: { $exists: true } });
check('D-004: no Student carries a grade field', studentGrade === 0,
      studentGrade + ' students have Student.grade — promotion writes Student.class');

// ── D-006: year stamping ─────────────────────────────────────────────────────
print('');
print('Historical enrolment enablers (D-006)');
['attendances', 'results', 'timetables', 'examgroups'].forEach(function (coll) {
  if (names.indexOf(coll) === -1) { warn(coll + ' absent'); return; }
  const total = db[coll].countDocuments({});
  const unstamped = db[coll].countDocuments({ academicYearId: { $exists: false } });
  if (total === 0) { warn(coll + ' is empty'); return; }
  check(coll + ': every record carries academicYearId', unstamped === 0,
        unstamped + ' of ' + total + ' unstamped');
});

// ── Calendar sanity ──────────────────────────────────────────────────────────
print('');
print('Calendar');
const orphanHolidays = db.holidays.countDocuments({
  academicYearId: { $nin: db.academicyears.distinct('_id') },
});
check('no holiday references a missing academic year', orphanHolidays === 0);

const badHolidayRange = db.holidays.countDocuments({
  endDate: { $ne: null }, $expr: { $lt: ['$endDate', '$date'] },
});
check('no holiday has endDate before date', badHolidayRange === 0);

const holidayCount = db.holidays.countDocuments({});
if (holidayCount === 0) {
  warn('no holidays are configured',
       'the persisted calendar is empty, so isNonInstructionalDay() will behave ' +
       'exactly like the in-memory store it replaced — Sunday only');
}

// ── Summary ──────────────────────────────────────────────────────────────────
print('');
print('== Summary ==');
print('  failures: ' + failed);
print('  warnings: ' + warned);
if (failed > 0) {
  print('');
  print('VALIDATION FAILED.');
  quit(1);
}
print('');
print('VALIDATION PASSED' + (warned ? ' (with warnings)' : '') + '.');
quit(0);
