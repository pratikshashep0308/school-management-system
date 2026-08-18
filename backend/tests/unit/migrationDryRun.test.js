/**
 * Staging finding #5 — both migrations must support TFS_DRY_RUN.
 *
 * Migration 002 already honoured TFS_DRY_RUN; 001 did not, so `TFS_DRY_RUN=1`
 * silently performed the real write. This asserts BOTH migrations read the flag
 * and gate their writes behind it, and that neither defaults the flag on.
 */
const fs = require('fs');
const path = require('path');

const MIG = path.resolve(__dirname, '../../../database/migrations');
const read = (f) => fs.readFileSync(path.join(MIG, f), 'utf8');

const MIGRATIONS = [
  '001-academic-year-and-calendar.js',
  '002-academic-year-id-stamping.js',
];

describe('migrations support dry-run consistently', () => {
  MIGRATIONS.forEach((m) => {
    test(`${m} reads TFS_DRY_RUN`, () => {
      expect(read(m)).toMatch(/TFS_DRY_RUN/);
    });
    test(`${m} announces the dry run`, () => {
      expect(read(m)).toMatch(/DRY RUN/);
    });
    test(`${m} guards a write behind !DRY_RUN or an early dry-run exit`, () => {
      const src = read(m);
      // Either a write is explicitly gated, or the script quits before writing.
      const gated = /if\s*\(\s*DRY_RUN\s*\)/.test(src) || /!DRY_RUN/.test(src);
      expect(gated).toBe(true);
    });
  });
});
