// backend/fms/services/ledger/posting.test.js
//
// Unit tests for the parts of LedgerPostingService that need no database.
// Run anywhere:
//
//   node --test fms/services/ledger/posting.test.js
//
// The transactional behaviour (atomicity, idempotency under concurrency,
// reversal, FY lock) needs a replica set and is covered by
// fms/services/ledger/integration.check.js, run on staging.

const test = require('node:test');
const assert = require('node:assert');

const { validateLines, PostingError } = require('./LedgerPostingService');
const money = require('../../utils/money');

const acc = () => '507f1f77bcf86cd799439011';
const dr = (n) => ({ account: acc(), debit: n, credit: 0 });
const cr = (n) => ({ account: acc(), debit: 0, credit: n });

function expectCode(fn, code) {
  try {
    fn();
    assert.fail(`expected PostingError ${code}, got none`);
  } catch (e) {
    assert.ok(e instanceof PostingError, `expected PostingError, got ${e.name}`);
    assert.strictEqual(e.code, code);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
test('balance is enforced before any write', async (t) => {
  await t.test('accepts a balanced two-leg voucher', () => {
    const r = validateLines([dr(123456), cr(123456)]);
    assert.strictEqual(r.totalDebit, 123456);
    assert.strictEqual(r.totalCredit, 123456);
  });

  await t.test('accepts a balanced multi-leg voucher', () => {
    // Payroll shape: Dr gross; Cr net + pf + tds
    const r = validateLines([dr(5000000), cr(4200000), cr(500000), cr(300000)]);
    assert.strictEqual(r.totalDebit, 5000000);
    assert.strictEqual(r.totalCredit, 5000000);
  });

  await t.test('rejects unbalanced by one paisa', () => {
    expectCode(() => validateLines([dr(123456), cr(123455)]), 'UNBALANCED');
  });

  await t.test('rejects a zero-total voucher', () => {
    expectCode(() => validateLines([dr(0), cr(0)]), 'BAD_LINE_DIRECTION');
  });

  await t.test('rejects fewer than two legs', () => {
    expectCode(() => validateLines([dr(100)]), 'TOO_FEW_LEGS');
    expectCode(() => validateLines([]), 'TOO_FEW_LEGS');
    expectCode(() => validateLines(null), 'TOO_FEW_LEGS');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('line direction', async (t) => {
  await t.test('rejects both sides non-zero', () => {
    expectCode(
      () => validateLines([{ account: acc(), debit: 100, credit: 100 }, cr(100)]),
      'BAD_LINE_DIRECTION'
    );
  });

  await t.test('rejects both sides zero', () => {
    expectCode(
      () => validateLines([{ account: acc(), debit: 0, credit: 0 }, cr(100)]),
      'BAD_LINE_DIRECTION'
    );
  });

  await t.test('rejects a negative amount', () => {
    expectCode(() => validateLines([dr(-100), cr(-100)]), 'NEGATIVE_AMOUNT');
  });

  await t.test('rejects a missing account', () => {
    expectCode(
      () => validateLines([{ debit: 100, credit: 0 }, cr(100)]),
      'MISSING_ACCOUNT'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('money must be integer paise', async (t) => {
  await t.test('rejects float rupees', () => {
    expectCode(() => validateLines([dr(1234.56), cr(1234.56)]), 'NOT_INTEGER_PAISE');
  });

  await t.test('rejects a fractional paisa', () => {
    expectCode(() => validateLines([dr(100.5), cr(100.5)]), 'NOT_INTEGER_PAISE');
  });

  await t.test('rejects a string amount', () => {
    expectCode(() => validateLines([{ account: acc(), debit: '100', credit: 0 }, cr(100)]),
      'NOT_INTEGER_PAISE');
  });

  await t.test('converted SMS amounts pass', () => {
    // The float→paise conversion happens once, at ingest.
    const paise = money.toPaise(1234.56);
    const r = validateLines([dr(paise), cr(paise)]);
    assert.strictEqual(r.totalDebit, 123456);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('no floating-point drift across many legs', async (t) => {
  await t.test('300 legs of ₹0.10 sum exactly', () => {
    // 0.1 + 0.2 !== 0.3 in float. In integer paise it is exact, which is the
    // whole reason for the convention.
    const legs = [];
    for (let i = 0; i < 150; i++) legs.push(dr(10));
    for (let i = 0; i < 150; i++) legs.push(cr(10));
    const r = validateLines(legs);
    assert.strictEqual(r.totalDebit, 1500);
    assert.strictEqual(r.totalDebit, r.totalCredit);
  });

  await t.test('the same sum in float rupees would drift', () => {
    let f = 0;
    for (let i = 0; i < 150; i++) f += 0.1;
    assert.notStrictEqual(f, 15);          // demonstrates the hazard
    assert.ok(Math.abs(f - 15) < 1e-9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('realistic voucher shapes', async (t) => {
  await t.test('fee receipt: Dr cash, Cr tuition income', () => {
    const amt = money.toPaise(2500);
    const r = validateLines([dr(amt), cr(amt)]);
    assert.strictEqual(r.totalDebit, 250000);
  });

  await t.test('payroll: Dr gross, Cr net + pf + tds + loan + other', () => {
    const gross = money.toPaise(50000);
    const net = money.toPaise(42000);
    const pf = money.toPaise(3600);
    const tds = money.toPaise(2400);
    const loan = money.toPaise(1500);
    const other = money.toPaise(500);
    assert.strictEqual(net + pf + tds + loan + other, gross);
    const r = validateLines([dr(gross), cr(net), cr(pf), cr(tds), cr(loan), cr(other)]);
    assert.strictEqual(r.totalDebit, gross);
  });

  await t.test('a payroll slip that does not reconcile is rejected', () => {
    // SalarySlip computes gross/net in a controller with no schema guarantee
    // that they reconcile, so this check is load-bearing.
    const gross = money.toPaise(50000);
    const net = money.toPaise(42000);
    const pf = money.toPaise(3600);
    expectCode(() => validateLines([dr(gross), cr(net), cr(pf)]), 'UNBALANCED');
  });
});