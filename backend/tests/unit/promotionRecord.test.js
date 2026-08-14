/**
 * FP-014 — PromotionRecord
 * Requirements: GAP-SIS-005, GAP-SIS-007, GAP-SIS-008 · Decisions D-004, D-006
 * Test tier: B — UNIT. Schema validation runs in memory; no database required.
 */
const mongoose = require('mongoose');
require('../../models/PromotionRecord');
const PromotionRecord = mongoose.model('PromotionRecord');

const oid = () => new mongoose.Types.ObjectId();
const base = (over = {}) => new PromotionRecord({
  student: oid(), fromClass: oid(), toClass: oid(),
  fromGrade: '6', fromSection: 'A', toGrade: '7', toSection: 'A',
  fromAcademicYear: oid(), toAcademicYear: oid(),
  decision: 'promoted', school: oid(), ...over,
});

describe('D-004 — transition identity', () => {
  test('fromClass and toClass are ObjectId references, not strings', () => {
    expect(PromotionRecord.schema.path('fromClass').instance).toBe('ObjectId');
    expect(PromotionRecord.schema.path('toClass').instance).toBe('ObjectId');
    expect(PromotionRecord.schema.path('fromClass').options.ref).toBe('Class');
    expect(PromotionRecord.schema.path('toClass').options.ref).toBe('Class');
  });

  test('grade/section strings are retained as readability aids', () => {
    const paths = Object.keys(PromotionRecord.schema.paths);
    ['fromGrade', 'fromSection', 'toGrade', 'toSection'].forEach((p) =>
      expect(paths).toContain(p)
    );
    // Strings, not identity — a renamed Class must not break resolution.
    expect(PromotionRecord.schema.path('fromGrade').instance).toBe('String');
  });

  test('a valid promoted record passes validation', () => {
    expect(base().validateSync()).toBeUndefined();
  });
});

describe('BR-SIS-02 / BR-SIS-03 — decisions carry their reasons', () => {
  test('retained without a reason is rejected', async () => {
    await expect(base({ decision: 'retained', toClass: null, toAcademicYear: null }).validate())
      .rejects.toThrow(/RETENTION_REASON_REQUIRED/);
  });

  test('retained with a reason is accepted', async () => {
    await expect(base({
      decision: 'retained', toClass: null, toAcademicYear: null,
      retentionReason: 'Below passing marks in three subjects',
    }).validate()).resolves.toBeUndefined();
  });

  test('a whitespace-only reason does not satisfy the rule', async () => {
    await expect(base({
      decision: 'retained', toClass: null, toAcademicYear: null, retentionReason: '   ',
    }).validate()).rejects.toThrow(/RETENTION_REASON_REQUIRED/);
  });

  test('override without a reason is rejected', async () => {
    await expect(base({ overridden: true }).validate())
      .rejects.toThrow(/PROMOTION_OVERRIDE_REASON_REQUIRED/);
  });

  test('override with a reason is accepted', async () => {
    await expect(base({ overridden: true, overrideReason: 'Grace promotion approved by principal' })
      .validate()).resolves.toBeUndefined();
  });
});

describe('decision coherence', () => {
  test('promoted must name a target class', async () => {
    await expect(base({ toClass: null }).validate())
      .rejects.toThrow(/PROMOTION_TARGET_REQUIRED/);
  });

  test('graduated must NOT name a target class', async () => {
    await expect(base({ decision: 'graduated' }).validate())
      .rejects.toThrow(/PROMOTION_GRADUATED_HAS_TARGET/);
  });

  test('graduated with no target is accepted', async () => {
    await expect(base({ decision: 'graduated', toClass: null, toAcademicYear: null })
      .validate()).resolves.toBeUndefined();
  });

  test('decision enum is exactly promoted, retained, graduated', () => {
    expect(PromotionRecord.schema.path('decision').enumValues)
      .toEqual(['promoted', 'retained', 'graduated']);
  });
});

describe('append-only immutability', () => {
  test('saving an existing document is rejected', async () => {
    const doc = base();
    doc.isNew = false;
    await expect(doc.save()).rejects.toThrow(/PROMOTION_RECORD_IMMUTABLE/);
  });

  test.each(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'])(
    'query-level %s is rejected', async (op) => {
      // A document hook alone would not catch these — they bypass it entirely.
      await expect(PromotionRecord[op]({ _id: oid() }, { $set: { decision: 'retained' } }))
        .rejects.toThrow(/PROMOTION_RECORD_IMMUTABLE/);
    }
  );
});

describe('D-006 — historical enrolment support', () => {
  test('carries both academic year references', () => {
    const paths = Object.keys(PromotionRecord.schema.paths);
    expect(paths).toContain('fromAcademicYear');
    expect(paths).toContain('toAcademicYear');
  });

  test('batchId is indexed for idempotent bulk promotion', () => {
    expect(PromotionRecord.schema.path('batchId').options.index).toBe(true);
  });

  test('computedPassFail snapshots provenance, not just the outcome', () => {
    const doc = base({
      computedPassFail: {
        examGroup: oid(), retestPolicy: 'best',
        subjects: [{ examSubject: oid(), obtained: 41, graceMarks: 2, isPass: true, isAbsent: false }],
      },
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.computedPassFail.retestPolicy).toBe('best');
    expect(doc.computedPassFail.examGroup).toBeDefined();
  });

  test('describe() renders the transition for audit payloads', () => {
    expect(base().describe()).toBe('6-A → 7-A');
    expect(base({ decision: 'graduated', toClass: null }).describe()).toBe('6-A → graduated');
    expect(base({ decision: 'retained', toClass: null, retentionReason: 'x' }).describe())
      .toBe('6-A → retained');
  });
});
