// frontend/src/components/fms/Money.jsx
//
// The single place where money is formatted in the FMS.
//
// ─── WHY THIS IS A COMPONENT AND NOT A HELPER ────────────────────────────────
// The API returns INTEGER PAISE throughout. 12345678 means ₹1,23,456.78.
//
// If each screen divides by 100 itself, a currency bug is one careless line away
// from spreading across thirty screens — and the kind that shows ₹1,234.56 as
// ₹123,456 is the kind nobody notices until a report goes to a trustee.
//
// ─── INDIAN GROUPING ─────────────────────────────────────────────────────────
// Last three digits, then pairs: 1,23,456.78 — NOT the Western 123,456.78.
// Intl.NumberFormat('en-IN') does this correctly, so use it rather than
// hand-rolling the grouping.
//
// ─── MISSING IS NOT ZERO ─────────────────────────────────────────────────────
// null/undefined renders an em dash. Rendering "no value" as ₹0.00 is how a
// reader concludes a payment was free rather than unrecorded.

import React from 'react';

/**
 * Format integer paise as Indian-grouped rupees.
 * Exported separately so tests — and non-React code — can use it directly.
 */
export function formatPaise(paise, { showSign = false } = {}) {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return '—';

  const n = Number(paise);
  if (!Number.isFinite(n)) return '—';

  const negative = n < 0;
  const rupees = Math.abs(n) / 100;

  const body = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);

  const sign = negative ? '-' : (showSign ? '+' : '');
  return `${sign}₹${body}`;
}

const Money = ({ paise, showSign = false, className = '', title }) => {
  const missing = paise === null || paise === undefined || Number.isNaN(paise);
  const negative = !missing && Number(paise) < 0;

  const tone = missing
    ? 'text-[var(--muted)]'
    : negative
      ? 'text-[var(--danger)]'
      : '';

  return (
    <span
      className={`tabular-nums whitespace-nowrap ${tone} ${className}`.trim()}
      title={title}
      data-testid="money"
    >
      {formatPaise(paise, { showSign })}
    </span>
  );
};

export default Money;