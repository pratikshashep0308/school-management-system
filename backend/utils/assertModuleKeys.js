/**
 * assertModuleKeys — BP-002
 *
 * `checkPermission` fails open. It calls next() when no matrix row exists for the
 * role, when the moduleKey is absent from the stored permissions map, and when any
 * error occurs during lookup. That is pre-existing behaviour and this unit does not
 * change it — altering it is a behavioural change needing its own risk assessment.
 *
 * What that behaviour means in practice: a route group mounted with a moduleKey that
 * was never registered in the MODULES constant is silently ungoverned by the access
 * matrix. Only the route's own authorize() applies. Specification §8.1 requires all
 * nineteen new TFS-EOS route groups to be matrix-gated, so an unregistered key
 * defeats the requirement without producing any visible symptom.
 *
 * This assertion closes that gap from the other side: an unregistered key becomes a
 * startup failure instead of a silent bypass. It is deliberately loud and runs before
 * the server listens.
 */

/**
 * @param {Array<Array<string>>} routeTable  server.js routes table — [path, file, moduleKey?]
 * @param {Array<{key: string}>} modules     the MODULES registry from routes/permissionRoutes.js
 * @returns {{ ok: boolean, missing: Array<{path: string, moduleKey: string}>, checked: number }}
 */
function checkModuleKeys(routeTable, modules) {
  if (!Array.isArray(routeTable)) {
    throw new TypeError('assertModuleKeys: routeTable must be an array');
  }
  if (!Array.isArray(modules)) {
    throw new TypeError('assertModuleKeys: modules must be an array');
  }

  const registered = new Set(
    modules
      .map((m) => (typeof m === 'string' ? m : m && m.key))
      .filter(Boolean)
  );

  const missing = [];
  let checked = 0;

  for (const entry of routeTable) {
    if (!Array.isArray(entry)) continue;
    const [routePath, , moduleKey] = entry;

    // A route mounted without a moduleKey is intentionally not matrix-gated
    // (/api/auth, /api/school, /api/permissions, /api/uploads and the student
    // portal are all in this category today). Those are governed by authorize()
    // inside the route file and are out of scope for this check.
    if (!moduleKey) continue;

    checked += 1;
    if (!registered.has(moduleKey)) {
      missing.push({ path: routePath, moduleKey });
    }
  }

  return { ok: missing.length === 0, missing, checked };
}

/**
 * Throws if any mounted moduleKey is unregistered. Call before app.listen().
 */
function assertModuleKeys(routeTable, modules) {
  const result = checkModuleKeys(routeTable, modules);
  if (!result.ok) {
    const detail = result.missing
      .map((m) => `  ${m.path} -> moduleKey '${m.moduleKey}'`)
      .join('\n');
    throw new Error(
      'Unregistered moduleKey(s) found in the server route table.\n' +
        detail +
        '\n\nBecause checkPermission fails open, these route groups would be ' +
        'silently ungoverned by the access-control matrix. Add each key to the ' +
        'MODULES constant in routes/permissionRoutes.js and grant it per role in ' +
        'DEFAULT_GRANTS before starting the server.'
    );
  }
  return result;
}

module.exports = { assertModuleKeys, checkModuleKeys };
