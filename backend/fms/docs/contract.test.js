// backend/fms/docs/contract.test.js
//
// Contract test: does what we actually return match what openapi.js promises?
//
//   node --test fms/docs/contract.test.js
//
// It runs the FMS router in-process against a stub — no database, no network,
// no replica set — so it can run anywhere, including a pre-commit hook.
//
// This is the test that P1.5 asks to be broken deliberately: change a response
// shape in routes/index.js, run this, watch it fail, then fix it.
//
// Deliberately hand-rolled rather than pulling in ajv. The subset of JSON
// Schema that OpenAPI 3.0.3 uses for response bodies is small, and a schema
// library would be a new dependency for one test file.

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const spec = require('./openapi');

// ─────────────────────────────────────────────────────────────────────────────
// Minimal JSON Schema validator — enough for OpenAPI 3.0.3 response bodies.
// ─────────────────────────────────────────────────────────────────────────────

function resolveRef(ref) {
  // '#/components/schemas/Error' → spec.components.schemas.Error
  const parts = ref.replace(/^#\//, '').split('/');
  return parts.reduce((o, k) => o?.[k], spec);
}

function validate(value, schema, path = '$') {
  const problems = [];
  if (!schema) return problems;

  if (schema.$ref) return validate(value, resolveRef(schema.$ref), path);

  const type = schema.type;

  if (type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      problems.push(`${path}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`);
      return problems;
    }
    for (const req of schema.required || []) {
      if (!(req in value)) problems.push(`${path}.${req}: required property missing`);
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (k in value && value[k] !== null) {
        problems.push(...validate(value[k], sub, `${path}.${k}`));
      }
    }
    return problems;
  }

  if (type === 'array') {
    if (!Array.isArray(value)) {
      problems.push(`${path}: expected array, got ${typeof value}`);
      return problems;
    }
    value.forEach((v, i) => problems.push(...validate(v, schema.items, `${path}[${i}]`)));
    return problems;
  }

  const actual = typeof value;

  if (type === 'string') {
    if (actual !== 'string') { problems.push(`${path}: expected string, got ${actual}`); return problems; }
    if (schema.enum && !schema.enum.includes(value)) {
      problems.push(`${path}: '${value}' not in [${schema.enum.join(', ')}]`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      problems.push(`${path}: '${value}' does not match ${schema.pattern}`);
    }
  } else if (type === 'integer') {
    if (!Number.isInteger(value)) problems.push(`${path}: expected integer, got ${value}`);
    if (schema.minimum !== undefined && value < schema.minimum) {
      problems.push(`${path}: ${value} < minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      problems.push(`${path}: ${value} > maximum ${schema.maximum}`);
    }
  } else if (type === 'number') {
    if (actual !== 'number') problems.push(`${path}: expected number, got ${actual}`);
  } else if (type === 'boolean') {
    if (actual !== 'boolean') { problems.push(`${path}: expected boolean, got ${actual}`); return problems; }
    if (schema.enum && !schema.enum.includes(value)) {
      problems.push(`${path}: ${value} not in [${schema.enum.join(', ')}]`);
    }
  }

  return problems;
}

/** The response schema declared for a path + method + status. */
function schemaFor(path, method, status) {
  const op = spec.paths?.[path]?.[method];
  if (!op) return null;
  let resp = op.responses?.[status] ?? op.responses?.[String(status)];
  if (!resp) return null;
  if (resp.$ref) resp = resolveRef(resp.$ref);
  return resp.content?.['application/json']?.schema || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot the FMS router against a stubbed environment.
// ─────────────────────────────────────────────────────────────────────────────

let server;
let baseUrl;

const USER_ID = '507f1f77bcf86cd799439011';
const SCHOOL_ID = '507f1f77bcf86cd799439012';

// Flipped by the deny-by-default tests to simulate a user with no FMS role.
let grantRole = true;

/**
 * fmsAuthorize caches assignments for 30s, so flipping the stub is not enough
 * on its own — the cache must be cleared too. That the cache exists at all is
 * why clearAuthCache is exported.
 */
function setRole(granted) {
  grantRole = granted;
  require('../middleware/fmsAuthorize').clearAuthCache();
}

async function boot() {
  process.env.FMS_ENABLED = 'true';

  // Stub the SMS `protect` middleware so no JWT is needed.
  const authPath = require.resolve('../../middleware/auth');
  require.cache[authPath] = {
    id: authPath, filename: authPath, loaded: true,
    exports: {
      protect: (req, res, next) => {
        req.user = { _id: USER_ID, school: SCHOOL_ID };
        next();
      },
      authorize: () => (req, res, next) => next(),
    },
  };

  // Stub the MODEL layer only — fmsAuthorize itself runs for real, so this
  // still exercises the deny-by-default guard rather than bypassing it.
  const modelsPath = require.resolve('../models/core');
  require.cache[modelsPath] = {
    id: modelsPath, filename: modelsPath, loaded: true,
    exports: {
      FmsRoleAssignment: {
        findOne: () => ({
          lean: async () => (grantRole
            ? { smsUserId: USER_ID, school: SCHOOL_ID, financeRole: 'chairman',
                permissions: {}, multiBranch: false, status: 'active' }
            : null),
        }),
      },
      FmsFinancialYear: {
        find: () => ({ select: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) }) }),
        countDocuments: async () => 0,
        findOne: () => ({ select: () => ({ lean: async () => null }) }),
      },
      constants: {},
    },
  };

  const express = require('express');
  const app = express();
  app.use('/api/fms', require('../routes'));
  // Stand-in for the SMS 404 handler. Written without a path pattern so it
  // behaves identically on Express 4 (deployed) and Express 5.
  app.use((req, res) => res.status(404).json({ success: false, message: 'SMS 404' }));

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api/fms`;
      resolve();
    });
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(baseUrl + path, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) { /* not JSON */ }
        resolve({ status: res.statusCode, json, raw: body, headers: res.headers });
      });
    }).on('error', reject);
  });
}

test.before(boot);
test.after(() => server && server.close());

// ─────────────────────────────────────────────────────────────────────────────
test('the spec itself is well-formed', async (t) => {
  await t.test('is OpenAPI 3.0.3 with a version', () => {
    assert.strictEqual(spec.openapi, '3.0.3');
    assert.ok(spec.info?.version);
  });

  await t.test('every $ref resolves', () => {
    const refs = [];
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (typeof node.$ref === 'string') refs.push(node.$ref);
      Object.values(node).forEach(walk);
    })(spec);

    assert.ok(refs.length > 0, 'expected the spec to use $ref');
    for (const ref of refs) {
      assert.ok(resolveRef(ref), `unresolved $ref: ${ref}`);
    }
  });

  await t.test('every path declares at least a 200 or 503', () => {
    for (const [p, ops] of Object.entries(spec.paths)) {
      for (const [m, op] of Object.entries(ops)) {
        const codes = Object.keys(op.responses || {});
        assert.ok(
          codes.some((c) => c.startsWith('2') || c === '503'),
          `${m.toUpperCase()} ${p} declares no success response`
        );
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('implemented responses match the spec', async (t) => {
  await t.test('GET /status', async () => {
    const r = await get('/status');
    assert.strictEqual(r.status, 200);
    const problems = validate(r.json, schemaFor('/status', 'get', 200));
    assert.deepStrictEqual(problems, [], problems.join('\n'));
  });

  await t.test('GET /health — 200 or 503, both documented', async () => {
    const r = await get('/health');
    assert.ok([200, 503].includes(r.status), `unexpected status ${r.status}`);
    if (r.status === 200) {
      const problems = validate(r.json, schemaFor('/health', 'get', 200));
      assert.deepStrictEqual(problems, [], problems.join('\n'));
    } else {
      // Without a database this is the expected branch. It must still be
      // documented, and it must still carry the standard envelope shape.
      assert.ok(schemaFor('/health', 'get', 503), '503 is undocumented');
      assert.strictEqual(r.json.success, false);
      assert.ok(r.json.data);
      assert.strictEqual(r.json.data.transactionsAvailable, false);
    }
  });

  await t.test('GET /financial-years returns a valid paginated envelope', async () => {
    const r = await get('/financial-years');
    assert.strictEqual(r.status, 200);
    const problems = validate(r.json, schemaFor('/financial-years', 'get', 200));
    assert.deepStrictEqual(problems, [], problems.join('\n'));
    assert.strictEqual(r.json.pagination.page, 1);
    assert.strictEqual(r.json.pagination.limit, 25);
  });

  await t.test('GET /docs/openapi.json serves the spec', async () => {
    const r = await get('/docs/openapi.json');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.openapi, '3.0.3');
    assert.ok(r.json.paths['/status']);
  });

  await t.test('GET /docs renders HTML with a relaxed CSP', async () => {
    const r = await get('/docs');
    assert.strictEqual(r.status, 200);
    assert.match(r.headers['content-type'], /html/);
    assert.match(r.raw, /<redoc/);
    assert.match(r.headers['content-security-policy'] || '', /cdn\.redoc\.ly/);
    assert.match(r.raw, /noindex/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('error responses match the Error schema', async (t) => {
  const errorSchema = spec.components.schemas.Error;

  await t.test('unknown FMS route → 404 in the FMS envelope', async () => {
    const r = await get('/no-such-route');
    assert.strictEqual(r.status, 404);
    const problems = validate(r.json, errorSchema);
    assert.deepStrictEqual(problems, [], problems.join('\n'));
    assert.strictEqual(r.json.error.code, 'NOT_FOUND');
    // Must NOT fall through to the SMS handler.
    assert.notStrictEqual(r.json.message, 'SMS 404');
  });

  await t.test('bad ObjectId → 400 with a code', async () => {
    const r = await get('/financial-years/not-an-objectid');
    assert.strictEqual(r.status, 400);
    const problems = validate(r.json, errorSchema);
    assert.deepStrictEqual(problems, [], problems.join('\n'));
    assert.strictEqual(r.json.error.code, 'BAD_REQUEST');
  });

  await t.test('unsortable field → 400 listing what is allowed', async () => {
    const r = await get('/financial-years?sort=-secretField');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json.error.code, 'BAD_REQUEST');
    assert.ok(Array.isArray(r.json.error.details?.allowed));
  });

  await t.test('unknown fyStatus → 400, not a silently empty list', async () => {
    const r = await get('/financial-years?fyStatus=nonsense');
    assert.strictEqual(r.status, 400);
    assert.ok(r.json.error.details?.allowed.includes('open'));
  });

  await t.test('no FMS role → 403, never a fall-through', async () => {
    setRole(false);
    try {
      const r = await get('/financial-years');
      assert.strictEqual(r.status, 403);
      const problems = validate(r.json, errorSchema);
      assert.deepStrictEqual(problems, [], problems.join('\n'));
      assert.strictEqual(r.json.error.code, 'FORBIDDEN');
    } finally {
      setRole(true);
    }
  });

  await t.test('authorization runs BEFORE validation', async () => {
    // A caller with no FMS role sending a malformed id must get 403, not 400.
    // Validating first would tell an unauthorised caller whether their input
    // was well-formed — a small but real information leak.
    setRole(false);
    try {
      const r = await get('/financial-years/not-an-objectid');
      assert.strictEqual(r.status, 403);
    } finally {
      setRole(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('pagination helper', async (t) => {
  const { parsePagination, DEFAULT_LIMIT, MAX_LIMIT } = require('../utils/apiResponse');

  await t.test('defaults', () => {
    const p = parsePagination({});
    assert.strictEqual(p.page, 1);
    assert.strictEqual(p.limit, DEFAULT_LIMIT);
    assert.strictEqual(p.skip, 0);
  });

  await t.test('caps limit at MAX_LIMIT', () => {
    assert.strictEqual(parsePagination({ limit: '99999' }).limit, MAX_LIMIT);
  });

  await t.test('rejects junk rather than erroring', () => {
    const p = parsePagination({ page: 'abc', limit: '-5' });
    assert.strictEqual(p.page, 1);
    assert.strictEqual(p.limit, DEFAULT_LIMIT);
  });

  await t.test('skip is computed from page and limit', () => {
    assert.strictEqual(parsePagination({ page: '3', limit: '10' }).skip, 20);
  });

  await t.test('sort direction', () => {
    const p = parsePagination({ sort: '-startDate,yearCode' }, { allowedSort: ['startDate', 'yearCode'] });
    assert.deepStrictEqual(p.sort, { startDate: -1, yearCode: 1 });
  });

  await t.test('a disallowed sort throws rather than being ignored', () => {
    assert.throws(
      () => parsePagination({ sort: 'password' }, { allowedSort: ['yearCode'] }),
      /Cannot sort by/
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('validation helper', async (t) => {
  const { validate: v, check, ApiError } = require('../utils/apiResponse');

  await t.test('collects every failure, not just the first', () => {
    try {
      v({ a: 'x' }, {
        a: { required: true, rules: [check.integer] },
        b: { required: true, rules: [check.nonEmpty] },
        c: { required: true, rules: [check.objectId] },
      });
      assert.fail('expected a throw');
    } catch (e) {
      assert.ok(e instanceof ApiError);
      assert.strictEqual(e.status, 422);
      assert.deepStrictEqual(Object.keys(e.details.fields).sort(), ['a', 'b', 'c']);
    }
  });

  await t.test('paise rule rejects float rupees', () => {
    assert.ok(check.paise(1234.56));
    assert.strictEqual(check.paise(123456), null);
  });

  await t.test('optional absent fields pass', () => {
    assert.strictEqual(v({}, { x: { rules: [check.integer] } }), true);
  });
});