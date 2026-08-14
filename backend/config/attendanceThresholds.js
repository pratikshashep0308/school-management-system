/**
 * attendanceThresholds — FP-032 · Decision R-3 · FINAL LLD 1.1 §21.1, Amendment A-01.3
 *
 * ── The defect this corrects ────────────────────────────────────────────────
 * Eleven attendance threshold literals existed across the attendance code, and
 * the same business rule appeared in two representations in one file:
 * `percentage < 75` at attendanceService.js:133 and `< 0.75` at :178. Someone
 * would eventually have changed one and not the other. A second threshold — the
 * 60% critical level — was undocumented and shared the defect.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * There is ONE authoritative source: School.aiThresholds. Values are ALWAYS
 * percentages (0-100), never fractions. Any comparison against a ratio must
 * convert the ratio, never the threshold — see `ratioToPct`.
 *
 * Business meaning is unchanged: warning stays 75, critical stays 60.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────
 * Export and report colour bands are PRESENTATION rules and are deliberately
 * NOT sourced from here (R-2). Changing a business threshold must not silently
 * repaint historical reports. See config/presentationBands.js.
 */

/** Approved defaults. Used when a school has no explicit configuration. */
const DEFAULTS = Object.freeze({
  attendanceWarningPct: 75,
  attendanceCriticalPct: 60,
});

/** Minimum records before a percentage is meaningful enough to alert on. */
const MIN_RECORDS_FOR_ALERT = 10;

/**
 * Resolve thresholds for a school, falling back to the approved defaults.
 *
 * @param {object} [school] School document or lean object
 * @returns {{warningPct: number, criticalPct: number}} always percentages
 */
function resolveThresholds(school) {
  const t = (school && school.aiThresholds) || {};
  const warningPct = Number.isFinite(t.attendanceWarningPct)
    ? t.attendanceWarningPct
    : DEFAULTS.attendanceWarningPct;
  const criticalPct = Number.isFinite(t.attendanceCriticalPct)
    ? t.attendanceCriticalPct
    : DEFAULTS.attendanceCriticalPct;
  return { warningPct, criticalPct };
}

/**
 * Normalise a ratio (0-1) to a percentage (0-100).
 *
 * The single conversion point. Thresholds are never expressed as fractions, so
 * a caller holding a ratio converts the ratio — this is what prevents `75` and
 * `0.75` coexisting as two spellings of one rule.
 */
const ratioToPct = (ratio) => Math.round(ratio * 100);

/**
 * Alert level for an attendance percentage.
 *
 * @param {number} pct  percentage 0-100
 * @param {object} [school]
 * @returns {'ok'|'warning'|'critical'}
 */
function alertLevel(pct, school) {
  const { warningPct, criticalPct } = resolveThresholds(school);
  if (pct < criticalPct) return 'critical';
  if (pct < warningPct) return 'warning';
  return 'ok';
}

/**
 * Whether a percentage is below the eligibility threshold.
 *
 * Boundary: exactly the warning threshold is NOT low. The rule is `< warning`,
 * so a student at exactly 75% is eligible.
 */
function isBelowWarning(pct, school) {
  return pct < resolveThresholds(school).warningPct;
}

function isBelowCritical(pct, school) {
  return pct < resolveThresholds(school).criticalPct;
}

module.exports = {
  DEFAULTS,
  MIN_RECORDS_FOR_ALERT,
  resolveThresholds,
  ratioToPct,
  alertLevel,
  isBelowWarning,
  isBelowCritical,
};
