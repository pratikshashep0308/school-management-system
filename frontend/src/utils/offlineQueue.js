// frontend/src/utils/offlineQueue.js
//
// FP-070/071 · Offline write queue (client side) · §33.
//
// Queues write operations while offline and replays them through POST /api/sync
// when connectivity returns. The server (offlineSyncService) is authoritative
// for idempotency, conflicts and authorization; this client half is responsible
// for durable local storage, an opId per operation, retry, and surfacing status.
//
// Storage: IndexedDB is the right tool, but to keep this dependency-free and
// testable we use a small localStorage-backed queue with a pluggable store, so a
// test can inject an in-memory store. Real IndexedDB persistence across a device
// restart is ENVIRONMENT/E2E VALIDATION PENDING.

import api from './api';

const QUEUE_KEY = 'tfsOfflineQueue';

/** A minimal store interface; defaults to localStorage, injectable for tests. */
function defaultStore() {
  return {
    read() {
      try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
      catch { return []; }
    },
    write(ops) {
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(ops)); }
      catch { /* private mode — queue will not persist across reloads */ }
    },
  };
}

/** A stable, unique operation id. Collisions would break server idempotency. */
function newOpId() {
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `op-${rand}`;
}

export class OfflineQueue {
  constructor({ store, client } = {}) {
    this.store = store || defaultStore();
    this.client = client || api;
    this.listeners = new Set();
  }

  /** Subscribe to status changes ({ pending, syncing, lastError }). */
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(status) { this.listeners.forEach((fn) => fn(status)); }

  isOnline() {
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }

  pending() { return this.store.read(); }

  /**
   * Enqueue an operation. Returns its opId. If online, a flush is attempted
   * immediately; if offline, it waits for the next flush.
   */
  enqueue(type, payload, { baseUpdatedAt } = {}) {
    const op = { opId: newOpId(), type, payload, baseUpdatedAt, queuedAt: Date.now() };
    const ops = this.store.read();
    ops.push(op);
    this.store.write(ops);
    this._emit({ pending: ops.length, syncing: false });
    if (this.isOnline()) this.flush();
    return op.opId;
  }

  /**
   * Replay the queue through /api/sync. Applied and rejected ops are removed
   * (a rejected op will never succeed on retry); conflicts and retriable errors
   * are RETAINED so the caller can resolve or retry.
   *
   * @returns {Promise<{results, summary}|null>} null if offline or empty
   */
  async flush() {
    const ops = this.store.read();
    if (ops.length === 0) return null;
    if (!this.isOnline()) { this._emit({ pending: ops.length, syncing: false, offline: true }); return null; }

    this._emit({ pending: ops.length, syncing: true });
    try {
      const { data } = await this.client.post('/sync', { operations: ops });
      const byId = new Map((data.results || []).map((r) => [r.opId, r]));

      // Keep only ops that must be retried or resolved.
      const remaining = ops.filter((op) => {
        const r = byId.get(op.opId);
        if (!r) return true; // no verdict — keep and retry
        if (r.status === 'applied' || r.status === 'duplicate') return false; // done
        if (r.status === 'rejected') return false; // will never succeed; drop
        // 'conflict' and 'error' (retriable) are kept.
        return true;
      }).map((op) => {
        const r = byId.get(op.opId);
        // Annotate conflicts so the UI can prompt resolution.
        if (r && r.status === 'conflict') return { ...op, conflict: r.current, conflictMessage: r.message };
        return op;
      });

      this.store.write(remaining);
      this._emit({ pending: remaining.length, syncing: false, lastSummary: data.summary });
      return data;
    } catch (err) {
      // Network or server failure — keep the whole queue and surface the error.
      this._emit({ pending: ops.length, syncing: false, lastError: err?.response?.status || 'network' });
      return null;
    }
  }

  /** Remove a specific op (e.g. after the user resolves a conflict). */
  drop(opId) {
    const ops = this.store.read().filter((o) => o.opId !== opId);
    this.store.write(ops);
    this._emit({ pending: ops.length, syncing: false });
  }

  /** Wire browser online/offline events to auto-flush. */
  attach() {
    if (typeof window === 'undefined') return () => {};
    const onOnline = () => this.flush();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }
}

export const offlineQueue = new OfflineQueue();
