// backend/fms/services/ingest/accountMapper.js
//
// Resolving an SMS concept to an FMS account head.
// Per docs/discovery/04_integration_plan.md §8.
//
// ─── PURE ON PURPOSE ─────────────────────────────────────────────────────────
// Given a set of mappings and a thing to map, which account? No database, no
// request. Getting this wrong posts real money to the wrong head — and it is
// the kind of error that balances perfectly and looks fine on every report
// except the one someone eventually reads.
//
// ─── THE DISTINCTION THAT MATTERS ────────────────────────────────────────────
// There are two different situations that must NOT be treated the same:
//
//   no feeType at all      a StudentFee-ledger payment carries none, because
//                          the ledger is fee-type agnostic. Expected. Posts to
//                          'Fee Income — Unclassified' and is FLAGGED for
//                          reclassification.
//
//   feeType with no mapping  somebody added a fee type and nobody told the FMS
//                          where its money goes. NOT expected. This must
//                          SURFACE AS AN ERROR, never be quietly absorbed by a
//                          fallback — otherwise a new fee type silently pools
//                          into 'unclassified' for a year.

/** How a mapping was arrived at. Reported so the choice is auditable. */
const RESOLUTION = {
  EXPLICIT: 'explicit',       // a mapping for this exact source key
  CATEGORY: 'category',       // the default for its category
  UNCLASSIFIED: 'unclassified', // no source key existed — expected, flagged
  UNMAPPED: 'unmapped',       // a source key existed with nowhere to put it
};

/** §8.2 — payment method to debit head. */
const METHOD_TO_CODE = {
  cash: '1101',
  bank: '1201',
  cheque: '1201',
  // Online and UPI go to a CLEARING head, not the main bank account. The money
  // has not settled yet; posting it to 1201 would overstate the bank balance
  // until it does, and leave the bank reconciliation nothing to work with.
  online: '1202',
  upi: '1202',
};

/** §8.1 — fee category to income head, used when no explicit mapping exists. */
const FEE_CATEGORY_TO_CODE = {
  tuition: '4101',
  exam: '4102',
  transport: '4103',
  uniform: '4104',
  library: '4105',
  sports: '4106',
  other: '4107',
};

const LATE_FEE_CODE = '4108';
const UNCLASSIFIED_FEE_CODE = '4109';

/**
 * Index a list of mapping documents for lookup.
 * @param {Array} mappings [{ mappingType, sourceKey, account, accountCode }]
 */
function indexMappings(mappings = []) {
  const byType = {};
  for (const m of mappings) {
    if (!byType[m.mappingType]) byType[m.mappingType] = new Map();
    byType[m.mappingType].set(String(m.sourceKey), m);
  }
  return byType;
}

/**
 * Which account should this fee payment be credited to?
 *
 * @param {object} payment  { feeType, feeTypeName, feeCategory, isLateFee }
 * @param {object} index    from indexMappings()
 * @param {Map}    byCode   accountCode -> account, for the category defaults
 */
function resolveFeeIncomeAccount(payment, index, byCode) {
  const explicit = payment.feeType
    ? index.feeType?.get(String(payment.feeType))
    : null;

  if (explicit) {
    return {
      resolution: RESOLUTION.EXPLICIT,
      account: explicit.account,
      accountCode: explicit.accountCode,
      needsReclassification: false,
    };
  }

  // No fee type at all — a StudentFee-ledger payment. Expected, and the
  // asymmetry is a consequence of the SMS's three fee systems, not a defect.
  if (!payment.feeType) {
    const acct = byCode.get(UNCLASSIFIED_FEE_CODE);
    if (!acct) {
      return {
        resolution: RESOLUTION.UNMAPPED,
        error:
          `No fee type on this payment and no '${UNCLASSIFIED_FEE_CODE} Fee Income — ` +
          'Unclassified' + "' account exists to hold it",
      };
    }
    return {
      resolution: RESOLUTION.UNCLASSIFIED,
      account: acct._id,
      accountCode: acct.accountCode,
      // Flagged so somebody can reclassify it, rather than it disappearing
      // into a bucket nobody looks at.
      needsReclassification: true,
      note: 'Posted to Unclassified — the source ledger carries no fee type',
    };
  }

  // A fee type IS present but has no explicit mapping. Fall back to its
  // category if we know one.
  const code = payment.isLateFee
    ? LATE_FEE_CODE
    : FEE_CATEGORY_TO_CODE[payment.feeCategory];

  if (code) {
    const acct = byCode.get(code);
    if (acct) {
      return {
        resolution: RESOLUTION.CATEGORY,
        account: acct._id,
        accountCode: acct.accountCode,
        needsReclassification: false,
        note: `Mapped by category '${payment.feeCategory}' — no explicit mapping for this fee type`,
      };
    }
  }

  // A fee type exists and there is nowhere to put its money. This is the case
  // that must be LOUD.
  return {
    resolution: RESOLUTION.UNMAPPED,
    error:
      `Fee type '${payment.feeTypeName || payment.feeType}' has no account mapping` +
      (payment.feeCategory
        ? ` and no account exists for its category '${payment.feeCategory}' (expected ${code})`
        : ' and it carries no category to fall back on'),
    feeType: payment.feeType,
    feeCategory: payment.feeCategory,
    hint: 'Add a mapping under /api/fms/integrations/mappings before the next cycle.',
  };
}

/**
 * Which account was the money received INTO?
 *
 * An explicit mapping wins, so a school with two bank accounts can direct
 * online collections wherever it actually banks them.
 */
function resolveDebitAccount(method, index, byCode) {
  const explicit = index.paymentMethod?.get(String(method));
  if (explicit) {
    return {
      resolution: RESOLUTION.EXPLICIT,
      account: explicit.account,
      accountCode: explicit.accountCode,
    };
  }

  const code = METHOD_TO_CODE[method];
  if (!code) {
    return {
      resolution: RESOLUTION.UNMAPPED,
      error: `Unknown payment method '${method}' — no debit account can be chosen`,
      hint: `Known methods: ${Object.keys(METHOD_TO_CODE).join(', ')}`,
    };
  }

  const acct = byCode.get(code);
  if (!acct) {
    return {
      resolution: RESOLUTION.UNMAPPED,
      error: `Payment method '${method}' maps to account ${code}, which does not exist`,
      expectedCode: code,
      hint: 'Create it in the Chart of Accounts, or add an explicit mapping.',
    };
  }

  return {
    resolution: RESOLUTION.CATEGORY,
    account: acct._id,
    accountCode: acct.accountCode,
    isClearing: code === '1202',
  };
}

/**
 * ₹ float from the SMS to integer paise.
 *
 * Rejects anything that does not convert cleanly. §2.6: never round twice —
 * a value that is already wrong should stop the record, not be quietly
 * approximated into the ledger.
 */
function toPaiseStrict(rupees) {
  if (rupees === null || rupees === undefined) {
    return { ok: false, error: 'amount is missing' };
  }
  const n = Number(rupees);
  if (!Number.isFinite(n)) {
    return { ok: false, error: `amount '${rupees}' is not a number` };
  }
  if (n <= 0) {
    return { ok: false, error: `amount ${n} must be greater than zero` };
  }

  const scaled = n * 100;
  const rounded = Math.round(scaled);

  // Floats carry values like 1234.5600000000002. A tolerance of a hundredth of
  // a paisa accepts that while still rejecting 12.345, which is a real
  // sub-paisa amount and therefore a data problem.
  if (Math.abs(scaled - rounded) > 0.01) {
    return {
      ok: false,
      error: `amount ${n} does not convert to whole paise (${scaled})`,
    };
  }

  return { ok: true, paise: rounded };
}

/**
 * Parse the SMS's free-text period into a date, defensively.
 * `month` is a string like 'April' and `year` a number.
 */
function parsePeriod(month, year) {
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

  if (!month || !year) return null;
  const idx = MONTHS.indexOf(String(month).trim().toLowerCase());
  if (idx === -1) return null;
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return null;

  return new Date(Date.UTC(y, idx, 1));
}

module.exports = {
  RESOLUTION,
  METHOD_TO_CODE,
  FEE_CATEGORY_TO_CODE,
  LATE_FEE_CODE,
  UNCLASSIFIED_FEE_CODE,
  indexMappings,
  resolveFeeIncomeAccount,
  resolveDebitAccount,
  toPaiseStrict,
  parsePeriod,
};