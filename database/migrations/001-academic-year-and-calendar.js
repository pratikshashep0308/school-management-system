/**
 * Migration 001 — Academic year and calendar collections
 *
 * Migration ID:  001-academic-year-and-calendar
 * Purpose:       Seed the AcademicYear for the current year and create the
 *                Holiday and SpecialEvent collections, replacing the in-memory
 *                holiday store that has never had a writer.
 * Requirements:  GAP-CAL-001, GAP-CAL-002, GAP-CAL-006
 * LLD:           §10.2, §21, Appendix S §S.4, §S.6.1
 * Collections:   academicyears (create), holidays (create), specialevents (create),
 *                schools (align academicYear label only — never removed)
 * Compatibility: Additive. No existing field is dropped or renamed.
 * Rollback:      database/migrations/001-academic-year-and-calendar.rollback.js
 * Idempotent:    Yes — records completion in db.migrations and exits early.
 *
 * Run:
 *   TFS_ACADEMIC_YEAR_START=2026-04-01 TFS_ACADEMIC_YEAR_END=2027-03-31 \
 *     mongosh "$MONGO_URI" --file database/migrations/001-academic-year-and-calendar.js
 *
 * The start and end dates are deliberately NOT defaulted. Deployment context
 * DEP-01 establishes that implementation begins in the current academic year,
 * but the actual term boundaries are a school decision, and they also drive
 * GAP-CAL-003 timetable term validation. A guessed boundary silently mis-scopes
 * every record stamped against it.
 */
/* global db, print, quit */

const YEAR_NAME = _env('TFS_ACADEMIC_YEAR_NAME') || '2026-27';
const YEAR_START = _env('TFS_ACADEMIC_YEAR_START');
const YEAR_END = _env('TFS_ACADEMIC_YEAR_END');

function _env(k) {
  try {
    if (typeof process !== 'undefined' && process.env) return process.env[k];
  } catch (e) { /* mongosh without process */ }
  return undefined;
}

if (!YEAR_START || !YEAR_END) {
  print('');
  print('ERROR: TFS_ACADEMIC_YEAR_START and TFS_ACADEMIC_YEAR_END are required.');
  print('They are school-specific and must not be guessed; they also drive');
  print('term-boundary validation (GAP-CAL-003).');
  print('');
  print('  TFS_ACADEMIC_YEAR_START=2026-04-01 TFS_ACADEMIC_YEAR_END=2027-03-31 \\');
  print('    mongosh "$MONGO_URI" --file database/migrations/001-academic-year-and-calendar.js');
  print('');
  quit(1);
}

const start = new Date(YEAR_START);
const end = new Date(YEAR_END);
if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
  print('ERROR: invalid academic year range: ' + YEAR_START + ' .. ' + YEAR_END);
  quit(1);
}

const DRY_RUN = Boolean(_env('TFS_DRY_RUN'));

print('== Migration 001: academic year and calendar ==');
if (DRY_RUN) print('(DRY RUN — no writes will be made)');

const applied = db.migrations.findOne({ _id: '001-academic-year-and-calendar' });
if (applied && applied.completedAt && !DRY_RUN) {
  print('Already applied at ' + applied.completedAt + '. Nothing to do.');
  quit(0);
}

const schools = db.schools.find({}, { _id: 1, name: 1, academicYear: 1 }).toArray();
if (schools.length === 0) {
  print('ERROR: no schools found. Seed a school before running this migration.');
  quit(1);
}
print('Schools found: ' + schools.length);

let created = 0;
let aligned = 0;

schools.forEach(function (school) {
  const label = school.name || String(school._id);
  const existing = db.academicyears.findOne({ school: school._id, name: YEAR_NAME });
  if (existing) {
    print('  ' + label + ': academic year ' + YEAR_NAME + ' already present');
  } else if (DRY_RUN) {
    print('  ' + label + ': WOULD create ' + YEAR_NAME);
    created += 1;
  } else {
    db.academicyears.insertOne({
      name: YEAR_NAME,
      startDate: start,
      endDate: end,
      terms: [],
      isActive: true,
      status: 'active',
      school: school._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    created += 1;
    print('  ' + label + ': created ' + YEAR_NAME);
  }

  // Align the legacy free-text label to the canonical format. Retained for
  // backward compatibility, never removed.
  if (school.academicYear !== YEAR_NAME) {
    if (DRY_RUN) {
      print('  ' + label + ': WOULD align academicYear label to ' + YEAR_NAME);
    } else {
      db.schools.updateOne({ _id: school._id }, { $set: { academicYear: YEAR_NAME } });
    }
    aligned += 1;
  }
});

['holidays', 'specialevents'].forEach(function (name) {
  if (db.getCollectionNames().indexOf(name) === -1) {
    if (DRY_RUN) {
      print('  WOULD create collection: ' + name);
    } else {
      db.createCollection(name);
      print('  created collection: ' + name);
    }
  }
});

if (DRY_RUN) {
  print('DRY RUN complete — would create ' + created + ' year(s), align ' + aligned + ' school label(s). No writes made.');
  quit(0);
}

db.migrations.updateOne(
  { _id: '001-academic-year-and-calendar' },
  { $set: {
      purpose: 'Academic year and calendar collections',
      requirements: ['GAP-CAL-001', 'GAP-CAL-002', 'GAP-CAL-006'],
      academicYearName: YEAR_NAME,
      yearsCreated: created,
      schoolsAligned: aligned,
      completedAt: new Date(),
  } },
  { upsert: true }
);

print('');
print('Academic years created: ' + created);
print('School labels aligned:  ' + aligned);
print('Migration 001 complete.');
