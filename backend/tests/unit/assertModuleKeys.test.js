/**
 * BP-002 — startup assertion over the permission registry.
 * Gate tier: LOCAL UNIT / STATIC — pure JS, no database.
 */
const { assertModuleKeys, checkModuleKeys } = require('../../utils/assertModuleKeys');
const { MODULES } = require('../../routes/permissionRoutes');

describe('checkModuleKeys', () => {
  const modules = [{ key: 'students' }, { key: 'exams' }];

  test('passes when every mounted key is registered', () => {
    const table = [
      ['/api/students', './routes/studentRoutes', 'students'],
      ['/api/exams', './routes/examRoutes', 'exams'],
    ];
    const r = checkModuleKeys(table, modules);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(2);
    expect(r.missing).toEqual([]);
  });

  test('flags an unregistered key', () => {
    const table = [['/api/promotions', './routes/promotionRoutes', 'promotion']];
    const r = checkModuleKeys(table, modules);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([{ path: '/api/promotions', moduleKey: 'promotion' }]);
  });

  test('ignores route groups mounted without a moduleKey', () => {
    const table = [
      ['/api/auth', './routes/authRoutes'],
      ['/api/school', './routes/schoolRoutes'],
    ];
    const r = checkModuleKeys(table, modules);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(0);
  });

  test('accepts a plain string registry as well as {key} objects', () => {
    const r = checkModuleKeys([['/api/exams', 'f', 'exams']], ['exams']);
    expect(r.ok).toBe(true);
  });

  test('rejects malformed input rather than passing silently', () => {
    expect(() => checkModuleKeys(null, modules)).toThrow(TypeError);
    expect(() => checkModuleKeys([], null)).toThrow(TypeError);
  });
});

describe('assertModuleKeys', () => {
  test('throws and names the offending key', () => {
    expect(() =>
      assertModuleKeys([['/api/x', 'f', 'nope']], [{ key: 'students' }])
    ).toThrow(/nope/);
  });

  test('the thrown message explains the fail-open consequence', () => {
    expect(() =>
      assertModuleKeys([['/api/x', 'f', 'nope']], [{ key: 'students' }])
    ).toThrow(/fails open/);
  });
});

describe('the live route table', () => {
  test('MODULES is exported from permissionRoutes', () => {
    expect(Array.isArray(MODULES)).toBe(true);
    expect(MODULES.length).toBeGreaterThan(0);
  });

  test('every currently mounted moduleKey is registered', () => {
    const { ROUTE_TABLE } = require('../../config/routeTable');
    const r = checkModuleKeys(ROUTE_TABLE, MODULES);
    if (!r.ok) {
      throw new Error(
        'Unregistered keys: ' + r.missing.map((m) => m.moduleKey).join(', ')
      );
    }
    expect(r.ok).toBe(true);
    expect(r.checked).toBeGreaterThan(10);
  });
});
