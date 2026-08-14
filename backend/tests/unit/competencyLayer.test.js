/**
 * FP-015 / FP-016 — competency framework and assessment collections
 * Requirements: GAP-CFG-001, GAP-AE-002, GAP-AE-003, GAP-AE-005
 * FINAL LLD 1.1 §10.1, §25 · Test tier: B — UNIT, no database.
 */
const mongoose = require('mongoose');
require('../../models/CompetencyFramework');
require('../../models/FormativeObservation');
const CompetencyMastery = require('../../models/CompetencyMastery');
const InterventionFlag = require('../../models/InterventionFlag');
const CF = mongoose.model('CompetencyFramework');
const FO = mongoose.model('FormativeObservation');

const oid = () => new mongoose.Types.ObjectId();
const errs = (d) => { const e = d.validateSync(); return e ? Object.keys(e.errors) : []; };

const framework = (o = {}) => new CF({
  subject: oid(), grade: 6, code: 'MATH.6.NUM.1',
  description: 'Adds and subtracts within 10000', school: oid(), ...o,
});
const mastery = (o = {}) => new CompetencyMastery({
  student: oid(), competency: oid(), frameworkVersion: 1, level: 'developing',
  sourceRefs: [{ collectionName: 'Result', id: oid() }],
  school: oid(), academicYearId: oid(), ...o,
});
const flag = (o = {}) => new InterventionFlag({
  student: oid(), competencies: [oid(), oid()], reason: 'Two competencies below developing',
  school: oid(), academicYearId: oid(), ...o,
});

describe('FP-015 — CompetencyFramework versioning', () => {
  test('a valid framework row passes validation', () => {
    expect(errs(framework())).toEqual([]);
  });

  test('grade is a Number, matching Class.grade', () => {
    // A String would be a second representation of one business fact.
    expect(CF.schema.path('grade').instance).toBe('Number');
  });

  test('frameworkVersion defaults to 1 and isActive to true', () => {
    const f = framework();
    expect(f.frameworkVersion).toBe(1);
    expect(f.isActive).toBe(true);
    expect(f.supersedes).toBeNull();
  });

  test('editing a substantive field on an ACTIVE row is rejected', async () => {
    const f = framework();
    f.isNew = false;
    f.description = 'Reworded';
    // Historical CompetencyMastery references this version; editing in place
    // would silently rewrite what those records were assessed against.
    await expect(f.save()).rejects.toThrow(/COMPETENCY_FRAMEWORK_IMMUTABLE/);
  });

  test('deactivating a row is permitted — it is how a supersede completes', async () => {
    const f = framework();
    f.isNew = false;
    f.isActive = false;
    await expect(f.save()).rejects.not.toThrow(/COMPETENCY_FRAMEWORK_IMMUTABLE/);
  });

  test('the unique index is on school + code + version', () => {
    const idx = CF.schema.indexes().find(([k, o]) => o && o.unique);
    expect(Object.keys(idx[0]).sort()).toEqual(['code', 'frameworkVersion', 'school']);
  });
});

describe('FP-016 — FormativeObservation', () => {
  test('a valid observation passes', () => {
    expect(errs(new FO({
      student: oid(), competency: oid(), observedLevel: 'developing',
      observedBy: oid(), school: oid(), academicYearId: oid(),
    }))).toEqual([]);
  });

  test('observedLevel is required and constrained to the three levels', () => {
    expect(FO.schema.path('observedLevel').enumValues)
      .toEqual(['emerging', 'developing', 'proficient']);
    expect(errs(new FO({
      student: oid(), competency: oid(), observedBy: oid(),
      school: oid(), academicYearId: oid(),
    }))).toContain('observedLevel');
  });

  test('evidenceType defaults to observation', () => {
    expect(FO.schema.path('evidenceType').defaultValue).toBe('observation');
  });
});

describe('FP-016 — CompetencyMastery is computed, never entered', () => {
  test('a job-written record is accepted', async () => {
    await expect(mastery().save()).rejects.not.toThrow(/MANUAL_WRITE_FORBIDDEN/);
  });

  test('a manual write is REJECTED', async () => {
    // GAP-AE-003 specifies mastery as computed. A manually entered level would be
    // indistinguishable from a computed one and would break explainability.
    await expect(mastery({ computedBy: 'a-teacher' }).save())
      .rejects.toThrow(/MASTERY_MANUAL_WRITE_FORBIDDEN/);
  });

  test('sourceRefs is required — a level without provenance cannot be explained', () => {
    expect(errs(mastery({ sourceRefs: [] }))).toContain('sourceRefs');
  });

  test('frameworkVersion is pinned so a later supersede cannot reinterpret the record', () => {
    expect(CompetencyMastery.schema.path('frameworkVersion').isRequired).toBe(true);
  });

  test('unique on student + competency — the recompute upserts, never duplicates', () => {
    const idx = CompetencyMastery.schema.indexes().find(([, o]) => o && o.unique);
    expect(Object.keys(idx[0]).sort()).toEqual(['competency', 'student']);
  });

  test('sourceRefs avoids the reserved Mongoose path name', () => {
    // `collection` is reserved and "may break some functionality".
    const sub = Object.keys(CompetencyMastery.schema.path('sourceRefs').schema.paths);
    expect(sub).toContain('collectionName');
    expect(sub).not.toContain('collection');
  });
});

describe('FP-016 — InterventionFlag threshold', () => {
  test('two competencies below developing raises a flag', () => {
    expect(errs(flag())).toEqual([]);
  });

  test('ONE competency does not meet the threshold', () => {
    expect(errs(flag({ competencies: [oid()] }))).toContain('competencies');
  });

  test('the threshold is a named constant, not a literal', () => {
    expect(InterventionFlag.MIN_COMPETENCIES_BELOW_DEVELOPING).toBe(2);
  });

  test('createdBy is system-only — no manual-flag workflow is invented', () => {
    expect(InterventionFlag.schema.path('createdBy').enumValues).toEqual(['system']);
    expect(flag().createdBy).toBe('system');
  });

  test('status lifecycle is open → acknowledged → closed', () => {
    expect(InterventionFlag.schema.path('status').enumValues)
      .toEqual(['open', 'acknowledged', 'closed']);
    expect(flag().status).toBe('open');
  });
});

describe('GAP-AE-006 — the marks workflow stays out of scope', () => {
  test('the Result pre-save grade hook is untouched by the competency layer', () => {
    require('../../models');
    const Result = mongoose.model('Result');
    const hooks = Result.schema.s.hooks._pres.get('save') || [];
    expect(hooks.map((h) => h.fn).some((fn) => /percentage/.test(String(fn)))).toBe(true);
  });
});
