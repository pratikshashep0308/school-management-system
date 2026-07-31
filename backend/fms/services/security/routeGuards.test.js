// backend/fms/services/security/routeGuards.test.js
//
//   node --test fms/services/security/routeGuards.test.js
//
// FR-M22: "RBAC everywhere (already wired)."
//
// It was not. This enumerates EVERY route in EVERY FMS router and asserts each
// carries authorization, so a route added later without it fails here rather
// than being found by whoever it lets through.
//
// When first written this found FIVE unguarded notification routes. They
// checked `req.fmsRole` by hand — but nothing outside fmsAuthorize sets that
// field, so it was always undefined and every one of them threw. The inbox was
// unreachable, and the service tests passed because they exercise the service
// rather than the route.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', '..', 'routes');

/**
 * Routes that may legitimately carry no FMS middleware, with the reason.
 *
 * Deliberately tiny. Every entry weakens the guarantee.
 */
const ALLOWED_UNGUARDED = {
  'access.js POST /auth/unlock':
    'The exchange that issues a finance session. It cannot require a finance role: ' +
    'checking one before authentication would tell an attacker which accounts are ' +
    'worth attacking, and nobody could ever obtain a first session. It sits behind ' +
    '`protect`, verifies the password with bcrypt, and locks out after five failures.',

  'access.js GET /auth/session':
    'Reports whether the caller already holds a valid finance session. Requiring a ' +
    'session to ask whether you have a session is circular — the browser needs this ' +
    'to decide whether to show the unlock prompt. It reveals a boolean and an expiry, ' +
    'never a figure.',

  'access.js POST /auth/lock':
    'Ends a finance session. Refusing to let somebody without a valid session close ' +
    'one would be perverse, and the worst a caller can do is write an audit entry ' +
    'saying they locked something that was already locked.',

  'integrations.js POST /gateway/webhook':
    'A webhook cannot require an FMS role — the caller is a payment gateway, not ' +
    'a user. It is mounted behind `protect` (a valid JWT) and immediately throws ' +
    '"not configured", so it does nothing and reveals nothing.',
};

/** Every route in every router, with the middleware block preceding its handler. */
function enumerateRoutes() {
  const out = [];

  for (const file of fs.readdirSync(ROUTES_DIR).sort()) {
    if (!file.endsWith('.js') || file === 'index.js') continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');

    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(/g)) {
      const tail = src.slice(m.index, m.index + 600);
      const end = tail.indexOf('asyncHandler(');
      const block = tail.slice(0, end !== -1 ? end : 300);
      const p = tail.match(/router\.\w+\(\s*'([^']*)'/);

      out.push({
        file,
        method: m[1].toUpperCase(),
        path: p ? p[1] : '?',
        block,
        guarded: block.includes('fmsAuthorize') || block.includes('fmsResolveScope'),
        usesFullAuthorize: block.includes('fmsAuthorize'),
      });
    }
  }

  return out;
}

test('every FMS route is guarded', async (t) => {
  const routes = enumerateRoutes();

  await t.test('the enumeration found the routers', () => {
    assert.ok(routes.length > 150, `expected 150+ routes, found ${routes.length}`);
  });

  await t.test('EVERY ROUTE IS GUARDED OR EXPLICITLY ALLOWED', () => {
    const unguarded = routes.filter((r) => !r.guarded);
    const unexplained = unguarded.filter(
      (r) => !ALLOWED_UNGUARDED[`${r.file} ${r.method} ${r.path}`]
    );

    assert.deepStrictEqual(
      unexplained.map((r) => `${r.file} ${r.method} ${r.path}`), [],
      'These routes carry no FMS authorization and are not on the allowlist'
    );
  });

  await t.test('the allowlist is tiny and every entry gives a reason', () => {
    const keys = Object.keys(ALLOWED_UNGUARDED);
    assert.ok(keys.length <= 2, `the allowlist has grown to ${keys.length}`);
    for (const k of keys) {
      assert.ok(ALLOWED_UNGUARDED[k].length > 60, `${k} needs a real reason`);
    }
  });

  await t.test('nothing on the allowlist reads or writes financial data', () => {
    // A webhook that did something would need authorization. This one throws.
    for (const key of Object.keys(ALLOWED_UNGUARDED)) {
      assert.match(key, /webhook/, `${key} is not a webhook — why is it unguarded?`);
    }
  });
});

test('own-resource routes use the scope-only middleware deliberately', async (t) => {
  const routes = enumerateRoutes();
  const scopeOnly = routes.filter(
    (r) => !r.usesFullAuthorize && r.block.includes('fmsResolveScope')
  );

  await t.test('they exist', () => {
    assert.ok(scopeOnly.length > 0, 'no route uses fmsResolveScope');
  });

  await t.test('and are confined to notifications', () => {
    // "Can you read your own inbox" is not a module permission. If this appears
    // anywhere else, it is probably somebody skipping a permission check.
    const files = [...new Set(scopeOnly.map((r) => r.file))];
    assert.deepStrictEqual(files, ['notifications.js'],
      `fmsResolveScope has spread to: ${files.join(', ')}`);
  });

  await t.test('THE MIDDLEWARE STILL SETS THE FIELDS ROUTES DEPEND ON', () => {
    // The original bug: routes read req.fmsRole and req.fmsScope with nothing
    // setting them.
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'middleware', 'fmsAuthorize.js'), 'utf8');
    const fn = src.slice(src.indexOf('function fmsResolveScope'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));

    assert.match(body, /req\.fmsRole\s*=/, 'fmsResolveScope must set req.fmsRole');
    assert.match(body, /req\.fmsScope\s*=/, 'fmsResolveScope must set req.fmsScope');
    assert.match(body, /No FMS role assigned/, 'it must still deny users without a role');
  });

  await t.test('and no route reads req.fmsRole without middleware to set it', () => {
    for (const file of fs.readdirSync(ROUTES_DIR)) {
      if (!file.endsWith('.js') || file === 'index.js') continue;
      const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
      if (!/req\.fmsRole|req\.fmsScope/.test(src)) continue;

      assert.ok(
        /fmsAuthorize|fmsResolveScope/.test(src),
        `${file} reads req.fmsRole or req.fmsScope but mounts no middleware that sets them`
      );
    }
  });
});

test('module keys are real', async (t) => {
  const matrix = require('../auth/permissionMatrix');
  const routes = enumerateRoutes();

  await t.test('EVERY MODULE KEY USED BY A ROUTE EXISTS', () => {
    // fmsAuthorize throws at construction for an unknown key, so a bad one
    // breaks the boot rather than a request — this asserts it stays that way.
    const bad = [];
    for (const r of routes) {
      const m = r.block.match(/fmsAuthorize\('([^']+)'/);
      if (m && !matrix.MODULE_KEYS.includes(m[1])) {
        bad.push(`${r.file} ${r.method} ${r.path} → '${m[1]}'`);
      }
    }
    assert.deepStrictEqual(bad, [], 'routes referencing module keys that do not exist');
  });

  await t.test('every action used by a route exists', () => {
    const bad = [];
    for (const r of routes) {
      const m = r.block.match(/fmsAuthorize\('[^']+',\s*'([^']+)'/);
      if (m && !matrix.ACTIONS.includes(m[1])) {
        bad.push(`${r.file} ${r.method} ${r.path} → '${m[1]}'`);
      }
    }
    assert.deepStrictEqual(bad, [], 'routes referencing actions that do not exist');
  });
});