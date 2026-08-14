// backend/fms/services/ingest/accountMapper.test.js
//
//   node --test fms/services/ingest/accountMapper.test.js
//
// Posting real money to the wrong head balances perfectly and looks fine on
// every report except the one somebody eventually reads. Pure logic, so every
// path is tested directly.

const test = require('node:test');
const assert = require('node:assert');
const m = require('./accountMapper');

const acct = (code, name) => ({ _id: `id-${code}`, accountCode: code, accountName: name });

const CHART = new Map([
  ['1101', acct('1101', 'Cash in Hand')],
  ['1201', acct('1201', 'Bank — Current')],
  ['1202', acct('1202', 'Bank — Online Collections')],
  ['4101', acct('4101', 'Tuition Fee Income')],
  ['4102', acct('4102', 'Examination Fee Income')],
  ['4103', acct('4103', 'Transport Fee Income')],
  ['4108', acct('4108', 'Late Fee Income')],
  ['4109', acct('4109', 'Fee Income — Unclassified')],
]);

// ─────────────────────────────────────────────────────────────────────────────
test('fee income head — the three outcomes are kept distinct', async (t) => {
  const idx = m.indexMappings([
    { mappingType: 'feeType', sourceKey: 'ft-tuition', account: 'id-4101', accountCode: '4101' },
  ]);

  await t.test('an explicit mapping wins', () => {
    const r = m.resolveFeeIncomeAccount({ feeType: 'ft-tuition', feeCategory: 'tuition' }, idx, CHART);
    assert.strictEqual(r.resolution, m.RESOLUTION.EXPLICIT);
    assert.strictEqual(r.accountCode, '4101');
    assert.strictEqual(r.needsReclassification, false);
  });

  await t.test('no mapping falls back to the CATEGORY', () => {
    const r = m.resolveFeeIncomeAccount({ feeType: 'ft-exam', feeCategory: 'exam' }, idx, CHART);
    assert.strictEqual(r.resolution, m.RESOLUTION.CATEGORY);
    assert.strictEqual(r.accountCode, '4102');
    assert.match(r.note, /no explicit mapping/);
  });

  await t.test('NO FEE TYPE AT ALL is unclassified and FLAGGED', () => {
    // A StudentFee-ledger payment carries none. Expected — but it must not
    // vanish into a bucket nobody looks at.
    const r = m.resolveFeeIncomeAccount({ feeType: null }, idx, CHART);
    assert.strictEqual(r.resolution, m.RESOLUTION.UNCLASSIFIED);
    assert.strictEqual(r.accountCode, '4109');
    assert.strictEqual(r.needsReclassification, true);
  });

  await t.test('A FEE TYPE WITH NOWHERE TO GO IS AN ERROR, not a fallback', () => {
    // Somebody added a fee type and nobody told the FMS where its money goes.
    // Absorbing this into 'unclassified' would hide it for a year.
    const r = m.resolveFeeIncomeAccount(
      { feeType: 'ft-new', feeTypeName: 'Excursion Fee', feeCategory: 'excursion' }, idx, CHART
    );
    assert.strictEqual(r.resolution, m.RESOLUTION.UNMAPPED);
    assert.ok(r.error);
    assert.match(r.error, /Excursion Fee/);
    assert.ok(r.hint);
    assert.strictEqual(r.account, undefined, 'must not return an account');
  });

  await t.test('and it is NOT confused with the unclassified case', () => {
    const unmapped = m.resolveFeeIncomeAccount({ feeType: 'ft-x', feeCategory: 'zzz' }, idx, CHART);
    const unclassified = m.resolveFeeIncomeAccount({ feeType: null }, idx, CHART);
    assert.notStrictEqual(unmapped.resolution, unclassified.resolution);
    assert.ok(unmapped.error);
    assert.ok(!unclassified.error);
  });

  await t.test('a category with no account in the chart also errors', () => {
    const thin = new Map([['4109', acct('4109', 'Unclassified')]]);
    const r = m.resolveFeeIncomeAccount({ feeType: 'ft-t', feeCategory: 'tuition' }, idx, thin);
    assert.strictEqual(r.resolution, m.RESOLUTION.UNMAPPED);
    assert.match(r.error, /4101/);
  });

  await t.test('late fees go to their own head', () => {
    const r = m.resolveFeeIncomeAccount(
      { feeType: 'ft-late', feeCategory: 'other', isLateFee: true }, idx, CHART
    );
    assert.strictEqual(r.accountCode, '4108');
  });

  await t.test('every fee category has a code', () => {
    for (const c of ['tuition', 'exam', 'transport', 'uniform', 'library', 'sports', 'other']) {
      assert.ok(m.FEE_CATEGORY_TO_CODE[c], c);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('debit head — where the money landed', async (t) => {
  const idx = m.indexMappings([]);

  await t.test('cash', () => {
    assert.strictEqual(m.resolveDebitAccount('cash', idx, CHART).accountCode, '1101');
  });

  await t.test('bank and cheque both go to the current account', () => {
    assert.strictEqual(m.resolveDebitAccount('bank', idx, CHART).accountCode, '1201');
    assert.strictEqual(m.resolveDebitAccount('cheque', idx, CHART).accountCode, '1201');
  });

  await t.test('ONLINE AND UPI GO TO A CLEARING HEAD, not the bank', () => {
    // The money has not settled. Posting it to 1201 overstates the bank
    // balance until it does, and leaves the reconciliation nothing to match.
    for (const method of ['online', 'upi']) {
      const r = m.resolveDebitAccount(method, idx, CHART);
      assert.strictEqual(r.accountCode, '1202', method);
      assert.strictEqual(r.isClearing, true, method);
    }
  });

  await t.test('an explicit mapping overrides the default', () => {
    const custom = m.indexMappings([
      { mappingType: 'paymentMethod', sourceKey: 'online', account: 'id-1201', accountCode: '1201' },
    ]);
    const r = m.resolveDebitAccount('online', custom, CHART);
    assert.strictEqual(r.resolution, m.RESOLUTION.EXPLICIT);
    assert.strictEqual(r.accountCode, '1201');
  });

  await t.test('an unknown method errors rather than guessing', () => {
    const r = m.resolveDebitAccount('crypto', idx, CHART);
    assert.strictEqual(r.resolution, m.RESOLUTION.UNMAPPED);
    assert.match(r.error, /Unknown payment method/);
    assert.strictEqual(r.account, undefined);
  });

  await t.test('a known method with a missing account errors too', () => {
    const thin = new Map([['1101', acct('1101', 'Cash')]]);
    const r = m.resolveDebitAccount('online', idx, thin);
    assert.strictEqual(r.resolution, m.RESOLUTION.UNMAPPED);
    assert.strictEqual(r.expectedCode, '1202');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('money conversion is strict', async (t) => {
  await t.test('ordinary amounts', () => {
    assert.strictEqual(m.toPaiseStrict(1234.56).paise, 123456);
    assert.strictEqual(m.toPaiseStrict(1000).paise, 100000);
    assert.strictEqual(m.toPaiseStrict(0.01).paise, 1);
    assert.strictEqual(m.toPaiseStrict('2500.50').paise, 250050);
  });

  await t.test('float artefacts are tolerated', () => {
    // JavaScript will hand us 1234.5600000000002 for a value that is exactly
    // ₹1234.56 in the source.
    assert.strictEqual(m.toPaiseStrict(1234.5600000000002).paise, 123456);
  });

  await t.test('but a REAL sub-paisa amount is REJECTED', () => {
    // ₹12.345 is not a payable amount. Rounding it would be inventing money.
    const r = m.toPaiseStrict(12.345);
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /whole paise/);
  });

  await t.test('missing, non-numeric, zero and negative all fail', () => {
    for (const v of [null, undefined, 'abc', {}, 0, -100, NaN, Infinity]) {
      assert.strictEqual(m.toPaiseStrict(v).ok, false, JSON.stringify(v));
    }
  });

  await t.test('a failure carries a reason, never a silent zero', () => {
    const r = m.toPaiseStrict('not money');
    assert.strictEqual(r.ok, false);
    assert.ok(r.error);
    assert.strictEqual(r.paise, undefined);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('free-text period parsing', async (t) => {
  await t.test('a normal period', () => {
    const d = m.parsePeriod('April', 2026);
    assert.strictEqual(d.toISOString().slice(0, 7), '2026-04');
  });

  await t.test('case and padding do not matter', () => {
    assert.ok(m.parsePeriod('  april  ', 2026));
    assert.ok(m.parsePeriod('APRIL', 2026));
  });

  await t.test('nonsense returns null rather than a wrong date', () => {
    for (const [mo, yr] of [['Apri', 2026], ['', 2026], ['April', null],
      ['April', 1800], ['13', 2026], [null, null]]) {
      assert.strictEqual(m.parsePeriod(mo, yr), null, `${mo}/${yr}`);
    }
  });
});