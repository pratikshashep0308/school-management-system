// backend/fms/services/ingest/payrollMapping.test.js
//
//   node --test fms/services/ingest/payrollMapping.test.js
//
// The balance assertion here is the one §3.3 calls load-bearing: the SMS
// computes gross and net in a controller with no schema guarantee they
// reconcile, so this is the only thing standing between a bad slip and the
// books. Amounts are integer PAISE.

const test = require('node:test');
const assert = require('node:assert');
const m = require('./payrollMapping');

const R = (r) => r * 100;
const acct = (code, name) => ({ _id: `id-${code}`, accountCode: code, accountName: name });

const CHART = new Map([
  ['5101', acct('5101', 'Salary & Wages Expense')],
  ['2101', acct('2101', 'Salary Payable')],
  ['2102', acct('2102', 'PF Payable')],
  ['2103', acct('2103', 'TDS Payable')],
  ['2104', acct('2104', 'Staff Loan Recovery')],
  ['2109', acct('2109', 'Other Deductions Payable')],
]);

/** A slip that reconciles: 50,000 = 42,200 + 3,600 + 2,200 + 1,500 + 500 */
const goodSlip = (o = {}) => ({
  _id: 'slip-1', status: 'paid',
  grossSalary: 50000, netSalary: 42200,
  deductions: { pf: 3600, tax: 2200, loan: 1500, other: 500 },
  paymentDate: '2026-07-31', updatedAt: '2026-08-01',
  ...o,
});

// ─────────────────────────────────────────────────────────────────────────────
test('G1 — what cannot be sourced is NAMED, not silently dropped', async (t) => {
  await t.test('ESIC and Professional Tax are declared unsourced', () => {
    const codes = m.UNSOURCED_COMPONENTS.map((c) => c.code);
    assert.deepStrictEqual(codes.sort(), ['2105', '2106']);
  });

  await t.test('each says WHY it cannot be posted', () => {
    for (const c of m.UNSOURCED_COMPONENTS) {
      assert.match(c.reason, /SalarySlip has no/);
    }
  });

  await t.test('neither appears in the component map', () => {
    const mapped = Object.values(m.COMPONENT_CODES);
    assert.ok(!mapped.includes('2105'));
    assert.ok(!mapped.includes('2106'));
  });

  await t.test('and a built posting reports them every time', () => {
    const { amounts } = m.convertSlip(goodSlip());
    const built = m.buildLines(amounts, CHART, { partyName: 'A Teacher' });
    assert.strictEqual(built.componentsUnsourced.length, 2);
  });

  await t.test('LOAN is posted even though the brief did not list it', () => {
    // It exists in the source, so ignoring it would leave the slip unbalanced.
    const { amounts } = m.convertSlip(goodSlip());
    const built = m.buildLines(amounts, CHART, {});
    assert.ok(built.componentsPosted.includes('loan'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('the balance assertion', async (t) => {
  await t.test('a reconciling slip passes', () => {
    const { amounts } = m.convertSlip(goodSlip());
    const r = m.checkSlipBalance(amounts);
    assert.strictEqual(r.balanced, true);
    assert.strictEqual(r.difference, 0);
  });

  await t.test('a slip where gross exceeds the parts FAILS', () => {
    const { amounts } = m.convertSlip(goodSlip({ grossSalary: 51000 }));
    const r = m.checkSlipBalance(amounts);
    assert.strictEqual(r.balanced, false);
    assert.strictEqual(r.difference, R(1000));
    assert.match(r.reason, /off by/);
  });

  await t.test('and where it falls short', () => {
    const { amounts } = m.convertSlip(goodSlip({ grossSalary: 49000 }));
    assert.strictEqual(m.checkSlipBalance(amounts).difference, -R(1000));
  });

  await t.test('ONE PAISA OUT IS STILL OUT', () => {
    // Plugging a rupee would be inventing money. There is no tolerance here.
    const { amounts } = m.convertSlip(goodSlip({ netSalary: 42200.01 }));
    assert.strictEqual(m.checkSlipBalance(amounts).balanced, false);
  });

  await t.test('a slip with no deductions balances when gross equals net', () => {
    const { amounts } = m.convertSlip({
      grossSalary: 30000, netSalary: 30000, deductions: {},
    });
    assert.strictEqual(m.checkSlipBalance(amounts).balanced, true);
  });

  await t.test('missing deduction fields count as zero, not as invalid', () => {
    const { ok, amounts } = m.convertSlip({ grossSalary: 100, netSalary: 100 });
    assert.strictEqual(ok, true);
    assert.strictEqual(amounts.pf, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('money conversion', async (t) => {
  await t.test('ordinary amounts', () => {
    assert.strictEqual(m.toPaise(50000).paise, 5000000);
    assert.strictEqual(m.toPaise(1234.56).paise, 123456);
    assert.strictEqual(m.toPaise(0).paise, 0);
  });

  await t.test('absent values are zero, not an error', () => {
    for (const v of [null, undefined, '']) {
      const r = m.toPaise(v);
      assert.strictEqual(r.ok, true, String(v));
      assert.strictEqual(r.paise, 0);
    }
  });

  await t.test('float artefacts are tolerated', () => {
    assert.strictEqual(m.toPaise(1234.5600000000002).paise, 123456);
  });

  await t.test('a real sub-paisa amount is rejected', () => {
    assert.strictEqual(m.toPaise(12.345).ok, false);
  });

  await t.test('negatives and nonsense are rejected', () => {
    assert.strictEqual(m.toPaise(-100).ok, false);
    assert.strictEqual(m.toPaise('abc').ok, false);
  });

  await t.test('a bad field is named in the error', () => {
    const r = m.convertSlip(goodSlip({ deductions: { pf: 'oops', tax: 100 } }));
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.pf);
    assert.strictEqual(r.errors.tax, undefined);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('G4 — which date the posting belongs to', async (t) => {
  const now = new Date('2026-08-15');

  await t.test('a paid slip with a past paymentDate uses it', () => {
    const r = m.resolvePostingDate(goodSlip(), now);
    assert.strictEqual(r.chosen, 'paymentDate');
    assert.strictEqual(r.date.toISOString().slice(0, 10), '2026-07-31');
  });

  await t.test('AN UNPAID SLIP FALLS BACK to updatedAt', () => {
    // paymentDate defaults to Date.now at CREATION, so on an unpaid slip it
    // records when somebody opened the form, not when salary was paid.
    const r = m.resolvePostingDate(goodSlip({ status: 'pending' }), now);
    assert.strictEqual(r.chosen, 'updatedAt');
    assert.match(r.reason, /status is 'pending'/);
  });

  await t.test('a FUTURE paymentDate falls back too', () => {
    const r = m.resolvePostingDate(goodSlip({ paymentDate: '2027-01-01' }), now);
    assert.strictEqual(r.chosen, 'updatedAt');
    assert.match(r.reason, /future/);
  });

  await t.test('no paymentDate at all falls back', () => {
    const r = m.resolvePostingDate(goodSlip({ paymentDate: null }), now);
    assert.strictEqual(r.chosen, 'updatedAt');
    assert.match(r.reason, /no paymentDate/);
  });

  await t.test('BOTH DATES ARE RETURNED so the choice is auditable', () => {
    const r = m.resolvePostingDate(goodSlip({ status: 'pending' }), now);
    assert.ok(r.paymentDate);
    assert.ok(r.updatedAt);
  });

  await t.test('a slip with no usable date errors rather than guessing', () => {
    const r = m.resolvePostingDate({ status: 'paid' }, now);
    assert.strictEqual(r.date, null);
    assert.ok(r.error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('building the voucher lines', async (t) => {
  await t.test('one debit, one credit per non-zero deduction', () => {
    // gross (Dr) + net + pf + tax + loan + other (Cr) = 6
    const { amounts } = m.convertSlip(goodSlip());
    const built = m.buildLines(amounts, CHART, { partyName: 'A Teacher' });
    assert.strictEqual(built.ok, true);
    assert.strictEqual(built.lines.length, 6);
    assert.deepStrictEqual(built.componentsPosted,
      ['gross', 'net', 'pf', 'tax', 'loan', 'other']);
  });

  await t.test('the lines balance', () => {
    const { amounts } = m.convertSlip(goodSlip());
    const { lines } = m.buildLines(amounts, CHART, {});
    const dr = lines.reduce((s, l) => s + l.debit, 0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);
    assert.strictEqual(dr, cr);
    assert.strictEqual(dr, R(50000));
  });

  await t.test('ZERO COMPONENTS ARE OMITTED, not posted as zero lines', () => {
    const { amounts } = m.convertSlip({
      grossSalary: 30000, netSalary: 28000,
      deductions: { pf: 2000, tax: 0, loan: 0, other: 0 },
    });
    const built = m.buildLines(amounts, CHART, {});
    assert.deepStrictEqual(built.componentsPosted, ['gross', 'net', 'pf']);
    assert.strictEqual(built.lines.length, 3);
  });

  await t.test('gross is the only debit', () => {
    const { amounts } = m.convertSlip(goodSlip());
    const { lines } = m.buildLines(amounts, CHART, {});
    assert.strictEqual(lines.filter((l) => l.debit > 0).length, 1);
    assert.strictEqual(lines[0].debit, R(50000));
  });

  await t.test('the teacher is named on every line', () => {
    const { amounts } = m.convertSlip(goodSlip());
    const { lines } = m.buildLines(amounts, CHART, { partyName: 'R. Sharma' });
    assert.ok(lines.every((l) => l.partyName === 'R. Sharma' && l.partyType === 'teacher'));
  });

  await t.test('A MISSING ACCOUNT IS NAMED, not silently skipped', () => {
    const thin = new Map([['5101', acct('5101', 'Salary')]]);
    const { amounts } = m.convertSlip(goodSlip());
    const built = m.buildLines(amounts, thin, {});
    assert.strictEqual(built.ok, false);
    assert.ok(built.missing.includes('2101'));
    assert.match(built.error, /missing from the Chart of Accounts/);
  });

  await t.test('each component goes to its specified head', () => {
    const { amounts } = m.convertSlip(goodSlip());
    const { lines } = m.buildLines(amounts, CHART, {});
    const byAccount = Object.fromEntries(lines.map((l) => [l.account, l.debit || -l.credit]));
    assert.strictEqual(byAccount['id-5101'], R(50000));
    assert.strictEqual(byAccount['id-2101'], -R(42200));
    assert.strictEqual(byAccount['id-2102'], -R(3600));
    assert.strictEqual(byAccount['id-2103'], -R(2200));
    assert.strictEqual(byAccount['id-2104'], -R(1500));
    assert.strictEqual(byAccount['id-2109'], -R(500));
  });
});