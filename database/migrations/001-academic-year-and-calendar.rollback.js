/**
 * Rollback for migration 001.
 *
 * Removes the AcademicYear documents this migration created and drops the two
 * calendar collections ONLY if they are empty. It never deletes user-entered
 * holidays: if a school has populated the calendar, the rollback stops and says
 * so, because silently destroying that data would be worse than a failed rollback.
 *
 * School.academicYear is NOT reverted — the value is a label, the prior value is
 * not recoverable from the migration record, and leaving the canonical format in
 * place is harmless.
 *
 * Run:  mongosh "$MONGO_URI" --file database/migrations/001-academic-year-and-calendar.rollback.js
 */
/* global db, print, quit */

const rec = db.migrations.findOne({ _id: '001-academic-year-and-calendar' });
if (!rec || !rec.completedAt) {
  print('Migration 001 is not applied. Nothing to roll back.');
  quit(0);
}

const holidayCount = db.holidays.countDocuments({});
const eventCount = db.specialevents.countDocuments({});

if (holidayCount > 0 || eventCount > 0) {
  print('REFUSING TO ROLL BACK.');
  print('  holidays:      ' + holidayCount);
  print('  specialevents: ' + eventCount);
  print('');
  print('These are user-entered records. Export or delete them deliberately');
  print('before rolling back this migration.');
  quit(1);
}

const stamped = db.attendances.countDocuments({ academicYearId: { $exists: true, $ne: null } });
if (stamped > 0) {
  print('REFUSING TO ROLL BACK: ' + stamped + ' attendance records carry an');
  print('academicYearId. Roll back migration 002 first.');
  quit(1);
}

const removed = db.academicyears.deleteMany({ name: rec.academicYearName });
db.holidays.drop();
db.specialevents.drop();
db.migrations.deleteOne({ _id: '001-academic-year-and-calendar' });

print('Removed ' + removed.deletedCount + ' academic year document(s).');
print('Dropped empty collections: holidays, specialevents.');
print('Rollback of migration 001 complete.');
