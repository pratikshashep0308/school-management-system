/**
 * academicYearId stamping — programmatic helper (Node)
 * FP-025 · GAP-CAL-001, BR-SIS-04 enabler · Decisions D-006, DEP-01, DEP-02
 * FINAL LLD 1.1 §19, §42
 *
 * ── What it does ────────────────────────────────────────────────────────────
 * Adds and populates `academicYearId` on Attendance, Result, Timetable and
 * ExamGroup. Under DEP-01 (deployment from 2026-27, no prior-year records) this
 * is a seed-and-stamp against the single active year, not a date-range
 * derivation.
 *
 * ── Why it is irreversible in the way that matters ──────────────────────────
 * `Result` carries no date of its own. Once a wrong year is stamped, it cannot be
 * recovered from the record. So the migration REFUSES to run if any target record
 * predates the active year's start — that condition means prior-year data exists
 * and DEP-01 does not hold, which is a STOP, not something to stamp through.
 *
 * ── Safety properties ───────────────────────────────────────────────────────
 *   preflight   — counts records predating the year; non-zero → refuse
 *   dryRun      — reports what would change, writes nothing
 *   idempotent  — only stamps records where academicYearId is absent
 *   recorded    — writes a db.migrations completion marker
 *   rollback    — 002-...-rollback.js unsets the field it added
 *
 * LIVE EXECUTION AGAINST THE TARGET DATABASE: ENVIRONMENT VALIDATION PENDING.
 * This is the PROGRAMMATIC twin of database/migrations/002-academic-year-id-stamping.js
 * (the canonical mongosh migration). Identical logic, exposed as a Node module so
 * the pre-flight, dry-run and idempotency behaviour can be unit tested with a fake
 * db handle. Statically validated in MODE A; NOT executed against a real MongoDB.
 *
 * Usage (MODE B):
 *   node 002-academic-year-id-stamping.js --uri <MONGO_URI> --school <id> [--dry-run]
 */
'use strict';

const MIGRATION_ID = '002-academic-year-id-stamping';
const TARGET_COLLECTIONS = ['attendances', 'results', 'timetables', 'examgroups'];

/**
 * The core routine, written to accept an injected db handle so it can be unit
 * tested with a fake and executed for real in MODE B.
 *
 * @param {object} db      a MongoDB Db handle (or a compatible fake)
 * @param {object} opts    { schoolId, dryRun }
 * @returns {Promise<object>} summary
 */
async function run(db, { schoolId, dryRun = false } = {}) {
  if (!schoolId) throw new Error('MIGRATION_002_SCHOOL_REQUIRED: --school is mandatory.');

  const summary = {
    migrationId: MIGRATION_ID,
    schoolId,
    dryRun,
    preflight: {},
    stamped: {},
    activeYear: null,
    refused: false,
    reason: null,
  };

  // ── Resolve the single active academic year ────────────────────────────────
  const year = await db.collection('academicyears').findOne({
    school: schoolId,
    isActive: true,
  });
  if (!year) {
    summary.refused = true;
    summary.reason =
      'No active academic year for this school. Seed and activate the year (migration 001) first.';
    return summary;
  }
  summary.activeYear = { id: year._id, name: year.name, startDate: year.startDate };

  // ── PRE-FLIGHT — refuse if any target record predates the year ─────────────
  // A record older than the active year's start means prior-year data exists, so
  // DEP-01 (deployment from 2026-27, nothing before) does not hold. Stamping the
  // active year onto it would be wrong and unrecoverable.
  const yearStart = new Date(year.startDate);
  let predating = 0;
  for (const coll of TARGET_COLLECTIONS) {
    const dateField = coll === 'attendances' ? 'date' : 'createdAt';
    const count = await db.collection(coll).countDocuments({
      school: schoolId,
      academicYearId: { $exists: false },
      [dateField]: { $lt: yearStart },
    });
    summary.preflight[coll] = count;
    predating += count;
  }

  if (predating > 0) {
    summary.refused = true;
    summary.reason =
      `PREFLIGHT REFUSED: ${predating} record(s) predate ${year.name} (${yearStart.toISOString().slice(0, 10)}). ` +
      'Prior-year data exists, so DEP-01 does not hold. Seed a separate CLOSED academic year ' +
      'for the historical records and stamp them to it before running this migration. ' +
      'This migration will not guess a year for undated records.';
    return summary;
  }

  // ── STAMP — only records missing the field (idempotent) ────────────────────
  for (const coll of TARGET_COLLECTIONS) {
    const filter = { school: schoolId, academicYearId: { $exists: false } };
    const toStamp = await db.collection(coll).countDocuments(filter);

    if (dryRun) {
      summary.stamped[coll] = { wouldStamp: toStamp, stamped: 0 };
      continue;
    }

    if (toStamp > 0) {
      const res = await db.collection(coll).updateMany(filter, {
        $set: { academicYearId: year._id },
      });
      summary.stamped[coll] = { wouldStamp: toStamp, stamped: res.modifiedCount };
    } else {
      summary.stamped[coll] = { wouldStamp: 0, stamped: 0 };
    }
  }

  // ── RECORD completion ──────────────────────────────────────────────────────
  if (!dryRun) {
    await db.collection('migrations').updateOne(
      { migrationId: MIGRATION_ID, school: schoolId },
      {
        $set: {
          migrationId: MIGRATION_ID,
          school: schoolId,
          appliedAt: new Date(),
          activeYear: year._id,
          summary: summary.stamped,
        },
      },
      { upsert: true }
    );
  }

  return summary;
}

/** POST-migration validation: every target record now carries the field. */
async function validate(db, { schoolId } = {}) {
  const remaining = {};
  let total = 0;
  for (const coll of TARGET_COLLECTIONS) {
    const c = await db.collection(coll).countDocuments({
      school: schoolId,
      academicYearId: { $exists: false },
    });
    remaining[coll] = c;
    total += c;
  }
  return { ok: total === 0, remaining, total };
}

// ── CLI entry (MODE B only) ───────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const get = (flag) => {
      const i = args.indexOf(flag);
      return i >= 0 ? args[i + 1] : null;
    };
    const uri = get('--uri') || process.env.MONGO_URI;
    const schoolId = get('--school');
    const dryRun = args.includes('--dry-run');

    if (!uri) {
      console.error('MONGO_URI is required (--uri or env). No default is assumed.');
      process.exit(2);
    }
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(uri);
    try {
      await client.connect();
      const db = client.db();
      const summary = await run(db, { schoolId, dryRun });
      console.log(JSON.stringify(summary, null, 2));
      if (summary.refused) process.exit(3);
      if (!dryRun) {
        const v = await validate(db, { schoolId });
        console.log('post-validation:', JSON.stringify(v));
        if (!v.ok) process.exit(4);
      }
    } finally {
      await client.close();
    }
  })().catch((err) => {
    console.error('Migration 002 failed:', err.message);
    process.exit(1);
  });
}

module.exports = { run, validate, MIGRATION_ID, TARGET_COLLECTIONS };
