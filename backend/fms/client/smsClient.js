// backend/fms/client/smsClient.js
//
// The ONLY way the FMS reads SMS data.
//
// Architectural constraint (DATA_DICTIONARY §0.1): the FMS never imports an SMS
// Mongoose model, never reads an SMS collection directly, and never writes to
// one. Every SMS read goes through this client over HTTP.
//
// Discovery findings this addresses:
//   G3 — JWT_EXPIRE is 30d on this deployment. A statically-issued service token
//        expires mid-life and ingest starts failing with 401s and no alarm.
//        So: authenticate programmatically, cache in memory, re-auth on 401.
//   G2 — the service user is over-privileged by construction (no read-only
//        finance role exists in the SMS). This client therefore exposes GET
//        helpers only. There is deliberately no post/put/delete method.

const axios = require('axios');
const config = require('../config');

let cachedToken = null;
let cachedAt = 0;

function tokenIsFresh() {
  return cachedToken && Date.now() - cachedAt < config.sms.tokenTtlMs;
}

/** Drop the cached token. Called on 401 and by tests. */
function clearToken() {
  cachedToken = null;
  cachedAt = 0;
}

const http = axios.create({
  baseURL: config.sms.baseUrl,
  timeout: config.sms.timeoutMs,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Authenticate as the FMS service user and cache the token.
 * Never logs the credentials or the token.
 */
async function authenticate() {
  const { serviceEmail, servicePassword } = config.sms;
  if (!serviceEmail || !servicePassword) {
    throw new Error(
      'FMS service credentials are not configured. Set FMS_SERVICE_EMAIL and FMS_SERVICE_PASSWORD.'
    );
  }

  const res = await http.post('/auth/login', {
    email: serviceEmail,
    password: servicePassword,
  });

  const token = res.data?.token || res.data?.data?.token;
  if (!token) {
    throw new Error('SMS login succeeded but returned no token.');
  }

  cachedToken = token;
  cachedAt = Date.now();
  return token;
}

async function getToken() {
  if (tokenIsFresh()) return cachedToken;
  return authenticate();
}

/**
 * GET an SMS endpoint as the service user.
 *
 * Retries once on 401 (token expired or revoked). A second consecutive 401 is
 * thrown to the caller — the ingest job surfaces it as an alert rather than
 * retrying indefinitely.
 *
 * @param {string} path   e.g. '/fees/students'
 * @param {object} params query string
 * @returns {Promise<any>} the `data` field of the {success,data} envelope,
 *                         or the raw body if the response isn't enveloped.
 */
async function get(path, params = {}) {
  let attempt = 0;

  for (;;) {
    const token = await getToken();
    try {
      const res = await http.get(path, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      // SMS convention is { success, data } but a few routes return raw arrays.
      return res.data && typeof res.data === 'object' && 'data' in res.data
        ? res.data.data
        : res.data;
    } catch (err) {
      const status = err.response?.status;

      if (status === 401 && attempt === 0) {
        clearToken();
        attempt += 1;
        continue; // one re-auth, then give up
      }

      const detail = err.response?.data?.message || err.message;
      const wrapped = new Error(`SMS GET ${path} failed (${status || 'network'}): ${detail}`);
      wrapped.status = status;
      wrapped.isSmsError = true;
      throw wrapped;
    }
  }
}

/**
 * Liveness probe (enhancement E3 — confirm the SMS is reachable before an
 * ingest cycle rather than failing partway through).
 */
async function health() {
  try {
    const res = await http.get('/health', { timeout: 5000 });
    return { reachable: true, status: res.status, body: res.data };
  } catch (err) {
    return { reachable: false, error: err.message };
  }
}

// ── Read-only endpoint helpers ───────────────────────────────────────────────
// Endpoints verified present in backend/routes/ during discovery P0.3 §2.2.
// Implementations land in Phase 5; the surface is fixed here so the ingest
// adapters have something stable to build against.

const endpoints = {
  feeStudents: () => get('/fees/students'),
  feeAssignments: () => get('/fees/assignments'),
  feeTypes: () => get('/fees/types'),
  feeRecentPayments: () => get('/fees/recent-payments'),
  salarySlips: () => get('/salary'),
  expenses: () => get('/expenses'),
  expenseCategories: () => get('/expenses/categories'),
  students: () => get('/students'),
  teachers: () => get('/teachers'),
  classes: () => get('/classes'),
};

module.exports = {
  get,
  health,
  authenticate,
  clearToken,
  endpoints,
  // exposed for tests
  _internal: { tokenIsFresh },
};