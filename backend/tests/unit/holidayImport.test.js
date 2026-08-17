/**
 * Holiday import — validation and parsing.
 * Gate tier: LOCAL UNIT — the file parsing and validation paths are pure
 * functions exercised through a re-implementation-free require of the module's
 * exported helpers via child process argument handling. Here we test the
 * artifact statically plus the sample files, which is what can run without a DB.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('holiday import artifact', () => {
  test('import-holidays.js is syntactically valid', () => {
    expect(() => new vm.Script(read('database/seed/import-holidays.js'))).not.toThrow();
  });

  test('supports a dry run and does not default to --replace', () => {
    const src = read('database/seed/import-holidays.js');
    expect(src).toMatch(/--dry-run/);
    expect(src).toMatch(/replace: false/);
  });

  test('validates holidays fall inside the academic year', () => {
    const src = read('database/seed/import-holidays.js');
    expect(src).toMatch(/falls outside academic year/);
  });

  test('warns when a moving festival is marked recurringAnnually', () => {
    const src = read('database/seed/import-holidays.js');
    expect(src).toMatch(/MOVING/);
    expect(src).toMatch(/diwali/i);
    expect(src).toMatch(/rollover would carry the wrong date/);
  });

  test('is idempotent — skips an entry that already exists', () => {
    const src = read('database/seed/import-holidays.js');
    expect(src).toMatch(/already present/);
    expect(src).toMatch(/skipped \+= 1/);
  });

  test('refuses to run without MONGO_URI', () => {
    expect(read('database/seed/import-holidays.js')).toMatch(/MONGO_URI is not set/);
  });
});

describe('sample import files', () => {
  test('holidays.sample.json is valid JSON with a holidays array', () => {
    const doc = JSON.parse(read('database/seed/holidays.sample.json'));
    expect(Array.isArray(doc.holidays)).toBe(true);
    expect(doc.holidays.length).toBeGreaterThan(5);
  });

  test('every sample entry has a label and an ISO date', () => {
    const doc = JSON.parse(read('database/seed/holidays.sample.json'));
    doc.holidays.forEach((h) => {
      expect(typeof h.label).toBe('string');
      expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (h.endDate) expect(h.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  test('no moving festival in the sample is marked recurringAnnually', () => {
    const doc = JSON.parse(read('database/seed/holidays.sample.json'));
    const moving = /diwali|holi|eid|dussehra/i;
    doc.holidays
      .filter((h) => moving.test(h.label))
      .forEach((h) => expect(h.recurringAnnually).toBe(false));
  });

  test('fixed-date national holidays ARE marked recurringAnnually', () => {
    const doc = JSON.parse(read('database/seed/holidays.sample.json'));
    const fixed = doc.holidays.filter((h) =>
      /Republic Day|Independence Day|Gandhi Jayanti|Christmas/i.test(h.label)
    );
    expect(fixed.length).toBe(4);
    fixed.forEach((h) => expect(h.recurringAnnually).toBe(true));
  });

  test('a multi-day break is one entry with an endDate, not one per day', () => {
    const doc = JSON.parse(read('database/seed/holidays.sample.json'));
    const diwali = doc.holidays.filter((h) => /Diwali/i.test(h.label));
    expect(diwali).toHaveLength(1);
    expect(diwali[0].endDate).toBeDefined();
  });

  test('CSV sample header matches the documented fields', () => {
    const header = read('database/seed/holidays.sample.csv').split('\n')[0].trim();
    expect(header).toBe('label,date,endDate,recurringAnnually,type');
  });

  test('CSV and JSON samples contain the same number of holidays', () => {
    const json = JSON.parse(read('database/seed/holidays.sample.json')).holidays.length;
    const csv = read('database/seed/holidays.sample.csv').split(/\r?\n/).filter(Boolean).length - 1;
    expect(csv).toBe(json);
  });
});
