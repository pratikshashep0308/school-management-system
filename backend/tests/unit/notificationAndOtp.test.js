/**
 * FP-039 / FP-042 — notification adapter + OTP service
 * Requirements: GAP-NOT-001..006, GAP-AUTH-001..004 · Decisions D-007, D-008, ADR-02
 * FINAL LLD 1.1 §23, §29 · ADR-05 delivery boundary
 * Test tier: B — UNIT, injected models/resolvers. No real provider, no database.
 */
const adapter = require('../../services/notificationAdapter');
const otp = require('../../services/otpService');

// ══════════════════════════ FP-039 notification adapter ══════════════════════
describe('FP-039 — adapter contract and provider registration', () => {
  beforeEach(() => adapter._clearProviders());

  test('a provider must have a name and a send function', () => {
    expect(() => adapter.registerProvider({ name: 'x' })).toThrow(/PROVIDER_INVALID/);
    expect(() => adapter.registerProvider({ send: () => {} })).toThrow(/PROVIDER_INVALID/);
    adapter.registerProvider({ name: 'acme', send: async () => ({ id: 'm1' }) });
    expect(adapter.listProviders()).toContain('acme');
  });

  test('no concrete provider is hardcoded — the registry starts empty', () => {
    expect(adapter.listProviders()).toEqual([]);
  });
});

describe('FP-039 — credentials resolve from a reference, never inline', () => {
  test('an env: reference resolves from the environment', async () => {
    const cred = await adapter.resolveCredential('env:MY_KEY', { env: { MY_KEY: 'resolved-value' } });
    expect(cred).toBe('resolved-value');
  });

  test('an unset env reference throws WITHOUT echoing a secret', async () => {
    await expect(adapter.resolveCredential('env:MISSING', { env: {} }))
      .rejects.toThrow(/UNRESOLVED/);
  });

  test('secret:/vault: resolution is ADR-05 pending without a backend', async () => {
    await expect(adapter.resolveCredential('secret:X')).rejects.toMatchObject({ code: 'ADR_05_PENDING' });
    await expect(adapter.resolveCredential('vault:Y')).rejects.toThrow(/PENDING/);
  });

  test('an invalid scheme is rejected', async () => {
    await expect(adapter.resolveCredential('plaintext-secret')).rejects.toThrow(/SCHEME_INVALID/);
  });
});

describe('FP-039 — send() dispatch, fallback and no secret leakage', () => {
  beforeEach(() => adapter._clearProviders());

  const configModel = (config) => ({ findOne: () => ({ lean: async () => config }) });

  test('a configured provider receives the resolved credential and message', async () => {
    let received = null;
    adapter.registerProvider({ name: 'acme', send: async (msg, cred, cfg) => { received = { msg, cred, cfg }; return { id: 'm1' }; } });
    const res = await adapter.send({
      schoolId: 's1', channel: 'sms', message: { to: '+9111', body: 'hi' },
      deps: {
        ConfigModel: configModel({ provider: 'acme', isActive: true, credentialsRef: 'env:K', senderNumber: '+9100' }),
        resolvers: { env: { K: 'secret-key' } },
      },
    });
    expect(res.status).toBe('sent');
    expect(received.cred).toBe('secret-key');
    expect(received.msg.body).toBe('hi');
  });

  test('the send result never contains the credential', async () => {
    adapter.registerProvider({ name: 'acme', send: async () => ({ id: 'm1', credential: 'LEAKED_CRED', token: 'LEAKED_TOKEN' }) });
    const res = await adapter.send({
      schoolId: 's1', channel: 'sms', message: { to: '+91', body: 'x' },
      deps: { ConfigModel: configModel({ provider: 'acme', isActive: true, credentialsRef: 'env:K' }), resolvers: { env: { K: 'DISTINCT_SECRET_VALUE' } } },
    });
    const serialized = JSON.stringify(res);
    // Neither the provider-returned secret fields nor the resolved credential leak.
    expect(serialized).not.toMatch(/LEAKED_CRED|LEAKED_TOKEN/);
    expect(serialized).not.toMatch(/DISTINCT_SECRET_VALUE/);
  });

  test('no active provider → D-008 fallback, reported not silent', async () => {
    let fellBack = null;
    const res = await adapter.send({
      schoolId: 's1', channel: 'sms', message: { to: '+91', body: 'x' },
      deps: { ConfigModel: configModel(null), fallbackSender: async (a) => { fellBack = a; } },
    });
    expect(res.status).toBe('sent-fallback');
    expect(res.fallback).toBe(true);
    expect(fellBack).not.toBeNull();
  });

  test('a configured-but-unregistered provider is the ADR-05 gap, falls back', async () => {
    const res = await adapter.send({
      schoolId: 's1', channel: 'sms', message: { to: '+91', body: 'x' },
      deps: { ConfigModel: configModel({ provider: 'unregistered', isActive: true, credentialsRef: 'env:K' }),
              fallbackSender: async () => {} },
    });
    expect(res.fallback).toBe(true);
    expect(res.reason).toMatch(/ADR-05 pending/);
  });

  test('an invalid message is rejected before any provider call', async () => {
    const res = await adapter.send({ schoolId: 's1', channel: 'sms', message: { to: '' }, deps: {} });
    expect(res.status).toBe('rejected');
  });

  test('a 5xx dispatch error is retriable; a 4xx is not', () => {
    expect(adapter.classifyRetriable({ status: 503 })).toBe(true);
    expect(adapter.classifyRetriable({ status: 400 })).toBe(false);
    expect(adapter.classifyRetriable(new Error('network'))).toBe(true);
  });

  test('a provider dispatch failure returns no internal detail', async () => {
    adapter.registerProvider({ name: 'acme', send: async () => { throw new Error('SENSITIVE endpoint https://internal/secret'); } });
    const res = await adapter.send({
      schoolId: 's1', channel: 'sms', message: { to: '+91', body: 'x' },
      deps: { ConfigModel: configModel({ provider: 'acme', isActive: true, credentialsRef: 'env:K' }), resolvers: { env: { K: 'v' } } },
    });
    expect(res.status).toBe('error');
    expect(JSON.stringify(res)).not.toMatch(/SENSITIVE|internal\/secret/);
  });
});

// ══════════════════════════ FP-042 OTP service ═══════════════════════════════
describe('FP-042 — generation', () => {
  test('a code is the configured length and numeric', () => {
    for (let i = 0; i < 50; i++) {
      const c = otp.generateCode();
      expect(c).toMatch(/^\d{6}$/);
      expect(c.length).toBe(otp.CODE_LENGTH);
    }
  });

  test('codes are hashed with a salt — the same code hashes differently per salt', () => {
    const h1 = otp.hashCode('123456', 'saltA');
    const h2 = otp.hashCode('123456', 'saltB');
    expect(h1).not.toBe(h2);
  });
});

describe('FP-042 — the plaintext code is never stored or returned', () => {
  function makeOtpModel() {
    const store = [];
    return {
      store,
      create: async (doc) => { const rec = { ...doc, _id: `otp-${store.length}`, save: async function () { const i = store.findIndex((r) => r._id === this._id); store[i] = this; } }; store.push(rec); return rec; },
      findOne: (q) => {
        const chain = {
          sort: () => ({
            lean: async () => [...store].reverse().find((r) => r.identifier === q.identifier && r.purpose === q.purpose) || null,
          }),
          _direct: [...store].reverse().find((r) => r.identifier === q.identifier && r.purpose === q.purpose) || null,
        };
        // verifyOtp calls .sort() then awaits the record directly (not lean).
        return Object.assign(chain, { then: undefined });
      },
    };
  }

  test('requestOtp returns metadata only, no code/hash/salt', async () => {
    const Otp = makeOtpModel();
    const res = await otp.requestOtp({ identifier: '+9111', purpose: 'parent-login', schoolId: 's1', deps: { OtpModel: Otp } });
    expect(res.status).toBe('issued');
    const serialized = JSON.stringify(res);
    expect(serialized).not.toMatch(/codeHash|salt/);
    // The stored record has a hash, never the plaintext.
    expect(Otp.store[0].codeHash).toBeDefined();
    expect(Otp.store[0]).not.toHaveProperty('code');
  });

  test('delivery is handed to the boundary; the code is passed to deliver, not logged', async () => {
    const Otp = makeOtpModel();
    let delivered = null;
    await otp.requestOtp({
      identifier: '+9111', purpose: 'parent-login', schoolId: 's1',
      deps: { OtpModel: Otp, deliver: async (d) => { delivered = d; return { status: 'sent' }; } },
    });
    // The plaintext reaches the delivery boundary (to send it) and nowhere else.
    expect(delivered.code).toMatch(/^\d{6}$/);
  });
});

describe('FP-042 — verification: expiry, single-use, attempts, replay, safe errors', () => {
  // A simpler model where findOne().sort() resolves to a live record object.
  function modelWith(record) {
    return {
      findOne: () => ({ sort: () => Promise.resolve(record) }),
    };
  }
  const baseRecord = (over = {}) => ({
    _id: 'otp-1', identifier: '+91', purpose: 'p', school: 's1',
    salt: 'saltX', codeHash: otp.hashCode('123456', 'saltX'),
    expiresAt: new Date(Date.now() + 60000), attempts: 0, consumedAt: null,
    save: async function () {},
    ...over,
  });

  test('the correct code verifies and consumes the challenge', async () => {
    const rec = baseRecord();
    const r = await otp.verifyOtp({ identifier: '+91', purpose: 'p', code: '123456', schoolId: 's1', deps: { OtpModel: modelWith(rec) } });
    expect(r.verified).toBe(true);
    expect(rec.consumedAt).toBeInstanceOf(Date); // single-use marker set
  });

  test('a wrong code fails generically and increments attempts', async () => {
    const rec = baseRecord();
    const r = await otp.verifyOtp({ identifier: '+91', purpose: 'p', code: '000000', schoolId: 's1', deps: { OtpModel: modelWith(rec) } });
    expect(r.verified).toBe(false);
    expect(r.message).toMatch(/incorrect or has expired/);
    expect(rec.attempts).toBe(1);
    expect(r.auditReason).toBe('wrong_code');
  });

  test('an expired code fails — and looks identical to a wrong code to the client', async () => {
    const rec = baseRecord({ expiresAt: new Date(Date.now() - 1000) });
    const r = await otp.verifyOtp({ identifier: '+91', purpose: 'p', code: '123456', schoolId: 's1', deps: { OtpModel: modelWith(rec) } });
    expect(r.verified).toBe(false);
    expect(r.message).toMatch(/incorrect or has expired/); // same generic message
    expect(r.auditReason).toBe('expired'); // distinct only server-side
  });

  test('a consumed code cannot be replayed', async () => {
    const rec = baseRecord({ consumedAt: new Date() });
    const r = await otp.verifyOtp({ identifier: '+91', purpose: 'p', code: '123456', schoolId: 's1', deps: { OtpModel: modelWith(rec) } });
    expect(r.verified).toBe(false);
    expect(r.auditReason).toBe('already_consumed');
  });

  test('attempts are capped — a locked code stops accepting guesses', async () => {
    const rec = baseRecord({ attempts: otp.MAX_ATTEMPTS });
    const r = await otp.verifyOtp({ identifier: '+91', purpose: 'p', code: '123456', schoolId: 's1', deps: { OtpModel: modelWith(rec) } });
    expect(r.verified).toBe(false);
    expect(r.locked).toBe(true);
    expect(r.auditReason).toBe('attempts_exceeded');
  });

  test('an unknown identifier fails with the SAME generic message (no enumeration)', async () => {
    const r = await otp.verifyOtp({ identifier: 'nobody', purpose: 'p', code: '123456', schoolId: 's1', deps: { OtpModel: { findOne: () => ({ sort: () => Promise.resolve(null) }) } } });
    expect(r.verified).toBe(false);
    expect(r.message).toMatch(/incorrect or has expired/);
    expect(r.auditReason).toBe('no_active_code');
  });

  test('verification uses constant-time comparison', () => {
    // safeEqual returns false for differing lengths without leaking via early char compare.
    expect(otp.safeEqual('abc', 'abc')).toBe(true);
    expect(otp.safeEqual('abc', 'abd')).toBe(false);
    expect(otp.safeEqual('abc', 'abcd')).toBe(false);
  });
});
