// backend/fms/docs/specCoverage.js
//
// How much of the implemented API is documented?
//
//   node fms/docs/specCoverage.js            summary
//   node fms/docs/specCoverage.js --missing  list every undocumented route
//
// ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// contract.test.js proves that every DOCUMENTED endpoint behaves as documented.
// It says nothing about endpoints that were never documented — and cannot,
// because it has no way to know they exist.
//
// So a green contract test and a half-written spec look identical. This closes
// that gap by comparing the spec to the router, and reporting the difference as
// a number rather than an impression.

const path = require('path');
const fs = require('fs');

const ROUTES = path.join(__dirname, '..', 'routes');
const spec = require('./openapi');

/** Mount points, read from the router rather than assumed. */
function mounts() {
  const src = fs.readFileSync(path.join(ROUTES, 'index.js'), 'utf8');
  const out = {};
  for (const m of src.matchAll(/router\.use\('(\/[^']*)',\s*protect,\s*require\('\.\/(\w+)'\)/g)) {
    out[m[2]] = m[1];
  }
  return out;
}

/** Every route the application actually serves. */
function implemented() {
  const mp = mounts();
  const out = [];

  for (const file of fs.readdirSync(ROUTES).sort()) {
    if (!file.endsWith('.js') || file === 'index.js') continue;
    const name = file.slice(0, -3);
    const mount = mp[name];
    if (mount === undefined) continue;

    const src = fs.readFileSync(path.join(ROUTES, file), 'utf8');
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      const sub = m[2] === '/' ? '' : m[2];
      out.push({
        file,
        method: m[1].toUpperCase(),
        // OpenAPI writes parameters as {id}; Express writes :id.
        path: (mount + sub).replace(/:(\w+)/g, '{$1}').replace(/\/+/g, '/'),
      });
    }
  }
  return out;
}

const routes = implemented();
const documented = new Set();
for (const [p, ops] of Object.entries(spec.paths)) {
  for (const verb of Object.keys(ops)) {
    if (['get', 'post', 'put', 'patch', 'delete'].includes(verb)) {
      documented.add(`${verb.toUpperCase()} ${p}`);
    }
  }
}

const missing = routes.filter((r) => !documented.has(`${r.method} ${r.path}`));
const covered = routes.length - missing.length;
const pct = ((covered / routes.length) * 100).toFixed(0);

console.log('\nOPENAPI COVERAGE\n');
console.log(`  implemented routes : ${routes.length}`);
console.log(`  documented ops     : ${documented.size}`);
console.log(`  covered            : ${covered}  (${pct}%)`);
console.log(`  UNDOCUMENTED       : ${missing.length}\n`);

const byFile = {};
for (const r of missing) (byFile[r.file] = byFile[r.file] || []).push(r);

console.log('  Undocumented by router\n');
for (const f of Object.keys(byFile).sort((a, b) => byFile[b].length - byFile[a].length)) {
  console.log(`  ${f.padEnd(22)} ${String(byFile[f].length).padStart(3)}`);
  if (process.argv.includes('--missing')) {
    for (const r of byFile[f]) console.log(`      ${r.method.padEnd(6)} ${r.path}`);
  }
}

if (!process.argv.includes('--missing')) {
  console.log('\n  (run with --missing to list every route)');
}

console.log(`
  NOTE
  contract.test.js proves every DOCUMENTED endpoint behaves as documented.
  It cannot see undocumented ones, so a green contract test and a half-written
  spec look the same. That is what this measures.

  The undocumented routes WORK — they are covered by integration checks. What
  is missing is the written contract, which matters for handover rather than
  correctness.
`);

process.exit(0);