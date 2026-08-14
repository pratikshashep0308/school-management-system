/**
 * Rollback for migration 002 — remove academicYearId from the four collections.
 * FP-025 · FINAL LLD 1.1 §42
 *
 * Safe: unsets only the field 002 added. It does not delete records. It removes
 * the db.migrations marker so 002 can be re-run.
 *
 * NOTE: rollback cannot recover a MIS-stamped year, because the pre-flight is
 * what prevents mis-stamping in the first place. This rollback is for undoing a
 * correct-but-unwanted run, not for repairing a bad one.
 */
'use strict';
const MIGRATION_ID = '002-academic-year-id-stamping';
const TARGET_COLLECTIONS = ['attendances', 'results', 'timetables', 'examgroups'];

async function run(db, { schoolId } = {}) {
  if (!schoolId) throw new Error('ROLLBACK_002_SCHOOL_REQUIRED');
  const summary = { migrationId: MIGRATION_ID, schoolId, unset: {} };
  for (const coll of TARGET_COLLECTIONS) {
    const res = await db.collection(coll).updateMany(
      { school: schoolId, academicYearId: { $exists: true } },
      { $unset: { academicYearId: '' } }
    );
    summary.unset[coll] = res.modifiedCount;
  }
  await db.collection('migrations').deleteOne({ migrationId: MIGRATION_ID, school: schoolId });
  return summary;
}

module.exports = { run, MIGRATION_ID, TARGET_COLLECTIONS };
