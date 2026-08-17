/**
 * FP-020 / FP-021 / FP-022 / FP-023 — remaining DATABASE-tier models
 * Requirements: GAP-SLP-*, GAP-SUB-*, GAP-QA-001, GAP-AI-*, GAP-CON-*, GAP-NOT-006
 * Decisions: D-007 · Test tier: B — UNIT, behavioural (validate(), methods, indexes).
 */
const mongoose = require('mongoose');
require('../../models');
const PassportEntry = require('../../models/PassportEntry');
const subjects = require('../../models/subjectModels');
const { QualityIndicator, Insight, Consent } = require('../../models/qualityConsentInsight');
const NPC = require('../../models/NotificationProviderConfig');

const oid = () => new mongoose.Types.ObjectId();

describe('FP-020 — PassportEntry safeguarding', () => {
  const entry = (o = {}) => new PassportEntry({
    student: oid(), entryType: 'academic-milestone', title: 'Top of class',
    school: oid(), academicYearId: oid(), ...o,
  });

  test('a valid entry passes', () => expect(entry().validateSync()).toBeUndefined());

  test('visibility defaults to internal, the safe default', () => {
    expect(entry().visibility).toBe('internal');
  });

  test('parentVisibleFilter EXCLUDES wellbeing entries by type', () => {
    // The safeguarding control is the query, tested by its output.
    const f = PassportEntry.parentVisibleFilter(oid(), oid());
    expect(f.visibility).toBe('parent');
    expect(f.entryType.$nin).toContain('wellbeing');
  });

  test('a wellbeing entry mis-set to parent is STILL excluded by the type filter', () => {
    // Belt and braces: even a mis-set visibility cannot leak a wellbeing entry,
    // because the filter excludes the type as well.
    const f = PassportEntry.parentVisibleFilter(oid(), oid());
    const wouldMatch = (e) =>
      e.visibility === f.visibility && !f.entryType.$nin.includes(e.entryType);
    expect(wouldMatch({ visibility: 'parent', entryType: 'wellbeing' })).toBe(false);
    expect(wouldMatch({ visibility: 'parent', entryType: 'award' })).toBe(true);
  });

  test('GAP-SIS-001 — no learningPassportId field was created on Student', () => {
    require('../../models/Student');
    const paths = Object.keys(mongoose.model('Student').schema.paths);
    expect(paths).not.toContain('learningPassportId');
  });

  test('sourceRef supports idempotent automatic creation', () => {
    const paths = Object.keys(PassportEntry.schema.paths);
    expect(paths).toContain('sourceRef.collectionName');
    expect(paths).toContain('sourceRef.id');
  });
});

describe('FP-021 — subject modules', () => {
  test('a numeracy misconception flags only at the threshold', () => {
    const { NumeracyMisconception, MISCONCEPTION_THRESHOLD } = subjects;
    expect(MISCONCEPTION_THRESHOLD).toBe(3);
    // Behavioural: the static computes the flag deterministically, independent of
    // any validation path.
    expect(NumeracyMisconception.computeFlagged(2)).toBe(false);
    expect(NumeracyMisconception.computeFlagged(3)).toBe(true);
    expect(NumeracyMisconception.computeFlagged(5)).toBe(true);
  });

  test('the flag is derived on the document, not left to the caller', async () => {
    const at = new subjects.NumeracyMisconception({
      student: oid(), concept: 'place value', incorrectCount: 3, school: oid(), academicYearId: oid(),
    });
    // validate() runs the pre-validate hook, unlike validateSync().
    await at.validate();
    expect(at.flagged).toBe(true);
  });

  test('science investigation safety checklist is structured data', () => {
    const inv = new subjects.ScienceInvestigation({
      student: oid(), title: 'Density', school: oid(),
      safetyChecklist: [{ item: 'Goggles worn', checked: true }],
    });
    expect(inv.validateSync()).toBeUndefined();
    expect(inv.safetyChecklist[0].item).toBe('Goggles worn');
  });

  test('language proficiency constrains the skill to the four modalities', () => {
    expect(subjects.LanguageProficiency.schema.path('skill').enumValues)
      .toEqual(['listening', 'speaking', 'reading', 'writing']);
  });

  test('all five subject collections are registered', () => {
    ['ReadingLevel', 'ReadingLogEntry', 'NumeracyMisconception', 'ScienceInvestigation', 'LanguageProficiency']
      .forEach((m) => expect(mongoose.models[m]).toBeDefined());
  });
});

describe('FP-022 — Insight integrity', () => {
  const insight = (o = {}) => new Insight({
    type: 'attendance-risk',
    affectedEntity: { collectionName: 'Student', id: oid() },
    explanation: 'Attendance fell below the warning threshold for three weeks.',
    sourceRefs: [{ collectionName: 'Attendance', id: oid() }],
    school: oid(), ...o,
  });

  test('a valid insight passes', () => expect(insight().validateSync()).toBeUndefined());

  test('an insight without an explanation is rejected', async () => {
    await expect(insight({ explanation: '' }).validate())
      .rejects.toThrow(/INSIGHT_EXPLANATION_REQUIRED/);
  });

  test('an insight without a source reference is rejected', async () => {
    await expect(insight({ sourceRefs: [] }).validate())
      .rejects.toThrow(/INSIGHT_SOURCE_REQUIRED/);
  });

  test('confidence is bounded to 0..1', () => {
    expect(insight({ confidence: 1.5 }).validateSync()).toBeDefined();
    expect(insight({ confidence: 0.8 }).validateSync()).toBeUndefined();
  });
});

describe('FP-022 — Consent is append-only', () => {
  const consent = (o = {}) => new Consent({
    student: oid(), parent: oid(), consentType: 'data-processing',
    version: 'v1', granted: true, school: oid(), ...o,
  });

  test('granting stamps grantedAt', async () => {
    const c = consent();
    await c.save().catch(() => {});
    expect(c.grantedAt).toBeInstanceOf(Date);
  });

  test('modifying an existing consent is rejected', async () => {
    const c = consent();
    c.isNew = false;
    await expect(c.save()).rejects.toThrow(/CONSENT_IMMUTABLE/);
  });

  test.each(['updateOne', 'findOneAndUpdate', 'replaceOne'])(
    'query-level %s is rejected', async (op) => {
      await expect(Consent[op]({ _id: oid() }, { $set: { granted: false } }))
        .rejects.toThrow(/CONSENT_IMMUTABLE/);
    }
  );
});

describe('FP-023 — NotificationProviderConfig (D-007)', () => {
  const cfg = (o = {}) => new NPC({ school: oid(), channel: 'sms', ...o });

  test('a valid config passes', () => expect(cfg().validateSync()).toBeUndefined());

  test('channel is constrained to sms and whatsapp', () => {
    expect(NPC.schema.path('channel').enumValues).toEqual(['sms', 'whatsapp']);
  });

  test('there is NO plaintext credential field — only a reference', () => {
    const paths = Object.keys(NPC.schema.paths);
    expect(paths).toContain('credentialsRef');
    // A field literally holding a secret cannot leak if it does not exist.
    expect(paths).not.toContain('apiKey');
    expect(paths).not.toContain('password');
    expect(paths).not.toContain('credentials');
  });

  test('toSafeJSON exposes whether a credential is set, never the reference', () => {
    const c = cfg({ provider: 'acme', credentialsRef: 'env:SMS_KEY', senderNumber: '+9111' });
    const safe = c.toSafeJSON();
    expect(safe.credentialConfigured).toBe(true);
    expect(safe).not.toHaveProperty('credentialsRef');
    // No value resembling the reference appears anywhere in the output.
    expect(JSON.stringify(safe)).not.toContain('env:SMS_KEY');
  });

  test('an unconfigured credential reports false', () => {
    expect(cfg().toSafeJSON().credentialConfigured).toBe(false);
  });

  test('the unique index is on school + channel', () => {
    const idx = NPC.schema.indexes().find(([, o]) => o && o.unique);
    expect(Object.keys(idx[0]).sort()).toEqual(['channel', 'school']);
  });

  test('no provider is enumerated — ADR-05 stays open', () => {
    // provider is a free string; the schema names no vendor. A String path with
    // no enum reports an empty enumValues array.
    const ev = NPC.schema.path('provider').enumValues;
    expect(ev).toEqual([]);
  });
});
