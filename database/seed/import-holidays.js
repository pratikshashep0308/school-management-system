#!/usr/bin/env node
/**
 * import-holidays — TFS-EOS Delta Build
 *
 * Populates the Holiday collection from a JSON or CSV file.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * GAP-CAL-002 persists holidays and rewires the attendance block to read them,
 * but GAP-CAL-008 (the administrator calendar screens, BP-050 and BP-060) has
 * not been built yet. Until it is, a school has no way to populate the
 * collection — and a persisted-but-empty Holiday collection behaves EXACTLY like
 * the in-memory object it replaced: Sunday-only, with every real holiday
 * invisible.
 *
 * This script closes that gap so the calendar fix is usable now. It is a
 * stop-gap: once BP-050 and BP-060 ship, holidays are managed through the UI and
 * this becomes a bulk-import convenience rather than the only route in.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   node database/seed/import-holidays.js --file holidays.json
 *   node database/seed/import-holidays.js --file holidays.csv --dry-run
 *   node database/seed/import-holidays.js --file holidays.json --school <schoolId>
 *
 * Options:
 *   --file <path>     REQUIRED. .json or .csv (see holidays.sample.*)
 *   --school <id>     Optional. Defaults to every school with an active year.
 *   --year <name>     Optional. Defaults to the active AcademicYear per school.
 *   --dry-run         Validate and report; write nothing.
 *   --replace         Delete existing holidays for the target year first.
 *                     Requires explicit confirmation; never the default.
 *
 * Idempotent: an entry matching an existing {school, academicYearId, label, date}
 * is skipped rather than duplicated, so re-running is safe.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../backend/.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MODELS = path.join(__dirname, '../../backend/models');
require(path.join(MODELS, 'AcademicYear'));
require(path.join(MODELS, 'Holiday'));

const VALID_TYPES = ['national', 'regional', 'religious', 'school', 'other'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── argument parsing ─────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { dryRun: false, replace: false };
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === '--dry-run') a.dryRun = true;
    else if (k === '--replace') a.replace = true;
    else if (k === '--file') a.file = argv[++i];
    else if (k === '--school') a.school = argv[++i];
    else if (k === '--year') a.year = argv[++i];
    else if (k === '--help' || k === '-h') a.help = true;
    else throw new Error(`Unknown option: ${k}`);
  }
  return a;
}

function usage() {
  console.log(`
Usage: node database/seed/import-holidays.js --file <path> [options]

  --file <path>   REQUIRED. .json or .csv — see holidays.sample.json / .csv
  --school <id>   Limit to one school. Default: every school with an active year.
  --year <name>   Target academic year name. Default: the active year per school.
  --dry-run       Validate and report; write nothing.
  --replace       Delete existing holidays for the target year first (destructive).
`);
}

// ── parsing ──────────────────────────────────────────────────────────────────
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV has no data rows');
  const header = lines[0].split(',').map((h) => h.trim());
  const required = ['label', 'date'];
  required.forEach((r) => {
    if (!header.includes(r)) throw new Error(`CSV is missing the '${r}' column`);
  });
  return lines.slice(1).map((line, i) => {
    // Simple split — labels containing commas must be quoted, handled below.
    const cells = line.match(/("([^"]*)")|([^,]*)/g).filter((_, idx) => idx % 2 === 0);
    const row = {};
    header.forEach((h, idx) => {
      let v = (cells[idx] || '').trim().replace(/^"|"$/g, '');
      row[h] = v === '' ? undefined : v;
    });
    row._line = i + 2;
    return row;
  });
}

function parseFile(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const text = fs.readFileSync(abs, 'utf8');
  if (abs.endsWith('.json')) {
    const doc = JSON.parse(text);
    const rows = Array.isArray(doc) ? doc : doc.holidays;
    if (!Array.isArray(rows)) {
      throw new Error("JSON must be an array, or an object with a 'holidays' array");
    }
    return rows.map((r, i) => ({ ...r, _line: i + 1 }));
  }
  if (abs.endsWith('.csv')) return parseCsv(text);
  throw new Error('File must be .json or .csv');
}

// ── validation ───────────────────────────────────────────────────────────────
const truthy = (v) => v === true || v === 'true' || v === 'TRUE' || v === '1';

function validate(rows, year) {
  const errors = [];
  const clean = [];
  const seen = new Set();

  rows.forEach((r) => {
    const at = `entry ${r._line}`;
    const label = (r.label || '').trim();
    if (!label) { errors.push(`${at}: label is required`); return; }
    if (!r.date || !ISO_DATE.test(String(r.date))) {
      errors.push(`${at} (${label}): date must be yyyy-mm-dd`); return;
    }
    const date = new Date(`${r.date}T00:00:00.000Z`);
    if (isNaN(date.getTime())) { errors.push(`${at} (${label}): invalid date`); return; }

    let endDate = null;
    if (r.endDate) {
      if (!ISO_DATE.test(String(r.endDate))) {
        errors.push(`${at} (${label}): endDate must be yyyy-mm-dd`); return;
      }
      endDate = new Date(`${r.endDate}T00:00:00.000Z`);
      if (endDate < date) {
        errors.push(`${at} (${label}): endDate ${r.endDate} precedes date ${r.date}`); return;
      }
    }

    const type = r.type ? String(r.type).trim() : 'school';
    if (!VALID_TYPES.includes(type)) {
      errors.push(`${at} (${label}): type '${type}' must be one of ${VALID_TYPES.join(', ')}`);
      return;
    }

    // The holiday must fall inside the academic year, or the attendance block
    // will never consult it and the entry is silently useless.
    if (date < year.startDate || date > year.endDate) {
      errors.push(
        `${at} (${label}): ${r.date} falls outside academic year ${year.name} ` +
        `(${year.startDate.toISOString().slice(0, 10)} .. ${year.endDate.toISOString().slice(0, 10)})`
      );
      return;
    }
    if (endDate && endDate > year.endDate) {
      errors.push(`${at} (${label}): endDate falls outside academic year ${year.name}`);
      return;
    }

    const key = `${label}|${r.date}`;
    if (seen.has(key)) { errors.push(`${at} (${label}): duplicate of an earlier entry`); return; }
    seen.add(key);

    clean.push({
      label,
      date,
      endDate,
      recurringAnnually: truthy(r.recurringAnnually),
      type,
    });
  });

  return { clean, errors };
}

/**
 * A moving festival marked recurringAnnually would carry the wrong date into
 * next year's rollover, silently reopening the defect this feature fixes.
 */
const MOVING = /diwali|deepavali|holi|eid|ramadan|ramzan|dussehra|dasara|navratri|raksha|janmashtami|ganesh|onam|pongal|baisakhi|guru nanak|muharram|bakrid|good friday|easter/i;

function warnMovingRecurring(clean) {
  return clean
    .filter((h) => h.recurringAnnually && MOVING.test(h.label))
    .map((h) => h.label);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  let args;
  try { args = parseArgs(process.argv); }
  catch (e) { console.error(e.message); usage(); process.exit(1); }

  if (args.help || !args.file) { usage(); process.exit(args.file ? 0 : 1); }

  if (!process.env.MONGO_URI) {
    console.error('ERROR: MONGO_URI is not set. Configure backend/.env first.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const AcademicYear = mongoose.model('AcademicYear');
  const Holiday = mongoose.model('Holiday');

  const yearQuery = args.year ? { name: args.year } : { isActive: true };
  if (args.school) yearQuery.school = args.school;
  const years = await AcademicYear.find(yearQuery).lean();

  if (years.length === 0) {
    console.error(
      'ERROR: no matching AcademicYear found. Run migration 001 first, or check --school / --year.'
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const rows = parseFile(args.file);
  console.log(`Parsed ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} from ${args.file}`);
  console.log(args.dryRun ? '(DRY RUN — nothing will be written)\n' : '');

  let totalInserted = 0;
  let totalSkipped = 0;
  let anyErrors = false;

  for (const year of years) {
    console.log(`School ${year.school} — academic year ${year.name}`);

    const { clean, errors } = validate(rows, year);

    if (errors.length > 0) {
      anyErrors = true;
      console.log(`  ${errors.length} validation error(s):`);
      errors.forEach((e) => console.log(`    ${e}`));
      console.log('  No holidays imported for this school.\n');
      continue;
    }

    const moving = warnMovingRecurring(clean);
    if (moving.length > 0) {
      console.log('  WARNING: these look like moving festivals but are marked recurringAnnually:');
      moving.forEach((m) => console.log(`    ${m}`));
      console.log('    Their date changes each year, so rollover would carry the wrong date');
      console.log('    forward. Set recurringAnnually false unless the date is genuinely fixed.\n');
    }

    if (args.replace && !args.dryRun) {
      const del = await Holiday.deleteMany({ school: year.school, academicYearId: year._id });
      console.log(`  --replace: removed ${del.deletedCount} existing holiday record(s)`);
    }

    let inserted = 0;
    let skipped = 0;

    for (const h of clean) {
      const existing = await Holiday.findOne({
        school: year.school,
        academicYearId: year._id,
        label: h.label,
        date: h.date,
      }).lean();

      if (existing) { skipped += 1; continue; }

      if (!args.dryRun) {
        await Holiday.create({ ...h, school: year.school, academicYearId: year._id });
      }
      inserted += 1;
      const span = h.endDate
        ? `${h.date.toISOString().slice(0, 10)} .. ${h.endDate.toISOString().slice(0, 10)}`
        : h.date.toISOString().slice(0, 10);
      console.log(
        `    ${args.dryRun ? 'would add' : 'added'}  ${span}  ${h.label}` +
        `${h.recurringAnnually ? '  [recurring]' : ''}`
      );
    }

    totalInserted += inserted;
    totalSkipped += skipped;
    console.log(`  ${args.dryRun ? 'would insert' : 'inserted'}: ${inserted}, already present: ${skipped}\n`);
  }

  console.log('─'.repeat(60));
  console.log(`Total ${args.dryRun ? 'would insert' : 'inserted'}: ${totalInserted}`);
  console.log(`Total already present (skipped): ${totalSkipped}`);

  if (!args.dryRun && totalInserted > 0) {
    console.log('');
    console.log('Verify the effect: attempt to mark attendance on one of these dates.');
    console.log('It should be rejected with ATTENDANCE_BLOCKED_HOLIDAY and the label.');
  }

  await mongoose.disconnect();
  process.exit(anyErrors ? 1 : 0);
}

main().catch(async (err) => {
  console.error('ERROR:', err.message);
  try { await mongoose.disconnect(); } catch (e) { /* already closed */ }
  process.exit(1);
});
