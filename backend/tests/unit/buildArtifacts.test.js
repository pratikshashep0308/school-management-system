/**
 * STATIC GATE — generated build artifacts.
 *
 * Verifies the database and installation packages are structurally complete and
 * syntactically valid, and that none of them leaks a credential. Runs with no
 * external infrastructure.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const MIGRATIONS = [
  'database/migrations/001-academic-year-and-calendar.js',
  'database/migrations/001-academic-year-and-calendar.rollback.js',
  'database/migrations/002-academic-year-id-stamping.js',
  'database/migrations/002-academic-year-id-stamping.rollback.js',
];
const DB_SCRIPTS = [
  ...MIGRATIONS,
  'database/indexes/create-indexes.js',
  'database/seed/seed-module-keys.js',
  'database/validation/validate-db.js',
];
const SH = ['check-prerequisites', 'check-mongodb', 'install', 'migrate', 'seed', 'validate-db', 'start', 'stop'];

describe('database package structure', () => {
  test.each(['migrations', 'indexes', 'seed', 'validation', 'scripts'])(
    'database/%s exists', (d) => expect(exists(`database/${d}`)).toBe(true)
  );

  test.each(DB_SCRIPTS)('%s is syntactically valid', (p) => {
    expect(() => new vm.Script(read(p))).not.toThrow();
  });

  test('every migration has a rollback', () => {
    const forward = MIGRATIONS.filter((m) => !m.includes('.rollback.'));
    forward.forEach((m) => {
      expect(exists(m.replace('.js', '.rollback.js'))).toBe(true);
    });
  });

  test('every migration documents id, purpose, collections, compatibility and rollback', () => {
    MIGRATIONS.filter((m) => !m.includes('.rollback.')).forEach((m) => {
      const src = read(m);
      ['Migration ID', 'Purpose', 'Collections', 'Compatibility', 'Rollback', 'Idempotent']
        .forEach((k) => expect(src).toContain(k));
    });
  });

  test('migrations record completion so re-running is a no-op', () => {
    MIGRATIONS.filter((m) => !m.includes('.rollback.')).forEach((m) => {
      const src = read(m);
      expect(src).toMatch(/db\.migrations/);
      expect(src).toMatch(/completedAt/);
    });
  });
});

describe('irreversible-operation safeguards', () => {
  test('002 runs the pre-flight gate and refuses on pre-year records', () => {
    const src = read('database/migrations/002-academic-year-id-stamping.js');
    expect(src).toMatch(/PRE-FLIGHT/);
    expect(src).toMatch(/REFUSING TO STAMP/);
    expect(src).toMatch(/\$lt:\s*year\.startDate/);
  });

  test('002 supports a dry run', () => {
    expect(read('database/migrations/002-academic-year-id-stamping.js')).toMatch(/TFS_DRY_RUN/);
  });

  test('001 rollback refuses to destroy user-entered holidays', () => {
    const src = read('database/migrations/001-academic-year-and-calendar.rollback.js');
    expect(src).toMatch(/REFUSING TO ROLL BACK/);
  });

  test('academic year dates are never defaulted', () => {
    const src = read('database/migrations/001-academic-year-and-calendar.js');
    expect(src).toMatch(/TFS_ACADEMIC_YEAR_START/);
    expect(src).toMatch(/must not be guessed/);
    // A hardcoded April-March default would silently mis-scope every record.
    expect(src).not.toMatch(/YEAR_START\s*=\s*['"]20\d\d-/);
  });
});

describe('index and validation scripts honour the approved decisions', () => {
  test('index script never drops an index', () => {
    const src = read('database/indexes/create-indexes.js');
    expect(src).not.toMatch(/dropIndex/);
    expect(src).toMatch(/D-002/);
  });

  test('validation asserts the D-002 and D-004 invariants', () => {
    const src = read('database/validation/validate-db.js');
    expect(src).toMatch(/no Class carries an academicYear field/);
    expect(src).toMatch(/Class unique index/);
    expect(src).toMatch(/no Student carries a grade field/);
  });

  test('validation is read-only', () => {
    const src = read('database/validation/validate-db.js');
    expect(src).not.toMatch(/updateOne|insertOne|deleteOne|updateMany|drop\(/);
  });

  test('seed never lowers an existing grant', () => {
    const src = read('database/seed/seed-module-keys.js');
    expect(src).toMatch(/NON-DESTRUCTIVE/);
    expect(src).toMatch(/hasOwnProperty/);
  });
});

describe('installation scripts', () => {
  test.each(SH)('scripts/%s.sh exists', (n) => expect(exists(`scripts/${n}.sh`)).toBe(true));
  test.each(SH)('scripts/%s.ps1 exists', (n) => expect(exists(`scripts/${n}.ps1`)).toBe(true));

  test('check-mongodb refuses a missing MONGO_URI and never falls back to localhost', () => {
    ['scripts/check-mongodb.sh', 'scripts/check-mongodb.ps1'].forEach((p) => {
      const src = read(p);
      expect(src).toMatch(/MONGO_URI is required/);
      expect(src).toMatch(/never falls back/);
    });
  });

  test('check-mongodb verifies transaction capability for D-004', () => {
    ['scripts/check-mongodb.sh', 'scripts/check-mongodb.ps1'].forEach((p) => {
      const src = read(p);
      expect(src).toMatch(/rs\.status/);
      expect(src).toMatch(/D-004/);
      expect(src).toMatch(/single-node/i);
    });
  });

  test('scripts return distinct, meaningful exit codes', () => {
    const src = read('scripts/check-mongodb.sh');
    ['exit 1', 'exit 2', 'exit 3', 'exit 0'].forEach((c) => expect(src).toContain(c));
  });
});

describe('portability — no hardcoded local path in any generated artifact', () => {
  const generated = [
    ...DB_SCRIPTS,
    ...SH.flatMap((n) => [`scripts/${n}.sh`, `scripts/${n}.ps1`]),
    'scripts/package-release.sh',
    'scripts/package-release.ps1',
    'database/seed/import-holidays.js',
    'config/academic-year-2026-27.env',
  ];

  test.each(generated)('%s contains no hardcoded user directory', (p) => {
    const src = read(p);
    // A build artifact that embeds one person's home directory is not portable,
    // leaks the machine layout of whoever produced it, and breaks for everyone
    // else. Placeholders and environment variables are fine; literals are not.
    expect(src).not.toMatch(/C:\\Users\\(?!YourName|<)[A-Za-z]/);
    expect(src).not.toMatch(/\/home\/(?!claude\b)[a-z]+\/(Desktop|Documents)/);
  });

  test('the release packager takes its destination as a parameter', () => {
    const sh = read('scripts/package-release.sh');
    expect(sh).toMatch(/--out/);
    expect(sh).toMatch(/TFS_RELEASE_OUTPUT_DIR/);
    expect(sh).toMatch(/NO PATH IS HARDCODED/);
    const ps = read('scripts/package-release.ps1');
    expect(ps).toMatch(/\$OutDir/);
    expect(ps).toMatch(/TFS_RELEASE_OUTPUT_DIR/);
  });

  test('the release packager refuses to ship a package containing a local path', () => {
    expect(read('scripts/package-release.sh')).toMatch(/local path scan/);
    expect(read('scripts/package-release.sh')).toMatch(/exit 3/);
    expect(read('scripts/package-release.ps1')).toMatch(/local path scan/);
  });

  test('stray shell-redirect output files are gitignored', () => {
    const ig = read('.gitignore');
    expect(ig).toMatch(/^3000$/m);
  });
});

describe('secret scan — no credential in any generated artifact', () => {
  const files = [...DB_SCRIPTS, ...SH.flatMap((n) => [`scripts/${n}.sh`, `scripts/${n}.ps1`])];

  test.each(files)('%s contains no literal credential', (p) => {
    const src = read(p);
    // A real connection string with embedded credentials, as opposed to a
    // placeholder or a variable reference.
    expect(src).not.toMatch(/mongodb(\+srv)?:\/\/[A-Za-z0-9._%-]+:[^@\s$"'{]+@/);
    expect(src).not.toMatch(/(?:password|apiKey|secret)\s*[:=]\s*['"][A-Za-z0-9]{6,}['"]/i);
  });

  test('.env is gitignored', () => {
    expect(read('.gitignore')).toMatch(/^\.env$/m);
  });

  test('.env.example carries placeholders only', () => {
    const src = read('backend/.env.example');
    expect(src).toMatch(/USERNAME:PASSWORD/);
    expect(src).not.toMatch(/mongodb\+srv:\/\/(?!USERNAME)[A-Za-z0-9._%-]+:[^@\s]+@/);
  });
});
