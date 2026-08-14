/**
 * ADR-13 — authorization infrastructure failure fails closed
 * Requirements: GAP-IAM-006 · SEC-001 · FINAL LLD 1.1 §31, §44
 * Test tier: B — UNIT, mocked req/res and a stubbed permission source.
 *
 * The six behavioural proofs the decision requires.
 */
const mongoose = require('mongoose');
require('../../models');

// checkPermission resolves permissions through RolePermission; stub that model
// so we can make the lookup succeed, deny, or throw at will.
const RolePermission = require('../../models/RolePermission');
const checkPermission = require('../../middleware/checkPermission');
const { clearPermissionCache } = require('../../middleware/checkPermission');

const oid = () => new mongoose.Types.ObjectId();

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function runMiddleware(mw, req) {
  const res = mockRes();
  let nextCalled = false;
  // The factory returns an async function; await it so all internal awaits
  // (matrix lookup, audit) settle before we inspect the outcome.
  await mw(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

const req = (over = {}) => ({
  user: { _id: oid(), role: 'teacher', school: oid(), name: 'T' },
  method: 'GET',
  ...over,
});

function stubMatrix(behaviour) {
  const orig = RolePermission.findOne;
  // getPermissions awaits findOne() directly (no .lean()) and reads
  // doc.permissions. Return a doc shaped like that, or throw.
  RolePermission.findOne = async () => {
    if (behaviour === 'throw') throw new Error('SIMULATED: replica set unreachable during lookup');
    if (behaviour === 'authorized') return { role: 'teacher', permissions: { students: 'edit' } };
    if (behaviour === 'unauthorized') return { role: 'teacher', permissions: { students: 'none' } };
    return null;
  };
  return () => { RolePermission.findOne = orig; };
}

beforeEach(() => clearPermissionCache());

describe('ADR-13 — the six required proofs', () => {
  test('1 — lookup succeeds + authorized → allowed', async () => {
    const restore = stubMatrix('authorized');
    try {
      const { res, nextCalled } = await runMiddleware(checkPermission('students'), req());
      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBeNull();
    } finally { restore(); }
  });

  test('2 — lookup succeeds + unauthorized → denied', async () => {
    const restore = stubMatrix('unauthorized');
    try {
      const { res, nextCalled } = await runMiddleware(checkPermission('students'), req());
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(403);
    } finally { restore(); }
  });

  test('3 — lookup THROWS → denied, not allowed', async () => {
    const restore = stubMatrix('throw');
    try {
      const { res, nextCalled } = await runMiddleware(checkPermission('students'), req());
      // The core of ADR-13: an authorization dependency error must deny.
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(403);
    } finally { restore(); }
  });

  test('4 — the client receives a SAFE error, with no internal detail', async () => {
    const restore = stubMatrix('throw');
    try {
      const { res } = await runMiddleware(checkPermission('students'), req());
      const serialized = JSON.stringify(res.body);
      // The simulated internal message must never reach the client.
      expect(serialized).not.toMatch(/replica set unreachable/);
      expect(serialized).not.toMatch(/SIMULATED/);
      // A generic message and an opaque reference are acceptable.
      expect(res.body.message).toMatch(/could not be verified/i);
      expect(res.body.ref).toMatch(/^authz-/);
    } finally { restore(); }
  });

  test('5 — the internal failure is auditable', async () => {
    const auditService = require('../../services/auditService');
    const orig = auditService.audit;
    const calls = [];
    auditService.audit = async (entry) => { calls.push(entry); };
    const restore = stubMatrix('throw');
    try {
      await runMiddleware(checkPermission('students'), req());
      const failure = calls.find((c) => c.action === 'authorization.failure');
      expect(failure).toBeDefined();
      expect(failure.module).toBe('students');
      expect(failure.meta.reason).toBe('authorization_dependency_error');
    } finally { restore(); auditService.audit = orig; }
  });

  test('6 — NO credentials, tokens or secrets in the audit payload', async () => {
    const auditService = require('../../services/auditService');
    const orig = auditService.audit;
    const calls = [];
    auditService.audit = async (entry) => { calls.push(entry); };
    const restore = stubMatrix('throw');
    try {
      await runMiddleware(checkPermission('students'), req({
        user: { _id: oid(), role: 'teacher', school: oid(), password: 'SECRET', token: 'JWT.SECRET' },
      }));
      const failure = calls.find((c) => c.action === 'authorization.failure');
      const serialized = JSON.stringify(failure);
      expect(serialized).not.toMatch(/SECRET/);
      expect(serialized).not.toMatch(/JWT\.SECRET/);
      // The internal error text is also absent from the audit record.
      expect(serialized).not.toMatch(/replica set unreachable/);
    } finally { restore(); auditService.audit = orig; }
  });
});

describe('ADR-13 — an audit failure cannot resurrect an allow', () => {
  test('when auditing itself throws, the request is STILL denied', async () => {
    const auditService = require('../../services/auditService');
    const orig = auditService.audit;
    auditService.audit = async () => { throw new Error('audit sink down'); };
    const restore = stubMatrix('throw');
    try {
      const { res, nextCalled } = await runMiddleware(checkPermission('students'), req());
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(403);
    } finally { restore(); auditService.audit = orig; }
  });
});
