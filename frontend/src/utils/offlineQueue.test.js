// frontend/src/utils/offlineQueue.test.js
//
// FP-070 · Offline queue — behavioural tests with an in-memory store and a
// fake sync client. Real IndexedDB durability across a device restart is
// ENVIRONMENT/E2E VALIDATION PENDING; this proves the queue LOGIC.

import { OfflineQueue } from './offlineQueue';

function memStore(initial = []) {
  let ops = [...initial];
  return { read: () => [...ops], write: (next) => { ops = [...next]; } };
}
function fakeClient(responder) {
  return { post: async (_url, body) => ({ data: responder(body.operations) }) };
}
// Force online/offline deterministically.
function setOnline(v) { Object.defineProperty(navigator, 'onLine', { value: v, configurable: true }); }

beforeEach(() => setOnline(true));

describe('enqueue and pending', () => {
  test('enqueue adds an op with a unique opId', () => {
    const q = new OfflineQueue({ store: memStore(), client: fakeClient(() => ({ results: [], summary: {} })) });
    const id1 = q.enqueue('lessonPlan.create', { a: 1 });
    const id2 = q.enqueue('lessonPlan.create', { a: 2 });
    expect(id1).not.toBe(id2);
    expect(q.pending()).toHaveLength(2);
  });
});

describe('offline behaviour', () => {
  test('while offline, flush does nothing and the queue is retained', async () => {
    setOnline(false);
    const store = memStore();
    const q = new OfflineQueue({ store, client: fakeClient(() => { throw new Error('should not be called'); }) });
    q.enqueue('lessonPlan.create', { a: 1 });
    const r = await q.flush();
    expect(r).toBeNull();
    expect(q.pending()).toHaveLength(1);
  });
});

describe('flush semantics', () => {
  test('applied ops are removed from the queue', async () => {
    const store = memStore();
    const q = new OfflineQueue({
      store,
      client: fakeClient((ops) => ({ results: ops.map((o) => ({ opId: o.opId, status: 'applied' })), summary: { applied: ops.length } })),
    });
    q.enqueue('lessonPlan.create', { a: 1 });
    await q.flush();
    expect(q.pending()).toHaveLength(0);
  });

  test('a duplicate (already applied server-side) is also cleared', async () => {
    const store = memStore();
    const q = new OfflineQueue({
      store,
      client: fakeClient((ops) => ({ results: ops.map((o) => ({ opId: o.opId, status: 'duplicate', result: { id: 'x' } })), summary: {} })),
    });
    q.enqueue('lessonPlan.create', {});
    await q.flush();
    expect(q.pending()).toHaveLength(0);
  });

  test('a rejected op is dropped — it will never succeed on retry', async () => {
    const store = memStore();
    const q = new OfflineQueue({
      store,
      client: fakeClient((ops) => ({ results: ops.map((o) => ({ opId: o.opId, status: 'rejected', code: 'OFFLINE_FORBIDDEN' })), summary: {} })),
    });
    q.enqueue('lessonPlan.update', {});
    await q.flush();
    expect(q.pending()).toHaveLength(0);
  });

  test('a conflict is RETAINED and annotated for resolution', async () => {
    const store = memStore();
    const q = new OfflineQueue({
      store,
      client: fakeClient((ops) => ({ results: ops.map((o) => ({ opId: o.opId, status: 'conflict', current: { id: 'p', v: 2 }, message: 'changed' })), summary: {} })),
    });
    q.enqueue('lessonPlan.update', { baseUpdatedAt: 'old' });
    await q.flush();
    const remaining = q.pending();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].conflict).toEqual({ id: 'p', v: 2 });
    expect(remaining[0].conflictMessage).toBe('changed');
  });

  test('a retriable error keeps the whole queue', async () => {
    const store = memStore();
    const q = new OfflineQueue({
      store,
      client: fakeClient((ops) => ({ results: ops.map((o) => ({ opId: o.opId, status: 'error', retriable: true })), summary: {} })),
    });
    q.enqueue('lessonPlan.create', {});
    await q.flush();
    expect(q.pending()).toHaveLength(1);
  });

  test('a network failure keeps the queue and reports the error', async () => {
    const store = memStore();
    let status = null;
    const q = new OfflineQueue({ store, client: { post: async () => { throw { response: { status: 500 } }; } } });
    q.subscribe((s) => { status = s; });
    q.enqueue('lessonPlan.create', {});
    await q.flush();
    expect(q.pending()).toHaveLength(1);
    expect(status.lastError).toBe(500);
  });

  test('mixed results: applied cleared, conflict kept', async () => {
    const store = memStore();
    const q = new OfflineQueue({
      store,
      client: fakeClient((ops) => ({
        results: ops.map((o, i) => i === 0
          ? { opId: o.opId, status: 'applied' }
          : { opId: o.opId, status: 'conflict', current: {}, message: 'x' }),
        summary: {},
      })),
    });
    q.enqueue('lessonPlan.create', {});
    q.enqueue('lessonPlan.update', {});
    await q.flush();
    expect(q.pending()).toHaveLength(1);
  });
});

describe('status notifications', () => {
  test('subscribers see pending count changes', () => {
    const events = [];
    const q = new OfflineQueue({ store: memStore(), client: fakeClient(() => ({ results: [], summary: {} })) });
    q.subscribe((s) => events.push(s));
    setOnline(false); // avoid auto-flush
    q.enqueue('lessonPlan.create', {});
    expect(events.some((e) => e.pending === 1)).toBe(true);
  });
});

describe('conflict resolution', () => {
  test('drop removes a resolved op', () => {
    const q = new OfflineQueue({ store: memStore(), client: fakeClient(() => ({ results: [], summary: {} })) });
    setOnline(false);
    const id = q.enqueue('lessonPlan.update', {});
    expect(q.pending()).toHaveLength(1);
    q.drop(id);
    expect(q.pending()).toHaveLength(0);
  });
});
