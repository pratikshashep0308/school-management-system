#!/usr/bin/env node
/**
 * FP-093 — Database deliverable preflight (static, no DB required).
 *
 * Verifies the database deliverable is COMPLETE and INTERNALLY CONSISTENT before
 * anyone runs it against a live database:
 *   - every migration has a matching rollback;
 *   - migrations declare idempotency and don't default the academic year;
 *   - no script hardcodes a database name or an absolute release path (E-05);
 *   - the validation script is read-only.
 * Exit 0 = ready. Exit 1 = deliverable is incomplete/inconsistent.
 */
const fs = require('fs');
const path = require('path');
const root = __dirname;
let failed = 0;
const fail = (m) => { console.log('  FAIL  ' + m); failed += 1; };
const pass = (m) => console.log('  PASS  ' + m);

console.log('== TFS-EOS database preflight ==\n');

// 1. Migration/rollback pairing
const migDir = path.join(root, 'migrations');
const migs = fs.readdirSync(migDir).filter((f) => /\.js$/.test(f) && !/\.rollback\.js$/.test(f));
if (migs.length === 0) fail('no migrations found');
migs.forEach((m) => {
  const rb = m.replace(/\.js$/, '.rollback.js');
  if (fs.existsSync(path.join(migDir, rb))) pass(`${m} has rollback`);
  else fail(`${m} is missing its rollback (${rb})`);
});

// 2. Idempotency + no defaulted year boundary
migs.forEach((m) => {
  const src = fs.readFileSync(path.join(migDir, m), 'utf8');
  if (/db\.migrations/.test(src)) pass(`${m} records completion (idempotent)`);
  else fail(`${m} does not guard against re-running`);
});
const m001 = fs.readFileSync(path.join(migDir, '001-academic-year-and-calendar.js'), 'utf8');
if (/YEAR_START \|\| '|YEAR_END \|\| '/.test(m001)) fail('001 defaults the academic-year boundary');
else pass('001 does not default the academic-year boundary');

// 3. No hardcoded db name / absolute release path across all scripts (E-05)
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}
const scripts = walk(root).filter((f) => /\.js$/.test(f) && !/preflight\.js$/.test(f));
let hardcoded = 0;
scripts.forEach((f) => {
  const src = fs.readFileSync(f, 'utf8');
  // getSiblingDB('literal') or an absolute /home|/mnt release path
  if (/getSiblingDB\(\s*['"][a-zA-Z]/.test(src)) { fail(`${path.relative(root, f)} hardcodes a database name`); hardcoded += 1; }
  if (/['"]\/(home|mnt|Users)\//.test(src)) { fail(`${path.relative(root, f)} hardcodes an absolute path`); hardcoded += 1; }
});
if (hardcoded === 0) pass('no script hardcodes a database name or absolute release path');

// 4. Validation script is read-only
const val = fs.readFileSync(path.join(root, 'validation', 'validate-db.js'), 'utf8');
if (/\.(insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|drop)\s*\(/.test(val)) {
  fail('validate-db.js contains a write operation (must be read-only)');
} else pass('validate-db.js is read-only');

console.log('');
if (failed > 0) { console.log(`PREFLIGHT FAILED — ${failed} issue(s)`); process.exit(1); }
console.log('PREFLIGHT PASSED — database deliverable is complete and consistent');
