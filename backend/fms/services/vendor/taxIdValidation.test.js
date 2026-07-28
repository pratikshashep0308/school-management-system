// backend/fms/services/vendor/taxIdValidation.test.js
//
//   node --test fms/services/vendor/taxIdValidation.test.js
//
// Pure validation, so these run anywhere in milliseconds.
//
// The GSTINs below are publicly documented examples. They are not hardcoded
// expectations — the checksum implementation independently produces their check
// characters, which is the strongest confirmation available without calling the
// GST portal.

const test = require('node:test');
const assert = require('node:assert');

const v = require('./taxIdValidation');

// Real, publicly published GSTINs used as reference values.
const VALID_GSTINS = [
  '27AAPFU0939F1ZV',   // Maharashtra
  '29AAGCB7383J1Z4',   // Karnataka
  '07AAACB2894G1ZP',   // Delhi
  '24AAACC1206D1ZM',   // Gujarat
  '09AAACH7409R1ZZ',   // Uttar Pradesh
];

// ─────────────────────────────────────────────────────────────────────────────
test('GSTIN — valid identifiers', async (t) => {
  await t.test('every reference GSTIN validates', () => {
    for (const g of VALID_GSTINS) {
      const r = v.validateGstin(g);
      assert.strictEqual(r.valid, true, `${g}: ${r.reason}`);
    }
  });

  await t.test('the state is decoded', () => {
    assert.strictEqual(v.validateGstin('27AAPFU0939F1ZV').stateName, 'Maharashtra');
    assert.strictEqual(v.validateGstin('29AAGCB7383J1Z4').stateName, 'Karnataka');
    assert.strictEqual(v.validateGstin('07AAACB2894G1ZP').stateName, 'Delhi');
  });

  await t.test('the embedded PAN is extracted', () => {
    assert.strictEqual(v.validateGstin('27AAPFU0939F1ZV').pan, 'AAPFU0939F');
  });

  await t.test('lowercase and surrounding space are tolerated', () => {
    assert.strictEqual(v.validateGstin('  27aapfu0939f1zv  ').valid, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('GSTIN — the checksum catches typos a regex would not', async (t) => {
  await t.test('a wrong check character is rejected', () => {
    // 27AAPFU0939F1ZV is valid; ...ZW has the same shape and is not.
    const r = v.validateGstin('27AAPFU0939F1ZW');
    assert.strictEqual(r.valid, false);
    assert.match(r.reason, /check character/);
    assert.strictEqual(r.expected, 'V');
  });

  await t.test('EVERY wrong check character is rejected', () => {
    const base = '27AAPFU0939F1Z';
    const correct = 'V';
    const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    let rejected = 0;
    for (const c of charset) {
      const r = v.validateGstin(base + c);
      if (c === correct) {
        assert.strictEqual(r.valid, true, `${c} should be the valid check char`);
      } else {
        assert.strictEqual(r.valid, false, `${base}${c} should be rejected`);
        rejected += 1;
      }
    }
    assert.strictEqual(rejected, 35);
  });

  await t.test('a single-digit typo in the PAN portion is caught', () => {
    // AAPFU0939F → AAPFU0938F: same shape, different checksum.
    const r = v.validateGstin('27AAPFU0938F1ZV');
    assert.strictEqual(r.valid, false);
    assert.match(r.reason, /check character/);
  });

  await t.test('a transposition is caught', () => {
    const r = v.validateGstin('27AAPFU0399F1ZV');
    assert.strictEqual(r.valid, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('GSTIN — malformed input', async (t) => {
  const cases = [
    ['', /empty/],
    [null, /empty/],
    ['27AAPFU0939F1Z', /15 characters/],           // too short
    ['27AAPFU0939F1ZVX', /15 characters/],         // too long
    ['AA27PFU0939F1ZV', /format/],                 // letters where digits belong
    ['27AAPFU0939F1AV', /format/],                 // 14th char not 'Z'
    ['00AAPFU0939F1ZV', /state code/],             // 00 is not a state
    ['99AAPFU0939F1ZV', /check character/],        // 99 is a valid code, bad checksum
    ['40AAPFU0939F1ZV', /state code/],             // above 38 and not 97/99
  ];

  for (const [input, expected] of cases) {
    await t.test(`rejects ${JSON.stringify(input)}`, () => {
      const r = v.validateGstin(input);
      assert.strictEqual(r.valid, false);
      assert.match(r.reason, expected);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
test('PAN', async (t) => {
  await t.test('valid PANs are accepted', () => {
    for (const p of ['AAPFU0939F', 'AAGCB7383J', 'ABCPD1234E', 'AAATR5678H']) {
      assert.strictEqual(v.validatePan(p).valid, true, p);
    }
  });

  await t.test('the holder type is decoded', () => {
    assert.strictEqual(v.validatePan('ABCPD1234E').holderTypeName, 'Individual');
    assert.strictEqual(v.validatePan('AAACB2894G').holderTypeName, 'Company');
    assert.strictEqual(v.validatePan('AAATR5678H').holderTypeName, 'Trust');
    assert.strictEqual(v.validatePan('AAPFU0939F').holderTypeName, 'Firm / LLP');
  });

  await t.test('an unrecognised holder type is rejected', () => {
    // 'X' is not an assigned holder type.
    const r = v.validatePan('AAAXB1234C');
    assert.strictEqual(r.valid, false);
    assert.match(r.reason, /holder type/);
  });

  await t.test('malformed PANs are rejected', () => {
    for (const [p, re] of [
      ['', /empty/],
      ['AAPFU0939', /10 characters/],
      ['AAPFU0939FX', /10 characters/],
      ['12PFU0939F', /format/],
      ['AAPFU093AF', /format/],
    ]) {
      const r = v.validatePan(p);
      assert.strictEqual(r.valid, false, p);
      assert.match(r.reason, re);
    }
  });

  await t.test('the checksum is HONESTLY reported as unverified', () => {
    // PAN's check algorithm is not published. Claiming to verify it would be
    // a lie, so the result says so explicitly.
    assert.strictEqual(v.validatePan('AAPFU0939F').checksumVerified, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('GSTIN and PAN must agree', async (t) => {
  await t.test('a matching pair is accepted', () => {
    const r = v.validatePair('27AAPFU0939F1ZV', 'AAPFU0939F');
    assert.strictEqual(r.valid, true);
  });

  await t.test('a MISMATCHED pair is rejected', () => {
    // Both are individually valid; together they describe two different people.
    const r = v.validatePair('27AAPFU0939F1ZV', 'AAGCB7383J');
    assert.strictEqual(r.valid, false);
    assert.strictEqual(r.field, 'pan');
    assert.match(r.reason, /does not match/);
    assert.strictEqual(r.gstinPan, 'AAPFU0939F');
  });

  await t.test('either may be supplied alone', () => {
    assert.strictEqual(v.validatePair('27AAPFU0939F1ZV', null).valid, true);
    assert.strictEqual(v.validatePair(null, 'AAPFU0939F').valid, true);
    assert.strictEqual(v.validatePair(null, null).valid, true);
  });

  await t.test('an invalid GSTIN fails the pair even with a good PAN', () => {
    const r = v.validatePair('27AAPFU0939F1ZW', 'AAPFU0939F');
    assert.strictEqual(r.valid, false);
    assert.strictEqual(r.field, 'gstin');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('checksum generator', async (t) => {
  await t.test('reproduces the check character of every reference GSTIN', () => {
    for (const g of VALID_GSTINS) {
      assert.strictEqual(v.gstinCheckChar(g.slice(0, 14)), g[14], g);
    }
  });

  await t.test('a non-alphanumeric character yields null rather than a wrong answer', () => {
    assert.strictEqual(v.gstinCheckChar('27AAPFU0939F1-'), null);
  });
});