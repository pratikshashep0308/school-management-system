/**
 * FP-053..FP-059 — TFS-EOS API controllers
 * Requirements: GAP-CCR-*, GAP-MTP-*, GAP-SLP-*, GAP-SUB-*, GAP-QA-*, GAP-CON-*, GAP-NOT-006, GAP-GOV-*
 * Decisions: D-007, D-009, ADR-04, ADR-05 · FINAL LLD 1.1 §23,§25,§26,§28,§32
 * Test tier: B — UNIT, stubbed models. Behavioural, not source inspection.
 */
const mongoose = require('mongoose');
require('../../models');

const oid = () => new mongoose.Types.ObjectId();
function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
const req = (over = {}) => ({ user: { _id: oid(), role: 'schoolAdmin', school: oid() }, body: {}, params: {}, query: {}, ...over });

describe('FP-055 — passport parent view uses the safeguarding filter', () => {
  const passportCtrl = require('../../controllers/passportController');
  const PassportEntry = require('../../models/PassportEntry');

  test('parentView queries through parentVisibleFilter, excluding wellbeing', async () => {
    let usedFilter = null;
    const orig = PassportEntry.find;
    PassportEntry.find = (f) => { usedFilter = f; return { sort: () => ({ lean: async () => [] }) }; };
    try {
      await passportCtrl.parentView(req({ params: { id: oid() } }), mockRes());
      // The controller must use the model's filter, which excludes wellbeing by type.
      expect(usedFilter.visibility).toBe('parent');
      expect(usedFilter.entryType.$nin).toContain('wellbeing');
    } finally { PassportEntry.find = orig; }
  });

  test('staff view does NOT apply the parent restriction', async () => {
    let usedFilter = null;
    const orig = PassportEntry.find;
    PassportEntry.find = (f) => { usedFilter = f; return { sort: () => ({ lean: async () => [] }) }; };
    try {
      await passportCtrl.staffView(req({ params: { id: oid() } }), mockRes());
      expect(usedFilter.visibility).toBeUndefined();
    } finally { PassportEntry.find = orig; }
  });
});

describe('FP-056 — subject milestone writes are idempotent', () => {
  const ctrl = require('../../controllers/subjectModulesController');
  const PassportEntry = require('../../models/PassportEntry');

  test('an existing milestone for the same source is not duplicated', async () => {
    const origFind = PassportEntry.findOne;
    const origCreate = PassportEntry.create;
    let created = 0;
    PassportEntry.findOne = () => ({ lean: async () => ({ _id: oid() }) }); // already exists
    PassportEntry.create = async () => { created++; return {}; };
    try {
      const src = { collectionName: 'ReadingLevel', id: oid() };
      await ctrl._writeMilestone({
        studentId: oid(), schoolId: oid(), academicYearId: oid(),
        entryType: 'reading-milestone', title: 'x', sourceRef: src,
      });
      expect(created).toBe(0);
    } finally { PassportEntry.findOne = origFind; PassportEntry.create = origCreate; }
  });

  test('a new milestone is created when none exists for the source', async () => {
    const origFind = PassportEntry.findOne;
    const origCreate = PassportEntry.create;
    let created = 0;
    PassportEntry.findOne = () => ({ lean: async () => null });
    PassportEntry.create = async () => { created++; return {}; };
    try {
      await ctrl._writeMilestone({
        studentId: oid(), schoolId: oid(), academicYearId: oid(),
        entryType: 'reading-milestone', title: 'x', sourceRef: { collectionName: 'ReadingLevel', id: oid() },
      });
      expect(created).toBe(1);
    } finally { PassportEntry.findOne = origFind; PassportEntry.create = origCreate; }
  });
});

describe('FP-058 — notification config never accepts an inline secret (D-007)', () => {
  const ctrl = require('../../controllers/notificationConfigController');

  test('an inline secret in credentialsRef is REJECTED', async () => {
    const res = mockRes();
    await ctrl.upsert(req({ body: { channel: 'sms', credentialsRef: 'AC123actualsecretkey' } }), res);
    // Must be a reference, not a raw secret flowing through the API.
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/reference/);
  });

  test('a reference form is accepted', async () => {
    const NPC = require('../../models/NotificationProviderConfig');
    const orig = NPC.findOneAndUpdate;
    NPC.findOneAndUpdate = async () => ({ toSafeJSON: () => ({ channel: 'sms', credentialConfigured: true }) });
    try {
      const res = mockRes();
      await ctrl.upsert(req({ body: { channel: 'sms', provider: 'acme', credentialsRef: 'env:SMS_KEY' } }), res);
      expect(res.body.success).toBe(true);
      // The response is masked — no reference leaks.
      expect(JSON.stringify(res.body)).not.toContain('env:SMS_KEY');
    } finally { NPC.findOneAndUpdate = orig; }
  });

  test('status reports delivery as PENDING — ADR-05 not yet implemented', async () => {
    const NPC = require('../../models/NotificationProviderConfig');
    const orig = NPC.find;
    NPC.find = async () => ([{ channel: 'sms', provider: 'acme', credentialsRef: 'env:K', isActive: true }]);
    try {
      const res = mockRes();
      await ctrl.status(req(), res);
      expect(res.body.channels.sms.deliveryValidated).toBe(false);
      expect(res.body.channels.sms.deliveryStatus).toMatch(/PENDING/);
    } finally { NPC.find = orig; }
  });
});

describe('FP-057 — consent is recorded append-only via the API', () => {
  const ctrl = require('../../controllers/qualityController');
  const { Consent } = require('../../models/qualityConsentInsight');

  test('recording consent CREATES a new record (never updates)', async () => {
    const orig = Consent.create;
    let createdWith = null;
    Consent.create = async (doc) => { createdWith = doc; return doc; };
    try {
      const res = mockRes();
      await ctrl.recordConsent(req({ body: { student: oid(), consentType: 'data', version: 'v1', granted: false } }), res);
      expect(res.statusCode).toBe(201);
      // A withdrawal is a new granted:false record, not a mutation.
      expect(createdWith.granted).toBe(false);
    } finally { Consent.create = orig; }
  });
});

describe('FP-059 — audit console is read-only and surfaces ADR-13 failures', () => {
  const ctrl = require('../../controllers/auditConsoleController');
  const AuditLog = require('../../models/AuditLog');

  test('the console exposes only read operations', () => {
    // Behavioural: the controller has no create/update/delete handler.
    expect(ctrl.query).toBeDefined();
    expect(ctrl.actions).toBeDefined();
    expect(ctrl.securitySummary).toBeDefined();
    expect(ctrl.create).toBeUndefined();
    expect(ctrl.update).toBeUndefined();
    expect(ctrl.delete).toBeUndefined();
  });

  test('the security summary counts authorization.failure records (ADR-13)', async () => {
    const orig = AuditLog.countDocuments;
    const seen = [];
    AuditLog.countDocuments = async (f) => { seen.push(f.action); return 3; };
    try {
      const res = mockRes();
      await ctrl.securitySummary(req(), res);
      expect(seen).toContain('authorization.failure');
      expect(res.body.authorizationFailures).toBe(3);
    } finally { AuditLog.countDocuments = orig; }
  });
});

describe('the API tier registers cleanly and preserves the promotion invariant', () => {
  test('no new controller imports the promotion models directly', () => {
    // FP-052 is the single promotion entry point. None of these controllers may
    // reimplement enrolment writes.
    const fs = require('fs');
    const path = require('path');
    const dir = path.resolve(__dirname, '../../controllers');
    const tfsControllers = [
      'curriculumController', 'plannerController', 'passportController',
      'subjectModulesController', 'qualityController',
      'notificationConfigController', 'auditConsoleController',
    ];
    for (const name of tfsControllers) {
      const src = fs.readFileSync(path.join(dir, `${name}.js`), 'utf8');
      expect(src).not.toMatch(/\$addToSet.*students|\$pull.*students/);
      expect(src).not.toMatch(/PromotionRecord/);
    }
  });

  test('every mounted moduleKey is registered — startup assertion still passes', () => {
    const { ROUTE_TABLE } = require('../../config/routeTable');
    const { MODULES } = require('../../routes/permissionRoutes');
    const { checkModuleKeys } = require('../../utils/assertModuleKeys');
    expect(checkModuleKeys(ROUTE_TABLE, MODULES).ok).toBe(true);
  });

  test('every tuple-form router named export resolves', () => {
    const { ROUTE_TABLE } = require('../../config/routeTable');
    for (const [, file] of ROUTE_TABLE) {
      if (Array.isArray(file)) {
        const mod = require(`../../${file[0].replace(/^\.\//, '')}`);
        expect(mod[file[1]]).toBeDefined();
      }
    }
  });
});
