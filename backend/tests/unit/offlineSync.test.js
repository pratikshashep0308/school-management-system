/**
 * FP-071 — offline sync service
 * Requirements: GAP-OFF-001..005 · FINAL LLD 1.1 §33
 * Test tier: B — UNIT, injected SyncLog and handlers. No database.
 *
 * Live browser/device offline behaviour (FP-070 service worker, real network
 * transitions) is ENVIRONMENT/E2E VALIDATION PENDING; this proves the SERVER
 * replay semantics.
 */
const svc = require('../../services/offlineSyncService');

const USER = { _id: 'user-1', school: 'school-1' };

/** In-memory SyncLog that records applied opIds. */
function makeSyncLog(seed = []) {
  const store = new Map(seed.map((r) => [`${r.opId}:${r.user}`, r]));
  return {
    store,
    findOne: (q) => ({ lean: async () => store.get(`${q.opId}:${q.user}`) || null }),
    create: async (doc) => { store.set(`${doc.opId}:${doc.user}`, doc); return doc; },
  };
}

const ctx = (SyncLog, handlers) => ({ user: USER, models: { SyncLog }, handlers });
const okHandler = (data = { id: 'x' }) => async () => ({ data });

describe('supported-operation whitelist', () => {
  test('an unknown op type is rejected, never applied', async () => {
    const r = await svc.applyOperation(
      { opId: 'o1', type: 'student.delete', payload: {} },
      ctx(makeSyncLog(), {})
    );
    expect(r.status).toBe('rejected');
    expect(r.code).toBe('OFFLINE_OP_UNSUPPORTED');
  });

  test('an operation without an opId is rejected', async () => {
    const r = await svc.applyOperation(
      { type: 'lessonPlan.create', payload: {} },
      ctx(makeSyncLog(), {})
    );
    expect(r.code).toBe('OFFLINE_OP_ID_REQUIRED');
  });

  test('promotion is NOT an offline-eligible operation', () => {
    // Promotion needs a transaction and a published group; queuing it is unsafe.
    expect(svc.SUPPORTED_OPS['promotion.confirm']).toBeUndefined();
    expect(svc.SUPPORTED_OPS['promotion.preview']).toBeUndefined();
  });
});

describe('idempotent replay', () => {
  test('a replayed opId returns the prior result and does NOT re-apply', async () => {
    const SyncLog = makeSyncLog([{ opId: 'o1', user: 'user-1', result: { id: 'plan-1' }, appliedAt: new Date() }]);
    let applied = 0;
    const handlers = { 'lessonPlan.create': async () => { applied++; return { data: { id: 'plan-2' } }; } };
    const r = await svc.applyOperation({ opId: 'o1', type: 'lessonPlan.create', payload: {} }, ctx(SyncLog, handlers));
    expect(r.status).toBe('duplicate');
    expect(r.result).toEqual({ id: 'plan-1' });
    // The handler was never called — no double write.
    expect(applied).toBe(0);
  });

  test('a first-time op applies and is recorded for future idempotency', async () => {
    const SyncLog = makeSyncLog();
    const r = await svc.applyOperation(
      { opId: 'o2', type: 'lessonPlan.create', payload: { date: '2026-08-20' } },
      ctx(SyncLog, { 'lessonPlan.create': okHandler({ id: 'plan-9' }) })
    );
    expect(r.status).toBe('applied');
    expect(SyncLog.store.has('o2:user-1')).toBe(true);
  });

  test('replaying the SAME batch twice applies each op exactly once', async () => {
    const SyncLog = makeSyncLog();
    let applied = 0;
    const handlers = { 'lessonPlan.create': async () => { applied++; return { data: { id: 'p' } }; } };
    const batch = [{ opId: 'a', type: 'lessonPlan.create', payload: {} }];
    await svc.processBatch(batch, ctx(SyncLog, handlers));
    await svc.processBatch(batch, ctx(SyncLog, handlers)); // replay
    expect(applied).toBe(1);
  });
});

describe('conflict handling', () => {
  test('a stale baseUpdatedAt is a conflict, not a silent overwrite', async () => {
    const handlers = {
      'lessonPlan.update': async () => ({ conflict: true, current: { id: 'p', updatedAt: 'newer' }, message: 'changed meanwhile' }),
    };
    const r = await svc.applyOperation(
      { opId: 'o3', type: 'lessonPlan.update', payload: { baseUpdatedAt: 'older' } },
      ctx(makeSyncLog(), handlers)
    );
    expect(r.status).toBe('conflict');
    expect(r.current).toBeDefined();
    // A conflict is NOT recorded as applied — the client must resolve it.
  });

  test('a conflict does not consume the opId (client can resolve and resend)', async () => {
    const SyncLog = makeSyncLog();
    const handlers = { 'lessonPlan.update': async () => ({ conflict: true, current: {}, message: 'x' }) };
    await svc.applyOperation({ opId: 'o4', type: 'lessonPlan.update', payload: {} }, ctx(SyncLog, handlers));
    expect(SyncLog.store.has('o4:user-1')).toBe(false);
  });
});

describe('authorization — offline grants no extra permission', () => {
  test('a forbidden operation is rejected exactly as when online', async () => {
    const handlers = { 'lessonPlan.update': async () => ({ forbidden: true, message: 'not yours' }) };
    const r = await svc.applyOperation(
      { opId: 'o5', type: 'lessonPlan.update', payload: {} },
      ctx(makeSyncLog(), handlers)
    );
    expect(r.status).toBe('rejected');
    expect(r.code).toBe('OFFLINE_FORBIDDEN');
  });

  test('a validation error is rejected with its message', async () => {
    const handlers = { 'lessonPlan.create': async () => ({ validationError: true, message: 'date outside year' }) };
    const r = await svc.applyOperation(
      { opId: 'o6', type: 'lessonPlan.create', payload: {} },
      ctx(makeSyncLog(), handlers)
    );
    expect(r.status).toBe('rejected');
    expect(r.message).toMatch(/outside year/);
  });
});

describe('partial success and retry', () => {
  test('one bad operation does not fail the batch', async () => {
    const SyncLog = makeSyncLog();
    const handlers = {
      'lessonPlan.create': okHandler({ id: 'ok' }),
      'lessonPlan.update': async () => ({ forbidden: true, message: 'no' }),
    };
    const { results, summary } = await svc.processBatch([
      { opId: 'g1', type: 'lessonPlan.create', payload: {} },
      { opId: 'b1', type: 'lessonPlan.update', payload: {} },
      { opId: 'g2', type: 'lessonPlan.create', payload: {} },
    ], ctx(SyncLog, handlers));
    expect(summary.applied).toBe(2);
    expect(summary.rejected).toBe(1);
    expect(results).toHaveLength(3);
  });

  test('a thrown error is marked retriable and not recorded as applied', async () => {
    const SyncLog = makeSyncLog();
    const handlers = { 'lessonPlan.create': async () => { throw new Error('db blip'); } };
    const r = await svc.applyOperation(
      { opId: 'o7', type: 'lessonPlan.create', payload: {} },
      ctx(SyncLog, handlers)
    );
    expect(r.status).toBe('error');
    expect(r.retriable).toBe(true);
    // Not recorded, so the client's retry will actually re-attempt.
    expect(SyncLog.store.has('o7:user-1')).toBe(false);
  });
});

describe('fingerprinting', () => {
  test('the same operation content yields the same fingerprint', () => {
    const a = svc.opFingerprint({ type: 't', payload: { x: 1 } });
    const b = svc.opFingerprint({ type: 't', payload: { x: 1 } });
    expect(a).toBe(b);
  });
  test('different content yields a different fingerprint', () => {
    const a = svc.opFingerprint({ type: 't', payload: { x: 1 } });
    const b = svc.opFingerprint({ type: 't', payload: { x: 2 } });
    expect(a).not.toBe(b);
  });
});
