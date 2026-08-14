/**
 * FP-052 — promotion & SIS API (critical path)
 * Requirements: GAP-SIS-005..009, GAP-PA-004 · Decisions D-004, D-010, D-011
 * FINAL LLD 1.1 §18.3, §19
 *
 * Test tier: B — UNIT. The controller is tested against a stubbed promotionService
 * to prove it ROUTES THROUGH the service and never reimplements promotion logic.
 * Transaction semantics themselves are owned and tested by FP-037; live execution
 * is ENVIRONMENT VALIDATION PENDING.
 */
const mongoose = require('mongoose');
require('../../models');
const ctrl = require('../../controllers/promotionController');
const promotionService = require('../../services/promotionService');
const historicalEnrolment = require('../../services/historicalEnrolmentService');
const auditService = require('../../services/auditService');

const oid = () => new mongoose.Types.ObjectId();

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const req = (over = {}) => ({
  user: { _id: oid(), role: 'schoolAdmin', school: oid() },
  body: {}, params: {}, query: {}, ...over,
});

let audited;
beforeEach(() => {
  audited = [];
  auditService.audit = async (e) => { audited.push(e); };
});

describe('the controller routes through promotionService, never reimplements it', () => {
  test('previewPromotion calls promotionService.preview', async () => {
    const orig = promotionService.preview;
    let calledWith = null;
    promotionService.preview = async (args) => { calledWith = args; return { rows: [], counts: {} }; };
    try {
      const res = mockRes();
      await ctrl.previewPromotion(req({
        body: { classId: oid(), examGroupId: oid(), academicYearId: oid() },
      }), res);
      expect(calledWith).not.toBeNull();
      expect(res.body.success).toBe(true);
    } finally { promotionService.preview = orig; }
  });

  test('confirmPromotion calls promotionService.confirm and returns its summary', async () => {
    const orig = promotionService.confirm;
    promotionService.confirm = async () => ({ alreadyApplied: false, promoted: 3, retained: 1, graduated: 0, written: 4 });
    try {
      const res = mockRes();
      await ctrl.confirmPromotion(req({
        body: { previewResult: { rows: [] }, batchId: 'B1' },
      }), res);
      expect(res.body.promoted).toBe(3);
      expect(res.body.written).toBe(4);
    } finally { promotionService.confirm = orig; }
  });

  test('the controller does NOT import Student, Class or PromotionRecord', () => {
    // A second write path with different guarantees is exactly what D-004 forbids.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../controllers/promotionController.js'), 'utf8');
    expect(src).not.toMatch(/require\(['"].*models\/Student['"]\)/);
    expect(src).not.toMatch(/require\(['"].*models\/Class['"]\)/);
    expect(src).not.toMatch(/require\(['"].*models\/PromotionRecord['"]\)/);
    // No direct enrolment mutation verbs.
    expect(src).not.toMatch(/\$addToSet|\$pull|bulkWrite/);
  });
});

describe('input validation', () => {
  test('preview requires classId, examGroupId and academicYearId', async () => {
    const res = mockRes();
    await ctrl.previewPromotion(req({ body: { classId: oid() } }), res);
    expect(res.statusCode).toBe(400);
  });

  test('confirm requires previewResult and batchId', async () => {
    const res = mockRes();
    await ctrl.confirmPromotion(req({ body: { batchId: 'B1' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('D-011 blockers surface as 422 with detail', () => {
  test('an unpublished group returns 422 and the code', async () => {
    const orig = promotionService.preview;
    promotionService.preview = async () => {
      const e = new Error('Final results must be announced.');
      e.code = 'PROMOTION_BLOCKED_GROUP_UNPUBLISHED';
      throw e;
    };
    try {
      const res = mockRes();
      await ctrl.previewPromotion(req({
        body: { classId: oid(), examGroupId: oid(), academicYearId: oid() },
      }), res);
      expect(res.statusCode).toBe(422);
      expect(res.body.code).toBe('PROMOTION_BLOCKED_GROUP_UNPUBLISHED');
    } finally { promotionService.preview = orig; }
  });

  test('missing marks return 422 with the missing pairs', async () => {
    const orig = promotionService.preview;
    promotionService.preview = async () => {
      const e = new Error('marks missing');
      e.code = 'PROMOTION_BLOCKED_MARKS_INCOMPLETE';
      e.missing = [{ student: oid(), subjectName: 'Science' }];
      throw e;
    };
    try {
      const res = mockRes();
      await ctrl.previewPromotion(req({
        body: { classId: oid(), examGroupId: oid(), academicYearId: oid() },
      }), res);
      expect(res.statusCode).toBe(422);
      expect(res.body.missing).toHaveLength(1);
    } finally { promotionService.preview = orig; }
  });
});

describe('transaction and integrity failures map to honest status codes', () => {
  test('no transaction capability → 503, not a fake success', async () => {
    const orig = promotionService.confirm;
    promotionService.confirm = async () => {
      const e = new Error('no txn'); e.code = promotionService.ERR.NO_TRANSACTIONS; throw e;
    };
    try {
      const res = mockRes();
      await ctrl.confirmPromotion(req({ body: { previewResult: { rows: [] }, batchId: 'B1' } }), res);
      expect(res.statusCode).toBe(503);
      expect(res.body.success).toBe(false);
    } finally { promotionService.confirm = orig; }
  });

  test('a membership mismatch → 409 with the offending students', async () => {
    const orig = promotionService.confirm;
    promotionService.confirm = async () => {
      const e = new Error('drift'); e.code = promotionService.ERR.MEMBERSHIP; e.students = [oid()]; throw e;
    };
    try {
      const res = mockRes();
      await ctrl.confirmPromotion(req({ body: { previewResult: { rows: [] }, batchId: 'B1' } }), res);
      expect(res.statusCode).toBe(409);
      expect(res.body.students).toHaveLength(1);
    } finally { promotionService.confirm = orig; }
  });
});

describe('duplicate / retry behaviour', () => {
  test('an already-applied batch returns success without re-auditing', async () => {
    const orig = promotionService.confirm;
    promotionService.confirm = async () => ({ alreadyApplied: true, batchId: 'B1', written: 0 });
    try {
      const res = mockRes();
      await ctrl.confirmPromotion(req({ body: { previewResult: { rows: [] }, batchId: 'B1' } }), res);
      expect(res.body.alreadyApplied).toBe(true);
      // Idempotent: a retry does not emit a second audit record.
      expect(audited.find((a) => a.action === 'promotion.confirm')).toBeUndefined();
    } finally { promotionService.confirm = orig; }
  });

  test('a fresh confirm DOES audit', async () => {
    const orig = promotionService.confirm;
    promotionService.confirm = async () => ({ alreadyApplied: false, promoted: 1, retained: 0, graduated: 0, written: 1 });
    try {
      await ctrl.confirmPromotion(req({ body: { previewResult: { rows: [] }, batchId: 'B2' } }), mockRes());
      expect(audited.find((a) => a.action === 'promotion.confirm')).toBeDefined();
    } finally { promotionService.confirm = orig; }
  });
});

describe('history and roster read from transition records', () => {
  test('studentHistory delegates to historicalEnrolmentService', async () => {
    const orig = historicalEnrolment.historyForStudent;
    historicalEnrolment.historyForStudent = async () => ([{ academicYear: { name: '2026-27' }, provenance: 'transition-backed' }]);
    try {
      const res = mockRes();
      await ctrl.studentHistory(req({ params: { id: oid() } }), res);
      expect(res.body.history).toHaveLength(1);
    } finally { historicalEnrolment.historyForStudent = orig; }
  });

  test('classRoster requires academicYearId', async () => {
    const res = mockRes();
    await ctrl.classRoster(req({ params: { id: oid() }, query: {} }), res);
    expect(res.statusCode).toBe(400);
  });
});
