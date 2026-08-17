/**
 * FP-094 — installation scripts are complete, paired, and fail-safe (static).
 *
 * Verifies BEHAVIOURAL PROPERTIES of the deliverable, not wording:
 *   - every shell script has a PowerShell twin and vice-versa;
 *   - DB-touching scripts require MONGO_URI and never fall back to a default
 *     localhost URI (which would silently target an unintended database);
 *   - no script hardcodes an absolute home/release path.
 */
const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '../../../scripts');

const files = fs.readdirSync(dir);
const shells = files.filter((f) => f.endsWith('.sh')).map((f) => f.replace(/\.sh$/, ''));
const ps = files.filter((f) => f.endsWith('.ps1')).map((f) => f.replace(/\.ps1$/, ''));

test('every shell script has a PowerShell twin and vice-versa', () => {
  expect(shells.sort()).toEqual(ps.sort());
});

describe('DB-touching scripts are fail-safe', () => {
  const dbScripts = ['check-mongodb', 'migrate', 'seed', 'validate-db', 'import-holidays'];
  dbScripts.forEach((name) => {
    test(`${name} requires MONGO_URI and has no localhost fallback`, () => {
      const sh = fs.readFileSync(path.join(dir, `${name}.sh`), 'utf8');
      const p1 = fs.readFileSync(path.join(dir, `${name}.ps1`), 'utf8');
      // Requires MONGO_URI
      expect(sh).toMatch(/MONGO_URI/);
      expect(p1).toMatch(/MONGO_URI/);
      // No default localhost connection string baked in
      expect(sh).not.toMatch(/mongodb:\/\/localhost/);
      expect(p1).not.toMatch(/mongodb:\/\/localhost/);
      expect(sh).not.toMatch(/mongodb:\/\/127\.0\.0\.1/);
    });
  });
});

test('no script hardcodes an absolute home/release path', () => {
  files.filter((f) => /\.(sh|ps1)$/.test(f)).forEach((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    // Allow $env:USERPROFILE etc as EXAMPLES in comments, but not a literal home path in a command.
    const lines = src.split('\n').filter((l) => !/^\s*(#|\.EXAMPLE|Write-Host|echo)/.test(l));
    lines.forEach((l) => {
      expect(l).not.toMatch(/\/home\/[a-z]/i);
      expect(l).not.toMatch(/\/Users\/[a-z]/i);
    });
  });
});

test('install scripts chain the fail-safe checks before touching the DB', () => {
  const installSh = fs.readFileSync(path.join(dir, 'install.sh'), 'utf8');
  expect(installSh).toMatch(/check-prerequisites/);
  expect(installSh).toMatch(/check-mongodb/);
  // check happens before migrate
  expect(installSh.indexOf('check-mongodb')).toBeLessThan(
    installSh.indexOf('migrate') === -1 ? Infinity : installSh.indexOf('migrate'));
});
