/**
 * E-03 — attendance percentage for the 75% eligibility rule.
 *
 * Approved formula (FINAL-DECISION-REGISTER E-03):
 *
 *   denominator = records − nonInstructional − excused
 *   numerator   = present + late
 *   pct         = round(100 × numerator / denominator)
 *
 * 'excused' is EXCLUDED from the denominator. It previously counted in the
 * denominator but not the numerator, which made an authorised absence
 * indistinguishable from truancy and silently depressed the percentage.
 *
 * Test tier: B — UNIT. No database, no external service.
 */

/**
 * Reference implementation of the approved formula, mirroring
 * attendanceService.checkAndSendAlerts Alert 3. Kept here so the rule itself is
 * asserted independently of the alert plumbing.
 */
function attendancePercentage(records, { blockedDates = new Set() } = {}) {
  const counted = records
    .filter((r) => !blockedDates.has(r.date))
    .filter((r) => r.status !== 'excused');
  if (counted.length === 0) return { pct: null, denominator: 0, numerator: 0 };
  const numerator = counted.filter(
    (r) => r.status === 'present' || r.status === 'late'
  ).length;
  return {
    pct: Math.round((numerator / counted.length) * 100),
    denominator: counted.length,
    numerator,
  };
}

const rec = (status, date = '2026-09-01') => ({ status, date });
const many = (status, n, from = 1) =>
  Array.from({ length: n }, (_, i) =>
    rec(status, `2026-09-${String(from + i).padStart(2, '0')}`)
  );

describe('E-03 — single-state cohorts', () => {
  test('present only yields 100%', () => {
    expect(attendancePercentage(many('present', 10)).pct).toBe(100);
  });

  test('absent only yields 0%', () => {
    expect(attendancePercentage(many('absent', 10)).pct).toBe(0);
  });

  test('excused only leaves an empty denominator, not a zero percentage', () => {
    const r = attendancePercentage(many('excused', 10));
    expect(r.denominator).toBe(0);
    // Null, not 0. A student with only authorised absences has no computable
    // percentage — reporting 0% would flag them as truant.
    expect(r.pct).toBeNull();
  });

  test('late counts toward the numerator, as before the delta', () => {
    expect(attendancePercentage(many('late', 10)).pct).toBe(100);
  });
});

describe('E-03 — mixed attendance', () => {
  test('excused is removed from the denominator entirely', () => {
    // 8 present + 6 excused.
    // Old behaviour: 8/14 = 57% → critical alert.
    // Approved behaviour: 8/8 = 100%.
    const records = [...many('present', 8, 1), ...many('excused', 6, 10)];
    const r = attendancePercentage(records);
    expect(r.denominator).toBe(8);
    expect(r.pct).toBe(100);
  });

  test('excused does not rescue a genuinely poor record', () => {
    // 3 present, 9 absent, 4 excused → 3/12 = 25%.
    const records = [
      ...many('present', 3, 1),
      ...many('absent', 9, 4),
      ...many('excused', 4, 14),
    ];
    const r = attendancePercentage(records);
    expect(r.denominator).toBe(12);
    expect(r.pct).toBe(25);
  });

  test('non-instructional dates leave both numerator and denominator', () => {
    const records = [...many('present', 10, 1), ...many('absent', 5, 11)];
    const blocked = new Set(
      many('absent', 5, 11).map((r) => r.date) // the 5 absences fall on holidays
    );
    const r = attendancePercentage(records, { blockedDates: blocked });
    expect(r.denominator).toBe(10);
    expect(r.pct).toBe(100);
  });

  test('holidays and excused are both excluded, and independently', () => {
    const records = [
      ...many('present', 6, 1),
      ...many('absent', 2, 7),   // on holidays
      ...many('excused', 3, 9),
    ];
    const blocked = new Set(many('absent', 2, 7).map((r) => r.date));
    const r = attendancePercentage(records, { blockedDates: blocked });
    expect(r.denominator).toBe(6);
    expect(r.pct).toBe(100);
  });
});

describe('E-03 — the 75% eligibility boundary', () => {
  const ELIGIBILITY = 75;

  test('exactly 75% is NOT below the threshold', () => {
    // 15 present of 20 counted = 75%.
    const records = [...many('present', 15, 1), ...many('absent', 5, 16)];
    const r = attendancePercentage(records);
    expect(r.pct).toBe(75);
    expect(r.pct < ELIGIBILITY).toBe(false);
  });

  test('below 75% is flagged', () => {
    // 14 present of 20 = 70%.
    const records = [...many('present', 14, 1), ...many('absent', 6, 15)];
    const r = attendancePercentage(records);
    expect(r.pct).toBe(70);
    expect(r.pct < ELIGIBILITY).toBe(true);
  });

  test('above 75% is not flagged', () => {
    // 16 present of 20 = 80%.
    const records = [...many('present', 16, 1), ...many('absent', 4, 17)];
    const r = attendancePercentage(records);
    expect(r.pct).toBe(80);
    expect(r.pct < ELIGIBILITY).toBe(false);
  });

  test('excused can move a student from below to at the threshold', () => {
    // 15 present, 5 absent, 4 excused.
    // Denominator including excused: 15/24 = 63% → flagged.
    // Approved denominator: 15/20 = 75% → not flagged.
    const records = [
      ...many('present', 15, 1),
      ...many('absent', 5, 16),
      ...many('excused', 4, 21),
    ];
    const r = attendancePercentage(records);
    expect(r.pct).toBe(75);
    expect(r.pct < ELIGIBILITY).toBe(false);
  });

  test('rounding is applied, not truncation', () => {
    // 2 present of 3 = 66.67 → 67, not 66.
    const records = [...many('present', 2, 1), ...many('absent', 1, 3)];
    expect(attendancePercentage(records).pct).toBe(67);
  });

  test('an empty counted set never divides by zero', () => {
    expect(attendancePercentage([]).pct).toBeNull();
    expect(attendancePercentage(many('excused', 5)).pct).toBeNull();
  });
});
