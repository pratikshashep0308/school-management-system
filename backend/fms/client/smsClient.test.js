// backend/fms/client/smsClient.test.js
//
//   node --test fms/client/smsClient.test.js
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// smsClient is the single point through which every piece of SMS data enters
// the books. Token caching, re-authentication on 401, envelope unwrapping,
// error wrapping and call recording all happen here, and until now none of it
// had a test. Every ingest suite stubs this module out — which is right for
// those tests, and means the real one was never exercised by anything.
//
// The failure it guards against is quiet. If re-auth stops working, ingest does
// not crash: it throws a 401 that gets logged as "the SMS could not be reached",
// somebody restarts something, and the real cause — a token that expired
// thirty days after deployment — is found weeks later.
//
// axios is stubbed at require time. No network, no database, no server.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');

// ─── Stub axios before the client is loaded ──────────────────────────────────
const calls = [];
let handlers = {};

const makeError = (status, message) => {
  const err = new Error(message || `Request failed with status code ${status}`);
  err.response = { status, data: { message } };
  return err;
};

const fakeAxios = {
  create() {
    return {
      async get(url, cfg = {}) {
        calls.push({ method: 'get', url, params: cfg.params, headers: cfg.headers });
        const h = handlers.get;
        if (!h) throw new Error(`no stub for GET ${url}`);
        return h(url, cfg, calls.filter((c) => c.method === 'get').length);
      },
      async post(url, body) {
        calls.push({ method: 'post', url, body });
        const h = handlers.post;
        if (!h) throw new Error(`no stub for POST ${url}`);
        return h(url, body, calls.filter((c) => c.method === 'post').length);
      },
    };
  },
};

const realResolve = Module._resolveFilename;
const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'axios') return fakeAxios;
  return realLoad.apply(this, [request, parent, isMain]);
};

process.env.FMS_SERVICE_EMAIL = 'fms-service@school.in';
process.env.FMS_SERVICE_PASSWORD = 'not-a-real-password';

const clientPath = path.join(__dirname, 'smsClient.js');
delete require.cache[realResolve(clientPath, module, false)];
const smsClient = require('./smsClient');

function reset({ getHandler, postHandler } = {}) {
  calls.length = 0;
  smsClient.clearToken();
  handlers = {
    post: postHandler || (async () => ({ data: { token: 'token-1' } })),
    get: getHandler || (async () => ({ status: 200, data: { success: true, data: [] } })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
test('authenticates once and reuses the token', async () => {
  reset();
  await smsClient.get('/fees/students');
  await smsClient.get('/fees/assignments');

  const logins = calls.filter((c) => c.method === 'post' && c.url === '/auth/login');
  assert.equal(logins.length, 1, 'should log in once, not per request');
  assert.equal(calls.filter((c) => c.method === 'get').length, 2);
});

test('never puts credentials in a query string', async () => {
  reset();
  await smsClient.get('/fees/students', { from: '2026-04-01' });
  const get = calls.find((c) => c.method === 'get');
  assert.deepEqual(get.params, { from: '2026-04-01' });
  assert.match(get.headers.Authorization, /^Bearer /);
});

// ─── THE ONE THAT MATTERS ────────────────────────────────────────────────────
test('re-authenticates once on 401 and completes the request', async () => {
  // Discovery finding G3: JWT_EXPIRE is 30 days on this deployment. A token
  // cached at deploy time expires mid-life, and without this retry every ingest
  // silently starts failing a month after go-live.
  let attempt = 0;
  reset({
    getHandler: async () => {
      attempt += 1;
      if (attempt === 1) throw makeError(401, 'jwt expired');
      return { status: 200, data: { success: true, data: [{ receiptNumber: 'RCP-1' }] } };
    },
  });

  const out = await smsClient.get('/fees/students');

  assert.equal(out.length, 1, 'the request should succeed after re-auth');
  assert.equal(attempt, 2, 'should retry exactly once');
  assert.equal(
    calls.filter((c) => c.url === '/auth/login').length, 2,
    'should have logged in again rather than reusing the dead token',
  );
});

test('gives up after a second consecutive 401 rather than looping', async () => {
  // A revoked service account returns 401 forever. Retrying indefinitely would
  // hammer the SMS and hang the cycle instead of surfacing the problem.
  let attempt = 0;
  reset({
    getHandler: async () => { attempt += 1; throw makeError(401, 'unauthorised'); },
  });

  await assert.rejects(
    () => smsClient.get('/fees/students'),
    (err) => err.isSmsError && /401/.test(err.message),
  );
  assert.equal(attempt, 2, 'exactly two attempts, then stop');
});

test('does not retry a 500 — that is the SMS being broken, not a stale token', async () => {
  let attempt = 0;
  reset({
    getHandler: async () => { attempt += 1; throw makeError(500, 'internal error'); },
  });

  await assert.rejects(() => smsClient.get('/salary'));
  assert.equal(attempt, 1);
});

test('wraps errors with the endpoint and status so a log line is diagnosable', async () => {
  reset({ getHandler: async () => { throw makeError(503, 'upstream down'); } });

  await assert.rejects(
    () => smsClient.get('/admissions'),
    (err) => {
      assert.match(err.message, /\/admissions/);
      assert.match(err.message, /503/);
      assert.match(err.message, /upstream down/);
      assert.equal(err.status, 503);
      assert.equal(err.isSmsError, true);
      return true;
    },
  );
});

test('unwraps the {success,data} envelope but passes a bare array through', async () => {
  reset({
    getHandler: async (url) => (url === '/wrapped'
      ? { status: 200, data: { success: true, data: [1, 2, 3] } }
      : { status: 200, data: [4, 5] }),
  });

  assert.deepEqual(await smsClient.get('/wrapped'), [1, 2, 3]);
  assert.deepEqual(await smsClient.get('/bare'), [4, 5]);
});

test('has no write methods at all', () => {
  // Deliberate: the FMS is a read-only consumer of SMS data, and the service
  // user is over-privileged by construction because no read-only finance role
  // exists in the SMS. The absence of these is the safeguard.
  assert.equal(smsClient.post, undefined);
  assert.equal(smsClient.put, undefined);
  assert.equal(smsClient.delete, undefined);
  assert.equal(smsClient.patch, undefined);
});

// ─── Call recording, used by the sync log ────────────────────────────────────
test('records nothing until a collector is started', async () => {
  reset();
  await smsClient.get('/fees/students');
  const collected = smsClient.startRecording();
  assert.deepEqual(collected, [], 'the earlier call must not appear');
  smsClient.stopRecording();
});

test('records endpoint, status, count, duration and retries', async () => {
  reset({
    getHandler: async () => ({ status: 200, data: { success: true, data: [1, 2, 3, 4] } }),
  });

  smsClient.startRecording();
  await smsClient.get('/fees/students', { from: '2026-04-01' });
  const recorded = smsClient.stopRecording();

  assert.equal(recorded.length, 1);
  const [c] = recorded;
  assert.equal(c.endpoint, '/fees/students');
  assert.deepEqual(c.params, { from: '2026-04-01' });
  assert.equal(c.httpStatus, 200);
  assert.equal(c.ok, true);
  assert.equal(c.records, 4);
  assert.equal(c.retries, 0);
  assert.equal(typeof c.durationMs, 'number');
});

test('records the retry count when a token had to be refreshed', async () => {
  let attempt = 0;
  reset({
    getHandler: async () => {
      attempt += 1;
      if (attempt === 1) throw makeError(401, 'jwt expired');
      return { status: 200, data: { success: true, data: [] } };
    },
  });

  smsClient.startRecording();
  await smsClient.get('/fees/students');
  const [c] = smsClient.stopRecording();

  assert.equal(c.retries, 1, 'a silent re-auth must still be visible in the log');
  assert.equal(c.ok, true);
});

test('records a failed call, with its reason', async () => {
  reset({ getHandler: async () => { throw makeError(503, 'upstream down'); } });

  smsClient.startRecording();
  await assert.rejects(() => smsClient.get('/library/issues'));
  const [c] = smsClient.stopRecording();

  assert.equal(c.ok, false);
  assert.equal(c.httpStatus, 503);
  assert.match(c.error, /upstream down/);
});

test('stores no request or response body unless explicitly enabled', async () => {
  // FMS_SYNC_LOG_BODIES is unset here. If this ever regresses, the sync log
  // becomes a second, unprotected copy of every student's payment history.
  reset({
    getHandler: async () => ({
      status: 200,
      data: { success: true, data: [{ studentName: 'Aarti Patil', amount: 5000 }] },
    }),
  });

  smsClient.startRecording();
  await smsClient.get('/fees/students');
  const [c] = smsClient.stopRecording();

  assert.equal(c.responseBody, undefined);
  assert.equal(c.requestBody, undefined);
  assert.ok(!JSON.stringify(c).includes('Aarti'), 'no personal data in the record');
});

test('stopping without starting returns an empty list rather than throwing', async () => {
  reset();
  assert.deepEqual(smsClient.stopRecording(), []);
});

test('refuses to authenticate when no credentials are configured', async () => {
  const email = process.env.FMS_SERVICE_EMAIL;
  const pass = process.env.FMS_SERVICE_PASSWORD;
  process.env.FMS_SERVICE_EMAIL = '';
  process.env.FMS_SERVICE_PASSWORD = '';

  // config caches at require time, so re-require both to pick the change up.
  delete require.cache[realResolve(path.join(__dirname, '..', 'config', 'index.js'), module, false)];
  delete require.cache[realResolve(clientPath, module, false)];
  const fresh = require('./smsClient');

  reset();
  await assert.rejects(
    () => fresh.get('/fees/students'),
    /credentials are not configured/,
  );

  process.env.FMS_SERVICE_EMAIL = email;
  process.env.FMS_SERVICE_PASSWORD = pass;
});

test.after(() => { Module._load = realLoad; });
