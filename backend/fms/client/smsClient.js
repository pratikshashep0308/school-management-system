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

// ─── Call recording ──────────────────────────────────────────────────────────
// A sync cycle needs to report which endpoints it hit, what came back and
// whether the token had to be refreshed mid-run. Only this module knows the
// last two, so it collects them here rather than every ingest service
// reimplementing a guess.
//
// Recording is off unless somebody starts a collector, so nothing accumulates
// in normal operation and there is no global buffer to leak.
let collector = null;

/** Begin collecting. Returns the array the calls land in. */
function startRecording() {
  collector = [];
  return collector;
}

/** Stop, and hand back what was collected. */
function stopRecording() {
  const calls = collector || [];
  collector = null;
  return calls;
}

/** Full bodies are opt-in and truncated. See the fms_synclogs comment. */
const LOG_BODIES = String(process.env.FMS_SYNC_LOG_BODIES || '').toLowerCase() === 'true';
const BODY_LIMIT = 2000;
const truncate = (v) => {
  if (!LOG_BODIES || v === undefined) return undefined;
  const text = typeof v === 'string' ? v : JSON.stringify(v);
  return text.length > BODY_LIMIT ? `${text.slice(0, BODY_LIMIT)}… [truncated]` : text;
};

function record(entry) {
  if (collector) collector.push(entry);
}

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
  const startedAt = Date.now();

  for (;;) {
    const token = await getToken();
    try {
      const res = await http.get(path, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      // SMS convention is { success, data } but a few routes return raw arrays.
      const payload = res.data && typeof res.data === 'object' && 'data' in res.data
        ? res.data.data
        : res.data;

      record({
        endpoint: path,
        params,
        httpStatus: res.status,
        ok: true,
        records: Array.isArray(payload) ? payload.length : undefined,
        durationMs: Date.now() - startedAt,
        retries: attempt,
        responseBody: truncate(payload),
      });

      return payload;
    } catch (err) {
      const status = err.response?.status;

      if (status === 401 && attempt === 0) {
        clearToken();
        attempt += 1;
        continue; // one re-auth, then give up
      }

      const detail = err.response?.data?.message || err.message;

      record({
        endpoint: path,
        params,
        httpStatus: status,
        ok: false,
        durationMs: Date.now() - startedAt,
        retries: attempt,
        error: detail,
      });

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


/**
 * Fetch every page of a paginated SMS endpoint.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Several SMS list endpoints default to 50 rows — /fees/students and /expenses
 * among them — and `get()` returns only what came back. A caller that asks once
 * receives the first 50 and no indication there are more.
 *
 * That is not a loud failure. An import would post 50 fee ledgers, report
 * success, and silently ignore the rest; the trial balance would look plausible
 * and be wrong by whatever sits beyond page one. Nothing would flag it.
 *
 * ─── WHY IT PAGES BLIND ─────────────────────────────────────────────────────
 * The SMS returns { success, count, total, page, pages, data }, but `get()`
 * unwraps to `data` and the metadata never reaches us. Rather than change that
 * unwrapping — every existing caller depends on it — this keeps asking until a
 * page comes back shorter than requested. That is the reliable end-of-data
 * signal when you cannot see the total.
 *
 * @param {string} path
 * @param {object} [params]   merged into every request
 * @param {object} [opts]
 * @param {number} [opts.pageSize=200]
 * @param {number} [opts.maxPages=100]  hard stop; 20,000 rows
 * @returns {Promise<{rows: Array, pages: number, truncated: boolean}>}
 */
async function getAll(path, params = {}, { pageSize = 200, maxPages = 100 } = {}) {
  const rows = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await get(path, { ...params, page, limit: pageSize });
    const list = Array.isArray(batch) ? batch : (batch?.data || []);
    rows.push(...list);

    // A short page means there is no next one.
    if (list.length < pageSize) return { rows, pages: page, truncated: false };
  }

  // Ran out of pages before running out of data. Report it rather than let a
  // caller treat a prefix as the whole set.
  return { rows, pages: maxPages, truncated: true };
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
  getAll,
  health,
  authenticate,
  clearToken,
  endpoints,
  startRecording,
  stopRecording,
  // exposed for tests
  _internal: { tokenIsFresh },
};