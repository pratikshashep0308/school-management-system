// backend/fms/utils/money.js
//
// The single source of truth for FMS money arithmetic.
//
// RULE: every monetary value stored in an fms_ collection is an INTEGER number
// of paise. ₹1,234.56 is 123456. Never a float.
//
// The SMS stores float rupees everywhere (StudentFee.totalFees,
// FeeAssignment.finalAmount, SalarySlip.netSalary, Expense.amount — all plain
// Number). Conversion happens exactly ONCE, at the ingest boundary, through
// toPaise(). It never happens inside ledger maths, and the FMS never writes a
// converted value back to the SMS.
//
// Scaffolded at P1.1 because the ingest adapters and the posting engine both
// depend on it. Fully exercised from P1.4.

/** ₹ float → integer paise. Half-up rounding at the boundary, once. */
function toPaise(rupees) {
  const n = Number(rupees);
  if (!Number.isFinite(n)) {
    throw new TypeError(`money.toPaise: not a finite number: ${rupees}`);
  }
  // Round the scaled value, not the input. Math.round(1234.565 * 100) is the
  // documented behaviour; the alternative (rounding rupees first) loses paise.
  return Math.round(n * 100);
}

/** Integer paise → ₹ float. DISPLAY ONLY — never feed this back into maths. */
function toRupees(paise) {
  return assertInt(paise, 'toRupees') / 100;
}

function assertInt(x, fn) {
  const n = Number(x);
  if (!Number.isInteger(n)) {
    throw new TypeError(`money.${fn}: expected integer paise, got ${x}`);
  }
  return n;
}

function add(...xs) {
  return xs.reduce((s, x) => s + assertInt(x, 'add'), 0);
}

function sub(a, b) {
  return assertInt(a, 'sub') - assertInt(b, 'sub');
}

function sum(arr, pick = (x) => x) {
  return arr.reduce((s, x) => s + assertInt(pick(x), 'sum'), 0);
}

/**
 * Double-entry balance check.
 *
 * Asserted BEFORE a transaction opens, never after. An unbalanced set of lines
 * must not reach the database at all (discovery risk RR7).
 *
 * @param {Array<{debit?:number, credit?:number}>} lines
 */
function isBalanced(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return false;
  const dr = sum(lines, (l) => l.debit || 0);
  const cr = sum(lines, (l) => l.credit || 0);
  return dr === cr && dr > 0;
}

/** Human-readable. Display only. */
function format(paise, symbol = '₹') {
  const n = assertInt(paise, 'format');
  return `${symbol}${(n / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

module.exports = { toPaise, toRupees, add, sub, sum, isBalanced, format };