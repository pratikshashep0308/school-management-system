// backend/fms/services/vendor/taxIdValidation.js
//
// GSTIN and PAN validation. SRS M7 / FR-M7.
//
// ─── PURE ON PURPOSE ─────────────────────────────────────────────────────────
// No database, no request. A tax identifier is either well-formed or it is not,
// and that judgement can be tested exhaustively against known-good values.
//
// ─── WHY THE CHECKSUM MATTERS ────────────────────────────────────────────────
// A GSTIN carries a mod-36 check character. Validating only the SHAPE accepts
// every single-digit typo — 27AAPFU0939F1ZV and 27AAPFU0939F1ZW look equally
// valid to a regex, and one of them is wrong. Since a wrong GSTIN on an invoice
// means the school cannot substantiate the expense, catching the typo at entry
// is worth the twenty lines.
//
// PAN has no publicly specified check algorithm, so it is validated on format
// and structure only. Claiming more would be dishonest.

/** GSTIN and PAN both draw from this 36-character alphabet. */
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * GSTIN: 15 characters.
 *   1–2    state code (01–38, plus 97 for other territory)
 *   3–12   the holder's PAN
 *   13     entity number for that PAN within the state (1–9, A–Z)
 *   14     'Z' by convention
 *   15     mod-36 check character
 */
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * PAN: 10 characters, AAAAA9999A.
 * The 4th character encodes the holder type, and the 5th is the first letter
 * of the surname (individuals) or entity name.
 */
const PAN_SHAPE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** 4th character of a PAN — the holder type. */
const PAN_HOLDER_TYPE = {
  P: 'Individual',
  C: 'Company',
  H: 'Hindu Undivided Family',
  F: 'Firm / LLP',
  A: 'Association of Persons',
  T: 'Trust',
  B: 'Body of Individuals',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government',
};

/** Valid GST state codes. 97 is "Other Territory"; 99 is centralised. */
const VALID_STATE_CODES = new Set([
  ...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')),
  '97', '99',
]);

const STATE_NAMES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', 10: 'Bihar', 11: 'Sikkim',
  12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur', 15: 'Mizoram',
  16: 'Tripura', 17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal',
  20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh',
  24: 'Gujarat', 26: 'Dadra & Nagar Haveli and Daman & Diu', 27: 'Maharashtra',
  29: 'Karnataka', 30: 'Goa', 31: 'Lakshadweep', 32: 'Kerala',
  33: 'Tamil Nadu', 34: 'Puducherry', 35: 'Andaman & Nicobar Islands',
  36: 'Telangana', 37: 'Andhra Pradesh', 38: 'Ladakh', 97: 'Other Territory',
};

/**
 * The GSTIN check character.
 *
 * Each of the first 14 characters is weighted alternately 1 and 2. Products
 * above 35 are folded (quotient + remainder), summed, and the check value is
 * whatever brings the total to a multiple of 36.
 */
function gstinCheckChar(first14) {
  let total = 0;

  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]);
    if (value === -1) return null;

    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    total += Math.floor(product / 36) + (product % 36);
  }

  return CHARSET[(36 - (total % 36)) % 36];
}

/**
 * Validate a GSTIN.
 * @returns {{valid:boolean, reason?:string, expected?:string, stateCode?:string, pan?:string}}
 */
function validateGstin(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { valid: false, reason: 'GSTIN is empty' };
  }

  const gstin = String(raw).trim().toUpperCase();

  if (gstin.length !== 15) {
    return { valid: false, reason: `GSTIN must be 15 characters, got ${gstin.length}` };
  }
  if (!GSTIN_SHAPE.test(gstin)) {
    return {
      valid: false,
      reason: 'GSTIN format is wrong — expected 2 digits, 5 letters, 4 digits, ' +
              "1 letter, 1 alphanumeric, 'Z', 1 alphanumeric",
    };
  }

  const stateCode = gstin.slice(0, 2);
  if (!VALID_STATE_CODES.has(stateCode)) {
    return { valid: false, reason: `'${stateCode}' is not a valid GST state code` };
  }

  const expected = gstinCheckChar(gstin.slice(0, 14));
  if (gstin[14] !== expected) {
    return {
      valid: false,
      reason: 'GSTIN check character is wrong — this is usually a typo',
      expected,
      got: gstin[14],
    };
  }

  return {
    valid: true,
    gstin,
    stateCode,
    stateName: STATE_NAMES[stateCode] || null,
    pan: gstin.slice(2, 12),
    entityNumber: gstin[12],
  };
}

/**
 * Validate a PAN.
 *
 * Format and holder-type only. PAN's final character is a check digit but its
 * algorithm is not published, so claiming to verify it would be a lie.
 */
function validatePan(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { valid: false, reason: 'PAN is empty' };
  }

  const pan = String(raw).trim().toUpperCase();

  if (pan.length !== 10) {
    return { valid: false, reason: `PAN must be 10 characters, got ${pan.length}` };
  }
  if (!PAN_SHAPE.test(pan)) {
    return { valid: false, reason: 'PAN format is wrong — expected AAAAA9999A' };
  }

  const type = pan[3];
  if (!PAN_HOLDER_TYPE[type]) {
    return {
      valid: false,
      reason: `'${type}' is not a recognised PAN holder type (4th character)`,
      allowed: Object.keys(PAN_HOLDER_TYPE).join(', '),
    };
  }

  return {
    valid: true,
    pan,
    holderType: type,
    holderTypeName: PAN_HOLDER_TYPE[type],
    // Not verified — see above.
    checksumVerified: false,
  };
}

/**
 * If both are supplied they must agree: a GSTIN contains the PAN at
 * characters 3–12. A mismatch means one of them belongs to somebody else.
 */
function validatePair(gstin, pan) {
  const g = gstin ? validateGstin(gstin) : null;
  const p = pan ? validatePan(pan) : null;

  if (g && !g.valid) return { valid: false, field: 'gstin', ...g };
  if (p && !p.valid) return { valid: false, field: 'pan', ...p };

  if (g?.valid && p?.valid && g.pan !== p.pan) {
    return {
      valid: false,
      field: 'pan',
      reason: `PAN ${p.pan} does not match the PAN embedded in the GSTIN (${g.pan})`,
      gstinPan: g.pan,
      suppliedPan: p.pan,
    };
  }

  return { valid: true, gstin: g?.valid ? g : null, pan: p?.valid ? p : null };
}

module.exports = {
  validateGstin,
  validatePan,
  validatePair,
  gstinCheckChar,
  GSTIN_SHAPE,
  PAN_SHAPE,
  PAN_HOLDER_TYPE,
  STATE_NAMES,
  VALID_STATE_CODES,
};