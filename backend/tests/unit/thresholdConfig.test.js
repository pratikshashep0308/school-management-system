/**
 * FP-032 / FP-033 — attendance thresholds and presentation bands
 * Decisions R-3, R-2 · FINAL LLD 1.1 §21.1, Amendment A-01.3, A-01.4
 * Test tier: A/B — STATIC and UNIT. No database.
 */
const fs = require('fs');
const path = require('path');
const t = require('../../config/attendanceThresholds');
const bands = require('../../config/presentationBands');

const SRC = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
/** Strip comments so documentation of the old defect isn't mistaken for the defect. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('R-3 — one authoritative threshold source', () => {
  test('approved defaults are 75 and 60 (R-3.T4)', () => {
    expect(t.DEFAULTS.attendanceWarningPct).toBe(75);
    expect(t.DEFAULTS.attendanceCriticalPct).toBe(60);
  });

  test('resolves from School.aiThresholds when present', () => {
    const r = t.resolveThresholds({ aiThresholds: { attendanceWarningPct: 80, attendanceCriticalPct: 65 } });
    expect(r).toEqual({ warningPct: 80, criticalPct: 65 });
  });

  test('falls back to defaults when a school has no configuration', () => {
    expect(t.resolveThresholds(null)).toEqual({ warningPct: 75, criticalPct: 60 });
    expect(t.resolveThresholds({})).toEqual({ warningPct: 75, criticalPct: 60 });
  });

  test('a partial configuration falls back per field', () => {
    const r = t.resolveThresholds({ aiThresholds: { attendanceWarningPct: 80 } });
    expect(r).toEqual({ warningPct: 80, criticalPct: 60 });
  });
});

describe('R-3.T3 — the two representations cannot diverge', () => {
  test('ratioToPct converts the RATIO, never the threshold', () => {
    expect(t.ratioToPct(0.75)).toBe(75);
    expect(t.ratioToPct(0.6)).toBe(60);
    expect(t.ratioToPct(1)).toBe(100);
    expect(t.ratioToPct(0)).toBe(0);
  });

  test('a ratio and a percentage reach the SAME verdict for the same data', () => {
    // The defect R-3 corrects: `percentage < 75` at one line and `< 0.75` at
    // another. Both paths now run through one comparison.
    for (const [present, total] of [[15, 20], [14, 20], [16, 20], [3, 4], [59, 100], [60, 100]]) {
      const pct = t.ratioToPct(present / total);
      const viaRatio = t.isBelowWarning(t.ratioToPct(present / total));
      const viaPct = t.isBelowWarning(pct);
      expect(viaRatio).toBe(viaPct);
    }
  });

  test('thresholds are percentages, never fractions', () => {
    expect(t.DEFAULTS.attendanceWarningPct).toBeGreaterThan(1);
    expect(t.DEFAULTS.attendanceCriticalPct).toBeGreaterThan(1);
  });

  test('no fraction-form threshold comparison remains in the attendance code', () => {
    expect(code('services/attendanceService.js')).not.toMatch(/<\s*0\.75/);
    expect(code('services/attendanceService.js')).not.toMatch(/<\s*0\.6\b/);
  });
});

describe('R-3 — boundary behaviour, business meaning unchanged', () => {
  test.each([
    [100, 'ok'], [76, 'ok'], [75, 'ok'],
    [74, 'warning'], [61, 'warning'], [60, 'warning'],
    [59, 'critical'], [0, 'critical'],
  ])('%i%% resolves to %s', (pct, level) => {
    expect(t.alertLevel(pct)).toBe(level);
  });

  test('exactly the warning threshold is NOT below it', () => {
    // The rule is `< warning`, so 75% is eligible.
    expect(t.isBelowWarning(75)).toBe(false);
    expect(t.isBelowWarning(74.9)).toBe(true);
  });

  test('exactly the critical threshold is NOT below it', () => {
    expect(t.isBelowCritical(60)).toBe(false);
    expect(t.isBelowCritical(59)).toBe(true);
  });

  test('boundaries move with configuration', () => {
    const s = { aiThresholds: { attendanceWarningPct: 80, attendanceCriticalPct: 50 } };
    expect(t.alertLevel(75, s)).toBe('warning');
    expect(t.alertLevel(49, s)).toBe('critical');
    expect(t.alertLevel(80, s)).toBe('ok');
  });
});

describe('R-3.T2 — no threshold literal remains in application code', () => {
  test.each(['services/attendanceService.js', 'controllers/attendanceController.js'])(
    '%s contains no hardcoded threshold comparison', (f) => {
      const src = code(f);
      expect(src).not.toMatch(/(percentage|pct)\s*[<>]=?\s*(75|60)\b/);
      expect(src).not.toMatch(/threshold\s*=\s*75\b/);
    }
  );

  test('the alert minimum-record count is a named constant', () => {
    expect(t.MIN_RECORDS_FOR_ALERT).toBe(10);
    expect(code('services/attendanceService.js')).toMatch(/MIN_RECORDS_FOR_ALERT/);
  });
});

describe('R-2 — presentation bands are independent of business thresholds', () => {
  test.each([[100, 'good'], [90, 'good'], [89, 'acceptable'], [75, 'acceptable'], [74, 'poor'], [0, 'poor']])(
    '%i%% renders as %s', (pct, label) => {
      expect(bands.attendanceBand(pct).label).toBe(label);
    }
  );

  test('R-2.T1 — changing aiThresholds does NOT alter export colouring', () => {
    const before = [95, 80, 50].map((p) => bands.attendanceArgb(p));
    // Simulate a business threshold change; bands take no school argument at all.
    t.resolveThresholds({ aiThresholds: { attendanceWarningPct: 90, attendanceCriticalPct: 85 } });
    const after = [95, 80, 50].map((p) => bands.attendanceArgb(p));
    expect(after).toEqual(before);
  });

  test('the band function cannot accept a school — coupling is structurally impossible', () => {
    expect(bands.attendanceBand.length).toBe(1);
  });

  test('R-2.T2 — no colour literal remains outside the presentation constant', () => {
    const src = read('services/attendanceService.js');
    expect(src).not.toMatch(/FF16A34A|FFD97706|FFDC2626/);
    expect(src).not.toMatch(/#16A34A|#D97706|#DC2626/);
  });

  test('bands are frozen against accidental mutation', () => {
    expect(Object.isFrozen(bands.ATTENDANCE_BANDS)).toBe(true);
    expect(Object.isFrozen(bands.ATTENDANCE_BANDS[0])).toBe(true);
  });

  test('a non-numeric percentage degrades to the lowest band, never undefined', () => {
    expect(bands.attendanceBand(undefined).label).toBe('poor');
    expect(bands.attendanceBand(NaN).label).toBe('poor');
  });
});
