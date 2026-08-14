/**
 * presentationBands — FP-033 · Decision R-2 · FINAL LLD 1.1 §21.1, §27, Amendment A-01.4
 *
 * ── Business thresholds are separate from presentation colour bands ─────────
 *
 *   A business threshold answers: "is this student below the eligibility bar?"
 *   A colour band answers:        "what colour is this cell?"
 *
 * They are DELIBERATELY INDEPENDENT. Coupling them would mean a business
 * threshold change silently repaints every historical report — a report
 * generated last year would render differently this year for reasons unrelated
 * to its data.
 *
 * So changing School.aiThresholds.attendanceWarningPct or
 * attendanceCriticalPct must NOT alter export colouring.
 *
 * ── But not scattered ───────────────────────────────────────────────────────
 * These bands previously sat as literals at attendanceService.js:557 (XLSX) and
 * :627 (PDF). Independence is not a licence to duplicate them. This module is
 * the single presentation source.
 */

/** Attendance percentage colour bands, evaluated highest-first. */
const ATTENDANCE_BANDS = Object.freeze([
  Object.freeze({ min: 90, label: 'good',       argb: 'FF16A34A', hex: '#16A34A' }),
  Object.freeze({ min: 75, label: 'acceptable', argb: 'FFD97706', hex: '#D97706' }),
  Object.freeze({ min: 0,  label: 'poor',       argb: 'FFDC2626', hex: '#DC2626' }),
]);

/**
 * Colour band for an attendance percentage.
 *
 * Takes no school argument by design: these bands are not configurable per
 * school and are not derived from business thresholds.
 */
function attendanceBand(pct) {
  const p = Number.isFinite(pct) ? pct : 0;
  return ATTENDANCE_BANDS.find((b) => p >= b.min) || ATTENDANCE_BANDS[ATTENDANCE_BANDS.length - 1];
}

const attendanceArgb = (pct) => attendanceBand(pct).argb;
const attendanceHex = (pct) => attendanceBand(pct).hex;

module.exports = { ATTENDANCE_BANDS, attendanceBand, attendanceArgb, attendanceHex };
