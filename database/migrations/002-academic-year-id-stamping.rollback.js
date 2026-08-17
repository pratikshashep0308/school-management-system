/**
 * Rollback for migration 002 — removes academicYearId from the four collections.
 *
 * Safe: the field is additive and nothing in the pre-delta codebase reads it.
 * Note that re-running migration 002 afterwards re-stamps from scratch, and the
 * pre-flight gate applies again.
 *
 * Run:  mongosh "$MONGO_URI" --file database/migrations/002-academic-year-id-stamping.rollback.js
 */
/* global db, print, quit */

const rec = db.migrations.findOne({ _id: '002-academic-year-id-stamping' });
if (!rec || !rec.completedAt) {
  print('Migration 002 is not applied. Nothing to roll back.');
  quit(0);
}

let removed = 0;
['attendances', 'results', 'timetables', 'examgroups'].forEach(function (coll) {
  if (db.getCollectionNames().indexOf(coll) === -1) return;
  const r = db[coll].updateMany(
    { academicYearId: { $exists: true } },
    { $unset: { academicYearId: '' } }
  );
  removed += r.modifiedCount;
  print(coll + ': cleared ' + r.modifiedCount);
});

db.migrations.deleteOne({ _id: '002-academic-year-id-stamping' });
print('Total cleared: ' + removed);
print('Rollback of migration 002 complete.');
