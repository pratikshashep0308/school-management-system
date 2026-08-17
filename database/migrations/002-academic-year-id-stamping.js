/**
 * Migration 002 — academicYearId stamping (CU-CAL-020)
 *
 * Migration ID:  002-academic-year-id-stamping
 * Purpose:       Add and populate academicYearId on the four year-bearing
 *                collections, so historical enrolment can be reconstructed from
 *                immutable records (D-006) rather than from Class.students[],
 *                which D-005 correctly rules out.
 * Requirements:  BR-SIS-04 (enabler), GAP-CAL-001
 * LLD:           §10.1, §21, Appendix S §S.6, §S.6.1
 * Collections:   attendances, results, timetables, examgroups
 * Compatibility: Additive. No field removed. Legacy free-text academicYear
 *                fields on timetables and examgroups are RETAINED.
 * Rollback:      002-academic-year-id-stamping.rollback.js
 * Idempotent:    Yes.
 *
 * ── MANDATORY PRE-FLIGHT (IR-H-06) ──────────────────────────────────────────
 * This migration is IRREVERSIBLE in the sense that matters: `results` carries no
 * date of its own, so once a row is stamped there is no evidence left from which
 * a mis-stamped year could be recovered.
 *
 * The pre-flight therefore runs FIRST and counts records predating the year
 * start. Zero confirms deployment context DEP-01 and permits a blanket stamp.
 * NON-ZERO means those rows predate TFS-EOS: this script REFUSES to run and
 * tells you to seed a prior closed year instead. It never blanket-stamps them.
 *
 * Run:  mongosh "$MONGO_URI" --file database/migrations/002-academic-year-id-stamping.js
 * Dry:  TFS_DRY_RUN=1 mongosh "$MONGO_URI" --file ...
 */
/* global db, print, quit */

function _env(k) {
  try { if (typeof process !== 'undefined' && process.env) return process.env[k]; }
  catch (e) { /* mongosh without process */ }
  return undefined;
}
const DRY_RUN = Boolean(_env('TFS_DRY_RUN'));

print('== Migration 002: academicYearId stamping ==');
if (DRY_RUN) print('(DRY RUN — no writes will be made)');

const applied = db.migrations.findOne({ _id: '002-academic-year-id-stamping' });
if (applied && applied.completedAt && !DRY_RUN) {
  print('Already applied at ' + applied.completedAt + '. Nothing to do.');
  quit(0);
}

const years = db.academicyears.find({ isActive: true }).toArray();
if (years.length === 0) {
  print('ERROR: no active AcademicYear found. Run migration 001 first.');
  quit(1);
}

let totalStamped = 0;
let refused = false;

years.forEach(function (year) {
  print('');
  print('School ' + year.school + ' — year ' + year.name);
  print('  range: ' + year.startDate.toISOString().slice(0, 10) +
        ' .. ' + year.endDate.toISOString().slice(0, 10));

  // ── PRE-FLIGHT (IR-H-06) ──────────────────────────────────────────────────
  const earlyAttendance = db.attendances.countDocuments({
    school: year.school, date: { $lt: year.startDate },
  });
  const earlyExams = db.exams.countDocuments({
    school: year.school, date: { $lt: year.startDate },
  });

  print('  pre-flight: attendance before year start = ' + earlyAttendance);
  print('  pre-flight: exams before year start      = ' + earlyExams);

  if (earlyAttendance > 0 || earlyExams > 0) {
    print('');
    print('  REFUSING TO STAMP THIS SCHOOL.');
    print('  Records exist that predate the active academic year, so deployment');
    print('  context DEP-01 does not hold here. Blanket-stamping them to ' + year.name);
    print('  would assign the wrong year, and `results` carries no date of its own');
    print('  from which that could later be recovered.');
    print('');
    print('  Seed a prior AcademicYear with status "closed" covering those dates,');
    print('  then re-run. This script will stamp each record to the year whose');
    print('  range contains it.');
    refused = true;
    return;
  }

  const scope = { school: year.school, academicYearId: { $exists: false } };
  const set = { $set: { academicYearId: year._id } };

  if (DRY_RUN) {
    print('  would stamp attendances:  ' + db.attendances.countDocuments(scope));
    print('  would stamp results:      ' + db.results.countDocuments(scope));
    print('  would stamp timetables:   ' + db.timetables.countDocuments(scope));
    print('  would stamp examgroups:   ' + db.examgroups.countDocuments(scope));
    return;
  }

  ['attendances', 'results', 'timetables', 'examgroups'].forEach(function (coll) {
    if (db.getCollectionNames().indexOf(coll) === -1) {
      print('  ' + coll + ': collection absent, skipped');
      return;
    }
    const r = db[coll].updateMany(scope, set);
    totalStamped += r.modifiedCount;
    print('  ' + coll + ': stamped ' + r.modifiedCount);
  });
});

if (refused) {
  print('');
  print('Migration 002 did not complete: one or more schools failed pre-flight.');
  quit(1);
}
if (DRY_RUN) {
  print('');
  print('Dry run complete. No writes were made.');
  quit(0);
}

db.migrations.updateOne(
  { _id: '002-academic-year-id-stamping' },
  { $set: {
      purpose: 'Stamp academicYearId on year-bearing collections',
      requirements: ['BR-SIS-04', 'GAP-CAL-001'],
      recordsStamped: totalStamped,
      completedAt: new Date(),
  } },
  { upsert: true }
);

print('');
print('Total records stamped: ' + totalStamped);
print('Migration 002 complete.');
