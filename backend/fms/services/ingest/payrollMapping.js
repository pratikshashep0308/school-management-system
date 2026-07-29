// backend/fms/services/ingest/payrollMapping.js
//
// Payroll → FMS. Per docs/discovery/04_integration_plan.md §3.
//
// ─── G1: WHAT CANNOT BE BUILT AS ASKED ───────────────────────────────────────
// The brief asks for six components. The SMS SalarySlip schema is:
//
//     allowances: { hra, da, ta, medical, other }
//     deductions: { pf, tax, loan, other }
//     basicSalary, grossSalary, netSalary
//
//   Salary Expense    ✅ grossSalary
//   Salary Payable    ✅ netSalary
//   PF                ✅ deductions.pf
//   TDS               ✅ deductions.tax
//   ESIC              ❌ NO FIELD EXISTS
//   Professional Tax  ❌ NO FIELD EXISTS
//   Loan recovery     ✅ deductions.loan — present, but not in the requested list
//
// Option (a) from §3.1 is implemented: post what exists. ESIC and PT heads may
// exist in the Chart of Accounts but are NEVER posted from ingest.
//
// The two absences are reported on every posting rather than silently omitted.
// If the school does deduct them, the money is inside `deductions.other` and
// invisible — and somebody should know that rather than assume the statutory
// breakdown is complete.
//
// ─── WHY THE BALANCE CHECK IS LOAD-BEARING ───────────────────────────────────
// grossSalary and netSalary are computed in an SMS controller with no
// schema-level guarantee they reconcile. A slip where they do not is a data
// defect, and posting it would push an unbalanced-in-meaning entry into books
// that would still balance arithmetically because we would have to plug it.

/** §8.3 — payroll component to account code. */
const COMPONENT_CODES = {
  grossSalary: '5101',      // Salary & Wages Expense    Dr
  netSalary: '2101',        // Salary Payable            Cr
  pf: '2102',               // PF Payable                Cr
  tax: '2103',              // TDS Payable               Cr
  loan: '2104',             // Staff Loan Recovery       Cr
  other: '2109',            // Other Deductions Payable  Cr
};

/**
 * Heads that exist in the chart but are never posted from ingest, because the
 * source has no field to post from. Named so a reader is not left wondering
 * why an account never moves.
 */
const UNSOURCED_COMPONENTS = [
  { code: '2105', name: 'ESIC Payable', reason: 'SalarySlip has no esic field' },
  { code: '2106', name: 'Professional Tax Payable', reason: 'SalarySlip has no professionalTax field' },
];

/** ₹ float → integer paise, strict. Never rounds a value that is already wrong. */
function toPaise(rupees) {
  if (rupees === null || rupees === undefined || rupees === '') return { ok: true, paise: 0 };
  const n = Number(rupees);
  if (!Number.isFinite(n)) return { ok: false, error: `'${rupees}' is not a number` };
  if (n < 0) return { ok: false, error: `${n} is negative` };

  const scaled = n * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 0.01) {
    return { ok: false, error: `${n} does not convert to whole paise` };
  }
  return { ok: true, paise: rounded };
}

/**
 * Convert a slip's money fields, refusing anything that will not convert.
 * @returns {{ok:boolean, amounts?:object, errors?:object}}
 */
function convertSlip(slip) {
  const d = slip.deductions || {};
  const fields = {
    gross: slip.grossSalary,
    net: slip.netSalary,
    pf: d.pf,
    tax: d.tax,
    loan: d.loan,
    other: d.other,
  };

  const amounts = {};
  const errors = {};

  for (const [k, v] of Object.entries(fields)) {
    const r = toPaise(v);
    if (r.ok) amounts[k] = r.paise;
    else errors[k] = r.error;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, amounts };
}

/**
 * The assertion §3.3 calls load-bearing.
 *
 *     gross === net + pf + tax + loan + other
 *
 * A slip that fails this is NOT posted. Plugging the difference would produce
 * a voucher that balances arithmetically while describing something that never
 * happened.
 */
function checkSlipBalance(amounts) {
  const deductions = amounts.pf + amounts.tax + amounts.loan + amounts.other;
  const expected = amounts.net + deductions;
  const difference = amounts.gross - expected;

  return {
    balanced: difference === 0,
    gross: amounts.gross,
    net: amounts.net,
    deductions,
    expected,
    difference,
    reason: difference === 0
      ? null
      : `gross ${amounts.gross} ≠ net ${amounts.net} + deductions ${deductions} ` +
        `(off by ${difference} paise)`,
  };
}

/**
 * G4 — which date does this posting belong to?
 *
 * `paymentDate` defaults to Date.now when the document is CREATED, before
 * `status` becomes 'paid'. So on an unpaid or freshly-drafted slip it records
 * when somebody opened the form, not when salary left the school.
 *
 * Rule: trust paymentDate only when the slip is actually paid and the date is
 * not in the future. Otherwise fall back to updatedAt. Both are returned so
 * the choice is auditable rather than silent.
 */
function resolvePostingDate(slip, now = new Date()) {
  const paymentDate = slip.paymentDate ? new Date(slip.paymentDate) : null;
  const updatedAt = slip.updatedAt ? new Date(slip.updatedAt) : null;

  const paymentUsable = paymentDate
    && !Number.isNaN(paymentDate.getTime())
    && slip.status === 'paid'
    && paymentDate <= now;

  if (paymentUsable) {
    return { date: paymentDate, chosen: 'paymentDate', paymentDate, updatedAt };
  }

  if (updatedAt && !Number.isNaN(updatedAt.getTime())) {
    return {
      date: updatedAt,
      chosen: 'updatedAt',
      paymentDate,
      updatedAt,
      reason: !paymentDate ? 'no paymentDate on the slip'
        : slip.status !== 'paid' ? `slip status is '${slip.status}', not paid`
        : 'paymentDate is in the future — it records when the slip was drafted',
    };
  }

  return { date: null, chosen: null, error: 'the slip carries no usable date' };
}

/**
 * Build the ledger lines for one slip.
 *
 * Zero-value components are OMITTED rather than posted as zero lines — a
 * voucher listing 'PF Payable 0' is noise, and LedgerPostingService rejects a
 * line with neither side non-zero anyway.
 */
function buildLines(amounts, byCode, { partyName, party } = {}) {
  const missing = [];
  const need = (code) => {
    const a = byCode.get(code);
    if (!a) missing.push(code);
    return a;
  };

  const gross = need(COMPONENT_CODES.grossSalary);
  const credits = [
    { key: 'net', code: COMPONENT_CODES.netSalary, amount: amounts.net },
    { key: 'pf', code: COMPONENT_CODES.pf, amount: amounts.pf },
    { key: 'tax', code: COMPONENT_CODES.tax, amount: amounts.tax },
    { key: 'loan', code: COMPONENT_CODES.loan, amount: amounts.loan },
    { key: 'other', code: COMPONENT_CODES.other, amount: amounts.other },
  ].filter((c) => c.amount > 0);

  for (const c of credits) c.account = need(c.code);

  if (missing.length) {
    return {
      ok: false,
      error: `these accounts are missing from the Chart of Accounts: ${[...new Set(missing)].join(', ')}`,
      missing: [...new Set(missing)],
    };
  }

  const lines = [
    {
      account: gross._id, debit: amounts.gross, credit: 0,
      narration: 'Gross salary', partyType: 'teacher', party, partyName,
    },
    ...credits.map((c) => ({
      account: c.account._id, debit: 0, credit: c.amount,
      narration: c.account.accountName, partyType: 'teacher', party, partyName,
    })),
  ];

  return {
    ok: true,
    lines,
    componentsPosted: ['gross', ...credits.map((c) => c.key)],
    // Always reported, so nobody assumes the statutory breakdown is complete.
    componentsUnsourced: UNSOURCED_COMPONENTS,
  };
}

module.exports = {
  COMPONENT_CODES,
  UNSOURCED_COMPONENTS,
  toPaise,
  convertSlip,
  checkSlipBalance,
  resolvePostingDate,
  buildLines,
};