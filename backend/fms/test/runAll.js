// backend/fms/test/runAll.js
//
// Run every FMS test and check, and report one number.
//
//   node fms/test/runAll.js              everything
//   node fms/test/runAll.js --unit       unit and contract tests only (no DB)
//   node fms/test/runAll.js --checks     integration checks only (needs a replica set)
//
// ─── WHY TWO KINDS ───────────────────────────────────────────────────────────
// UNIT tests are pure — approval routing, GSTIN checksums, statement parsing,
// double-entry arithmetic. They need no database and run in milliseconds, so
// they can run anywhere, including a developer's laptop and CI.
//
// INTEGRATION checks need a MongoDB REPLICA SET, because the FMS posts inside
// transactions. Each creates its own <db>_fmscheck database and drops it at the
// end — none touches live data.
//
// The one exception is indexAudit.check.js, which reads the LIVE database
// because query plans depend on the data actually present. It writes nothing.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const only = args.includes('--unit') ? 'unit'
  : args.includes('--checks') ? 'checks' : 'all';

function find(dir, suffix) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(suffix)) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

const rel = (p) => path.relative(path.join(ROOT, '..'), p);

/**
 * `--test-reporter=tap` is pinned rather than relying on the default.
 *
 * Node's default reporter CHANGED between versions — v20 and v22 emit TAP when
 * piped, v24 emits the pretty format regardless. Parsing whichever the runtime
 * happens to choose produced a clean "0 passed, 0 failed" on Node 24: every
 * file ran, nothing was counted, and the summary looked like a pass.
 *
 * A test runner that reports success when it has measured nothing is worse than
 * one that crashes.
 */
function runUnit(file) {
  try {
    const out = execFileSync('node', ['--test', '--test-reporter=tap', file], {
      encoding: 'utf8', cwd: path.join(ROOT, '..'), stdio: 'pipe',
    });
    const pass = Number((out.match(/^# pass (\d+)/m) || [])[1] || 0);
    const fail = Number((out.match(/^# fail (\d+)/m) || [])[1] || 0);
    return { pass, fail, ok: fail === 0 };
  } catch (err) {
    const out = (err.stdout || '') + (err.stderr || '');
    const pass = Number((out.match(/^# pass (\d+)/m) || [])[1] || 0);
    const fail = Number((out.match(/^# fail (\d+)/m) || [])[1] || 0);
    return { pass, fail: fail || 1, ok: false, error: fail ? null : out.slice(-300) };
  }
}

function runCheck(file) {
  try {
    const out = execFileSync('node', [file], {
      encoding: 'utf8', cwd: path.join(ROOT, '..'), stdio: 'pipe',
    });
    const m = out.match(/(\d+) passed, (\d+) failed/);
    return m
      ? { pass: Number(m[1]), fail: Number(m[2]), ok: Number(m[2]) === 0 }
      : { pass: 0, fail: 0, ok: true, note: 'no summary line' };
  } catch (err) {
    const out = (err.stdout || '') + (err.stderr || '');
    const m = out.match(/(\d+) passed, (\d+) failed/);
    if (m) return { pass: Number(m[1]), fail: Number(m[2]), ok: Number(m[2]) === 0 };
    const abort = out.match(/CHECK ABORTED: (.+)/);
    return { pass: 0, fail: 1, ok: false, error: abort ? abort[1] : out.slice(-300).trim() };
  }
}

const started = Date.now();
let totalPass = 0;
let totalFail = 0;
const failed = [];

if (only !== 'checks') {
  const files = find(ROOT, '.test.js');
  console.log(`\nUNIT & CONTRACT — ${files.length} files (no database)\n`);
  for (const f of files) {
    const r = runUnit(f);
    totalPass += r.pass; totalFail += r.fail;
    if (!r.ok) failed.push({ file: rel(f), ...r });
    console.log(`  ${r.ok ? '✔' : '✖'}  ${path.basename(f).padEnd(30)} ${String(r.pass).padStart(4)} passed` +
      (r.fail ? `, ${r.fail} FAILED` : ''));
  }
}

if (only !== 'unit') {
  const files = find(ROOT, '.check.js');
  console.log(`\nINTEGRATION — ${files.length} files (needs a replica set)\n`);
  for (const f of files) {
    const r = runCheck(f);
    totalPass += r.pass; totalFail += r.fail;
    if (!r.ok) failed.push({ file: rel(f), ...r });
    console.log(`  ${r.ok ? '✔' : '✖'}  ${path.basename(f).padEnd(30)} ${String(r.pass).padStart(4)} passed` +
      (r.fail ? `, ${r.fail} FAILED` : '') + (r.error ? `  — ${r.error.slice(0, 70)}` : ''));
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(1);

// A run that counted nothing is a broken runner, not a green suite.
if (totalPass === 0 && totalFail === 0) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  NOTHING WAS COUNTED — the runner could not parse any output.');
  console.log('  This is a runner fault, not a passing suite. Run a file directly:');
  console.log('    node --test fms/services/ledger/posting.test.js');
  console.log();
  process.exit(1);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${totalPass} passed, ${totalFail} failed   (${secs}s)`);

if (failed.length) {
  console.log(`\n  ${failed.length} file(s) failed:`);
  for (const f of failed) {
    console.log(`    ${f.file}${f.error ? `\n      ${f.error.slice(0, 200)}` : ''}`);
  }
}
console.log();

process.exit(totalFail ? 1 : 0);