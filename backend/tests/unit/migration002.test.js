/**
 * FP-025 — academicYearId stamping migration
 * Requirements: GAP-CAL-001, BR-SIS-04 enabler · Decisions D-006, DEP-01, DEP-02
 * FINAL LLD 1.1 §19, §42
 *
 * Test tier: B — UNIT with a FAKE db handle. This proves the migration LOGIC —
 * pre-flight, dry-run, idempotency, refusal. It does NOT prove execution against
 * a real MongoDB, which is ENVIRONMENT VALIDATION PENDING (tier D).
 */
const path = require('path');
const mig = require(path.resolve(__dirname, '../../../database/lib/stamp-academic-year'));
const rollback = require(path.resolve(__dirname, '../../../database/lib/stamp-academic-year-rollback'));

const SCHOOL = 'school-1';
const YEAR = { _id: 'year-2026-27', name: '2026-27', isActive: true, startDate: new Date('2026-06-15') };

/**
 * A minimal in-memory fake of the MongoDB Db surface the migration uses.
 * Records every updateMany so writes are inspectable.
 */
function fakeDb({ activeYear = YEAR, predating = {}, missing = {} } = {}) {
  const writes = [];
  const markers = [];
  const collection = (name) => ({
    findOne: async () => (name === 'academicyears' ? activeYear : null),
    countDocuments: async (filter) => {
      // Pre-flight query carries a date filter; stamping query does not.
      const isPreflight = Object.values(filter).some(
        (v) => v && typeof v === 'object' && ('$lt' in v)
      );
      if (isPreflight) return predating[name] || 0;
      if (filter.academicYearId && filter.academicYearId.$exists === false) return missing[name] || 0;
      return 0;
    },
    updateMany: async (filter, update) => {
      writes.push({ name, filter, update });
      return { modifiedCount: missing[name] || 0 };
    },
    updateOne: async (filter, update) => { markers.push({ name, filter, update }); return {}; },
    deleteOne: async () => ({ deletedCount: 1 }),
  });
  return { collection, writes, markers };
}

describe('pre-flight — refuse rather than mis-stamp', () => {
  test('refuses when any record predates the active year', async () => {
    // Result has no date of its own; a wrong stamp is unrecoverable, so the
    // pre-flight must stop rather than guess.
    const db = fakeDb({ predating: { results: 5 } });
    const s = await mig.run(db, { schoolId: SCHOOL });
    expect(s.refused).toBe(true);
    expect(s.reason).toMatch(/PREFLIGHT REFUSED/);
    expect(s.reason).toMatch(/DEP-01 does not hold/);
    // Nothing was stamped.
    expect(db.writes).toEqual([]);
  });

  test('proceeds when no record predates the year (DEP-01 holds)', async () => {
    const db = fakeDb({ predating: {}, missing: { attendances: 100 } });
    const s = await mig.run(db, { schoolId: SCHOOL });
    expect(s.refused).toBe(false);
    expect(s.stamped.attendances.stamped).toBe(100);
  });

  test('refuses when there is no active year', async () => {
    const db = fakeDb({ activeYear: null });
    const s = await mig.run(db, { schoolId: SCHOOL });
    expect(s.refused).toBe(true);
    expect(s.reason).toMatch(/No active academic year/);
  });

  test('school id is mandatory — no year is ever defaulted', async () => {
    await expect(mig.run(fakeDb(), {})).rejects.toThrow(/SCHOOL_REQUIRED/);
  });
});

describe('dry-run writes nothing', () => {
  test('reports what would change without an updateMany', async () => {
    const db = fakeDb({ missing: { attendances: 50, results: 30 } });
    const s = await mig.run(db, { schoolId: SCHOOL, dryRun: true });
    expect(s.dryRun).toBe(true);
    expect(s.stamped.attendances.wouldStamp).toBe(50);
    expect(s.stamped.attendances.stamped).toBe(0);
    // No writes and no completion marker in dry-run.
    expect(db.writes).toEqual([]);
    expect(db.markers).toEqual([]);
  });
});

describe('idempotency', () => {
  test('only records missing the field are stamped', async () => {
    const db = fakeDb({ missing: { attendances: 0, results: 0, timetables: 0, examgroups: 0 } });
    const s = await mig.run(db, { schoolId: SCHOOL });
    // Every filter targets academicYearId: { $exists: false }.
    db.writes.forEach((w) => {
      expect(w.filter.academicYearId.$exists).toBe(false);
    });
    Object.values(s.stamped).forEach((v) => expect(v.stamped).toBe(0));
  });

  test('a second run with everything stamped writes nothing', async () => {
    const db = fakeDb({ missing: {} }); // nothing missing
    await mig.run(db, { schoolId: SCHOOL });
    // countDocuments returns 0 for stamping filters, so updateMany is skipped.
    const stampWrites = db.writes.filter((w) => w.update.$set && w.update.$set.academicYearId);
    expect(stampWrites).toEqual([]);
  });

  test('the stamp sets the active year id on all four collections', async () => {
    const db = fakeDb({ missing: { attendances: 1, results: 1, timetables: 1, examgroups: 1 } });
    await mig.run(db, { schoolId: SCHOOL });
    const stamped = db.writes.filter((w) => w.update.$set && w.update.$set.academicYearId);
    expect(stamped.map((w) => w.name).sort())
      .toEqual(['attendances', 'examgroups', 'results', 'timetables']);
    stamped.forEach((w) => expect(w.update.$set.academicYearId).toBe(YEAR._id));
  });
});

describe('completion recording and validation', () => {
  test('a completed run writes a migrations marker', async () => {
    const db = fakeDb({ missing: { attendances: 5 } });
    await mig.run(db, { schoolId: SCHOOL });
    expect(db.markers.some((m) => m.name === 'migrations')).toBe(true);
  });

  test('validate reports ok only when nothing remains unstamped', async () => {
    const clean = fakeDb({ missing: {} });
    expect((await mig.validate(clean, { schoolId: SCHOOL })).ok).toBe(true);
    const dirty = fakeDb({ missing: { results: 3 } });
    const v = await mig.validate(dirty, { schoolId: SCHOOL });
    expect(v.ok).toBe(false);
    expect(v.remaining.results).toBe(3);
  });
});

describe('rollback', () => {
  test('unsets the field on all four collections and removes the marker', async () => {
    const db = fakeDb({ missing: { attendances: 10, results: 10, timetables: 10, examgroups: 10 } });
    const s = await rollback.run(db, { schoolId: SCHOOL });
    const unsets = db.writes.filter((w) => w.update.$unset && 'academicYearId' in w.update.$unset);
    expect(unsets.map((w) => w.name).sort())
      .toEqual(['attendances', 'examgroups', 'results', 'timetables']);
    expect(Object.keys(s.unset).sort())
      .toEqual(['attendances', 'examgroups', 'results', 'timetables']);
  });

  test('rollback requires a school id', async () => {
    await expect(rollback.run(fakeDb(), {})).rejects.toThrow(/SCHOOL_REQUIRED/);
  });
});

describe('static safety properties', () => {
  test('the migration targets exactly the four LLD-specified collections', () => {
    expect(mig.TARGET_COLLECTIONS).toEqual(['attendances', 'results', 'timetables', 'examgroups']);
  });

  test('no hardcoded academic year value appears in the migration source', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../database/migrations/002-academic-year-id-stamping.js'), 'utf8'
    );
    // Dates and year names come from the active year document, never a literal.
    expect(src).not.toMatch(/['"]2026-27['"]\s*[,;)]/);
    expect(src).not.toMatch(/new Date\(['"]2026-/);
  });
});
