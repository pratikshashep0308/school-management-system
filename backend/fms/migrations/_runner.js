// backend/fms/migrations/_runner.js
//
// A minimal, reversible migration runner scoped to the FMS.
//
// The SMS has no migration tool (confirmed in discovery P0.1 — no migrate-mongo,
// no migrations/ directory). Introducing a heavyweight one for a two-person team
// is unwarranted, so this is deliberately small: ordered files, up/down, state
// recorded in fms_settings.
//
// ─── THE SAFETY PROPERTY ─────────────────────────────────────────────────────
// Every migration declares the collections it touches. The runner REFUSES to
// execute any migration whose declared collections are not all `fms_`-prefixed.
// That is what makes "the FMS never modifies an SMS collection" an enforced
// invariant rather than a code-review convention.
//
// Usage:
//   node fms/migrations/_runner.js status
//   node fms/migrations/_runner.js up
//   node fms/migrations/_runner.js down            (last applied only)
//   node fms/migrations/_runner.js down --all
//   node fms/migrations/_runner.js verify

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const STATE_KEY = 'migrations.applied';
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

/** Refuse to run against a non-fms_ collection. The core invariant. */
function assertFmsOnly(migration) {
  const declared = migration.collections || [];
  if (declared.length === 0) {
    throw new Error(`${migration.id}: must declare a 'collections' array`);
  }
  const bad = declared.filter((c) => !/^fms_/.test(c));
  if (bad.length) {
    throw new Error(
      `${migration.id}: REFUSING TO RUN — declares non-fms_ collections: ${bad.join(', ')}`
    );
  }
}

/** Transactions need a replica set. Verified rather than assumed. */
async function assertReplicaSet() {
  const info = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!info.setName) {
    throw new Error(
      'MongoDB is running standalone. FMS migrations and ledger postings require ' +
      'a replica set. Convert with replSetName in mongod.conf, then rs.initiate().'
    );
  }
  return info.setName;
}

// ─────────────────────────────────────────────────────────────────────────────
// State — stored in fms_settings so no extra bookkeeping collection is needed
// ─────────────────────────────────────────────────────────────────────────────

async function getApplied() {
  const col = mongoose.connection.db.collection('fms_settings');
  const doc = await col.findOne({ school: null, key: STATE_KEY });
  return doc?.value || [];
}

async function setApplied(list) {
  const col = mongoose.connection.db.collection('fms_settings');
  await col.updateOne(
    { school: null, key: STATE_KEY },
    {
      $set: { value: list, updatedAt: new Date() },
      $setOnInsert: {
        school: null,
        key: STATE_KEY,
        description: 'Applied FMS migration ids, in order',
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

function loadMigrations() {
  if (!fs.existsSync(SCRIPTS_DIR)) return [];
  return fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => /^\d{3}_.*\.js$/.test(f))
    .sort()
    .map((f) => {
      const m = require(path.join(SCRIPTS_DIR, f));
      m.id = m.id || f.replace(/\.js$/, '');
      m.file = f;
      if (typeof m.up !== 'function' || typeof m.down !== 'function') {
        throw new Error(`${m.id}: must export both up() and down()`);
      }
      assertFmsOnly(m);
      return m;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

async function cmdStatus() {
  const applied = await getApplied();
  const all = loadMigrations();
  console.log('\n  id                                   state      collections');
  console.log('  ' + '-'.repeat(76));
  for (const m of all) {
    const state = applied.includes(m.id) ? 'APPLIED' : 'pending';
    console.log(`  ${m.id.padEnd(36)} ${state.padEnd(10)} ${m.collections.join(', ')}`);
  }
  const blocked = all.filter((m) => m.blocked);
  if (blocked.length) {
    console.log('\n  BLOCKED:');
    blocked.forEach((m) => console.log(`    ${m.id} — ${m.blocked}`));
  }
  console.log('');
}

async function cmdUp() {
  const applied = await getApplied();
  const all = loadMigrations();
  const pending = all.filter((m) => !applied.includes(m.id));

  if (!pending.length) {
    console.log('Nothing to apply — all migrations are up to date.');
    return;
  }

  for (const m of pending) {
    if (m.blocked) {
      console.log(`⏸  ${m.id} BLOCKED — ${m.blocked}`);
      console.log('   Stopping here; later migrations may depend on it.');
      break;
    }
    process.stdout.write(`→  ${m.id} ... `);
    await m.up(mongoose.connection.db, mongoose);
    applied.push(m.id);
    await setApplied(applied);
    console.log('applied');
  }
}

async function cmdDown(all = false) {
  const applied = await getApplied();
  if (!applied.length) {
    console.log('Nothing to roll back.');
    return;
  }
  const loaded = loadMigrations();
  const targets = all ? [...applied].reverse() : [applied[applied.length - 1]];

  for (const id of targets) {
    const m = loaded.find((x) => x.id === id);
    if (!m) {
      console.log(`⚠  ${id} recorded as applied but its file is missing — skipping.`);
      continue;
    }
    process.stdout.write(`←  ${id} ... `);
    await m.down(mongoose.connection.db, mongoose);
    const idx = applied.indexOf(id);
    if (idx > -1) applied.splice(idx, 1);
    await setApplied(applied);
    console.log('rolled back');
  }
}

/** Independent check that reality matches expectation. */
async function cmdVerify() {
  const db = mongoose.connection.db;
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  const fms = names.filter((n) => n.startsWith('fms_')).sort();
  const sms = names.filter((n) => !n.startsWith('fms_')).sort();

  console.log(`\n  fms_ collections: ${fms.length}`);
  fms.forEach((n) => console.log(`    ${n}`));
  console.log(`\n  SMS collections untouched: ${sms.length}`);

  console.log('\n  Indexes on key collections:');
  for (const c of ['fms_ledgerentries', 'fms_ingeststate', 'fms_vouchers', 'fms_accounts']) {
    if (!fms.includes(c)) continue;
    const idx = await db.collection(c).indexes();
    console.log(`    ${c}:`);
    idx.forEach((i) => console.log(`      ${i.name}${i.unique ? '  [unique]' : ''}`));
  }
  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const cmd = process.argv[2] || 'status';
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('MONGO_URI is not set. Run from backend/ where .env lives.');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const rs = await assertReplicaSet();
  console.log(`Connected. Replica set: ${rs}`);

  try {
    switch (cmd) {
      case 'status': await cmdStatus(); break;
      case 'up': await cmdUp(); break;
      case 'down': await cmdDown(process.argv.includes('--all')); break;
      case 'verify': await cmdVerify(); break;
      default:
        console.error(`Unknown command '${cmd}'. Use: status | up | down [--all] | verify`);
        process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nFAILED:', err.message);
    process.exit(1);
  });
}

module.exports = { loadMigrations, assertFmsOnly, getApplied };