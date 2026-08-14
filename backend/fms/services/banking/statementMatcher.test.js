// backend/fms/services/banking/statementMatcher.test.js
//
//   node --test fms/services/banking/statementMatcher.test.js
//
// Amounts are integer PAISE throughout.

const test = require('node:test');
const assert = require('node:assert');
const m = require('./statementMatcher');

const R = (r) => r * 100;
const D = (s) => new Date(`${s}T00:00:00.000Z`);

// ─────────────────────────────────────────────────────────────────────────────
test('parsing amounts', async (t) => {
  const cases = [
    ['1234.56', 123456], ['1,234.56', 123456], ['₹1,234.56', 123456],
    ['1234.56 Cr', 123456], ['1234.56 DR', 123456],
    ['(1,234.56)', -123456], ['-1234.56', -123456],
    ['0.01', 1], ['1000', 100000], [' 500.00 ', 50000],
  ];
  for (const [input, expected] of cases) {
    await t.test(`'${input}' → ${expected}`, () => {
      assert.strictEqual(m.parseAmount(input), expected);
    });
  }

  await t.test('unreadable values return null rather than a guess', () => {
    for (const bad of ['', '-', '—', 'N/A', 'abc', null, undefined, '.']) {
      assert.strictEqual(m.parseAmount(bad), null, JSON.stringify(bad));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('parsing dates', async (t) => {
  await t.test('dd/mm/yyyy is read as Indian convention', () => {
    const d = m.parseDate('05/07/2026');
    assert.strictEqual(d.getUTCDate(), 5);
    assert.strictEqual(d.getUTCMonth(), 6);   // July
  });

  await t.test('the other common formats', () => {
    assert.strictEqual(m.parseDate('2026-07-05').getUTCDate(), 5);
    assert.strictEqual(m.parseDate('05-07-2026').getUTCMonth(), 6);
    assert.strictEqual(m.parseDate('05-Jul-2026').getUTCMonth(), 6);
    assert.strictEqual(m.parseDate('5/7/26').getUTCFullYear(), 2026);
  });

  await t.test('nonsense returns null', () => {
    assert.strictEqual(m.parseDate(''), null);
    assert.strictEqual(m.parseDate('not a date'), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('parsing a statement', async (t) => {
  const csv = [
    'Txn Date,Description,Chq/Ref No,Withdrawal,Deposit,Balance',
    '05/07/2026,"NEFT CR-SHARMA STATIONERS",NEFT001,,25000.00,125000.00',
    '06/07/2026,"CHQ PAID 004521",004521,12500.00,,112500.00',
    '07/07/2026,"BANK CHARGES",,118.00,,112382.00',
  ].join('\n');

  const mapping = {
    date: 'Txn Date', narration: 'Description', reference: 'Chq/Ref No',
    debit: 'Withdrawal', credit: 'Deposit', balance: 'Balance',
  };

  await t.test('three rows parse', () => {
    const r = m.parseStatement(csv, mapping);
    assert.strictEqual(r.rows.length, 3);
    assert.strictEqual(r.errors.length, 0);
  });

  await t.test('direction is taken from which column is filled', () => {
    const r = m.parseStatement(csv, mapping);
    assert.strictEqual(r.rows[0].statementDirection, 'credit');
    assert.strictEqual(r.rows[1].statementDirection, 'debit');
  });

  await t.test('amounts convert to paise', () => {
    const r = m.parseStatement(csv, mapping);
    assert.strictEqual(r.rows[0].amount, R(25000));
    assert.strictEqual(r.rows[2].amount, 11800);
  });

  await t.test('quoted fields containing commas survive', () => {
    const withComma = [
      'Date,Narration,Amount',
      '05/07/2026,"PAYMENT TO SHARMA, MUMBAI",-1234.56',
    ].join('\n');
    const r = m.parseStatement(withComma, { date: 'Date', narration: 'Narration', amount: 'Amount' });
    assert.strictEqual(r.rows.length, 1);
    assert.strictEqual(r.rows[0].narration, 'PAYMENT TO SHARMA, MUMBAI');
  });

  await t.test('a single signed amount column works', () => {
    const signed = [
      'Date,Narration,Amount',
      '05/07/2026,Deposit,25000.00',
      '06/07/2026,Withdrawal,-12500.00',
    ].join('\n');
    const r = m.parseStatement(signed, { date: 'Date', narration: 'Narration', amount: 'Amount' });
    assert.strictEqual(r.rows[0].statementDirection, 'credit');
    assert.strictEqual(r.rows[1].statementDirection, 'debit');
    assert.strictEqual(r.rows[1].amount, R(12500));
  });

  await t.test('bad rows are REPORTED, not silently dropped', () => {
    const messy = [
      'Date,Narration,Deposit,Withdrawal',
      '05/07/2026,Good,25000.00,',
      'not-a-date,Bad date,100.00,',
      '06/07/2026,No amount,,',
      '07/07/2026,Both columns,100.00,200.00',
    ].join('\n');
    const r = m.parseStatement(messy, { date: 'Date', narration: 'Narration', credit: 'Deposit', debit: 'Withdrawal' });
    assert.strictEqual(r.rows.length, 1);
    assert.strictEqual(r.errors.length, 3);
    assert.ok(r.errors.every((e) => e.line && e.reason));
  });

  await t.test('a missing column is reported clearly', () => {
    const r = m.parseStatement('A,B\n1,2', { date: 'Txn Date' });
    assert.strictEqual(r.rows.length, 0);
    assert.match(r.errors[0].reason, /No date column/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test("the bank's perspective is the mirror of ours", async (t) => {
  await t.test('a statement CREDIT is our ledger DEBIT', () => {
    assert.strictEqual(m.ledgerDirectionOf('credit'), 'debit');
  });
  await t.test('a statement DEBIT is our ledger CREDIT', () => {
    assert.strictEqual(m.ledgerDirectionOf('debit'), 'credit');
  });

  await t.test('a deposit NEVER matches a withdrawal of the same amount', () => {
    const deposit = { lineNumber: 1, valueDate: D('2026-07-05'), amount: R(5000), statementDirection: 'credit', narration: '' };
    const weSpent = { _id: 'e1', entryDate: D('2026-07-05'), debit: 0, credit: R(5000), narration: '' };
    const r = m.scoreMatch(deposit, weSpent);
    assert.strictEqual(r.confidence, m.CONFIDENCE.NONE);
    assert.match(r.reason, /Opposite direction/);
  });

  await t.test('but it does match the deposit we recorded', () => {
    const deposit = { lineNumber: 1, valueDate: D('2026-07-05'), amount: R(5000), statementDirection: 'credit', narration: '' };
    const weReceived = { _id: 'e1', entryDate: D('2026-07-05'), debit: R(5000), credit: 0, narration: '' };
    assert.notStrictEqual(m.scoreMatch(deposit, weReceived).confidence, m.CONFIDENCE.NONE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('confidence levels', async (t) => {
  const line = (o = {}) => ({
    lineNumber: 1, valueDate: D('2026-07-05'), amount: R(12500),
    statementDirection: 'debit', narration: 'CHQ PAID 004521', reference: '004521', ...o,
  });
  const entry = (o = {}) => ({
    _id: 'e1', entryDate: D('2026-07-05'), debit: 0, credit: R(12500),
    narration: 'Cheque 004521 to Sharma', voucherNumber: 'PMT-2026-27-00001', ...o,
  });

  await t.test('same day plus a matching reference is EXACT', () => {
    assert.strictEqual(m.scoreMatch(line(), entry()).confidence, m.CONFIDENCE.EXACT);
  });

  await t.test('a matching reference days apart is STRONG', () => {
    const r = m.scoreMatch(line(), entry({ entryDate: D('2026-07-02') }));
    assert.strictEqual(r.confidence, m.CONFIDENCE.STRONG);
    assert.strictEqual(r.daysApart, 3);
  });

  await t.test('no reference but the same day is PROBABLE', () => {
    const r = m.scoreMatch(line({ narration: 'CHEQUE', reference: '' }), entry({ narration: 'Payment' }));
    assert.strictEqual(r.confidence, m.CONFIDENCE.PROBABLE);
  });

  await t.test('beyond the date tolerance is WEAK', () => {
    const r = m.scoreMatch(line({ narration: 'X', reference: '' }),
      entry({ entryDate: D('2026-06-01'), narration: 'Y', voucherNumber: '' }));
    assert.strictEqual(r.confidence, m.CONFIDENCE.WEAK);
  });

  await t.test('a differing amount is no match at all', () => {
    assert.strictEqual(m.scoreMatch(line(), entry({ credit: R(12501) })).confidence, m.CONFIDENCE.NONE);
  });

  await t.test('only EXACT and STRONG are applied automatically', () => {
    assert.deepStrictEqual(m.AUTO_MATCH_AT, [m.CONFIDENCE.EXACT, m.CONFIDENCE.STRONG]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('reference extraction', async (t) => {
  await t.test('cheque numbers', () => {
    assert.ok(m.extractReferences('CHQ PAID 004521').includes('004521'));
  });
  await t.test('our own voucher numbers', () => {
    assert.ok(m.extractReferences('Ref PMT-2026-27-00001').includes('PMT-2026-27-00001'));
  });
  await t.test('UTR references', () => {
    assert.ok(m.extractReferences('NEFT SBIN123456789012').includes('SBIN123456789012'));
  });
  await t.test('overlap is detected across free text', () => {
    assert.strictEqual(m.referencesOverlap('CHQ 004521 PAID', 'Cheque no 004521 issued'), true);
    assert.strictEqual(m.referencesOverlap('CHQ 004521', 'CHQ 004522'), false);
  });
  await t.test('no references means no false positive', () => {
    assert.strictEqual(m.referencesOverlap('CASH DEPOSIT', 'CASH DEPOSIT'), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('matching a whole statement', async (t) => {
  const lines = [
    { lineNumber: 1, valueDate: D('2026-07-05'), amount: R(25000), statementDirection: 'credit', narration: 'NEFT CR', reference: 'NEFT001' },
    { lineNumber: 2, valueDate: D('2026-07-06'), amount: R(12500), statementDirection: 'debit', narration: 'CHQ 004521', reference: '004521' },
    { lineNumber: 3, valueDate: D('2026-07-07'), amount: 11800, statementDirection: 'debit', narration: 'BANK CHARGES', reference: '' },
  ];
  const entries = [
    { _id: 'a', entryDate: D('2026-07-05'), debit: R(25000), credit: 0, narration: 'Fee received NEFT001' },
    { _id: 'b', entryDate: D('2026-07-06'), debit: 0, credit: R(12500), narration: 'Cheque 004521' },
    { _id: 'c', entryDate: D('2026-07-01'), debit: 0, credit: R(9000), narration: 'Cheque 004520 not yet presented' },
  ];

  await t.test('two lines auto-match', () => {
    const r = m.matchStatement(lines, entries);
    assert.strictEqual(r.autoMatchedCount, 2);
  });

  await t.test('the bank charge has no ledger entry and SURFACES', () => {
    const r = m.matchStatement(lines, entries);
    assert.strictEqual(r.unmatchedCount, 1);
    assert.strictEqual(r.results[2].matched, false);
  });

  await t.test('the unpresented cheque surfaces as an outstanding entry', () => {
    const r = m.matchStatement(lines, entries);
    assert.strictEqual(r.unmatchedEntries.length, 1);
    assert.strictEqual(r.unmatchedEntries[0]._id, 'c');
  });

  await t.test('ONE ledger entry cannot satisfy TWO statement lines', () => {
    // Two identical ₹5,000 withdrawals on the statement, but only one posting.
    const dup = [
      { lineNumber: 1, valueDate: D('2026-07-05'), amount: R(5000), statementDirection: 'debit', narration: 'X', reference: '' },
      { lineNumber: 2, valueDate: D('2026-07-05'), amount: R(5000), statementDirection: 'debit', narration: 'X', reference: '' },
    ];
    const one = [{ _id: 'z', entryDate: D('2026-07-05'), debit: 0, credit: R(5000), narration: 'X' }];
    const r = m.matchStatement(dup, one);
    assert.strictEqual(r.results.filter((x) => x.matched).length, 1);
    assert.strictEqual(r.unmatchedCount, 1);
  });

  await t.test('a confident match wins the entry over a speculative one', () => {
    const competing = [
      { lineNumber: 1, valueDate: D('2026-07-01'), amount: R(5000), statementDirection: 'debit', narration: 'nothing', reference: '' },
      { lineNumber: 2, valueDate: D('2026-07-05'), amount: R(5000), statementDirection: 'debit', narration: 'CHQ 004521', reference: '004521' },
    ];
    const one = [{ _id: 'z', entryDate: D('2026-07-05'), debit: 0, credit: R(5000), narration: 'Cheque 004521' }];
    const r = m.matchStatement(competing, one);
    assert.strictEqual(r.results[1].matched, true, 'the referenced line should win');
    assert.strictEqual(r.results[0].matched, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('the reconciliation statement', async (t) => {
  // The standard form:
  //   bank balance
  //   LESS unpresented cheques  — the bank still shows money already spent
  //   PLUS deposits in transit  — recorded by us, not yet on the statement
  //   = what the books should say
  //
  // These assertions previously encoded the signs the other way round, which
  // agreed with the implementation and with nothing else. Both were wrong, and
  // both reconciled only when the adjustments happened to be zero.

  await t.test('timing differences explain the gap', () => {
    // Bank says ₹1,00,000. We have issued a ₹12,500 cheque not yet presented
    // and banked ₹5,000 not yet credited.
    //   100,000 − 12,500 + 5,000 = 92,500
    const r = m.reconciliationStatement({
      bankClosingBalance: R(100000),
      bookBalance: R(92500),
      unmatchedEntries: [
        { _id: 'a', debit: 0, credit: R(12500) },
        { _id: 'b', debit: R(5000), credit: 0 },
      ],
    });
    assert.strictEqual(r.unpresentedCheques, R(12500));
    assert.strictEqual(r.depositsInTransit, R(5000));
    assert.strictEqual(r.adjustedBankBalance, R(92500));
    assert.strictEqual(r.difference, 0);
    assert.strictEqual(r.reconciled, true);
  });

  await t.test('AN UNPRESENTED CHEQUE REDUCES the adjusted bank balance', () => {
    // The single most important sign in the whole module. The bank has not yet
    // paid the cheque, so its balance is HIGHER than the books by that amount.
    const r = m.reconciliationStatement({
      bankClosingBalance: R(100000),
      bookBalance: R(90000),
      unmatchedEntries: [{ _id: 'a', debit: 0, credit: R(10000) }],
    });
    assert.strictEqual(r.adjustedBankBalance, R(90000));
    assert.strictEqual(r.reconciled, true);
  });

  await t.test('A DEPOSIT IN TRANSIT INCREASES it', () => {
    // We have banked the money; the statement does not show it yet, so the
    // bank's balance is LOWER than the books.
    const r = m.reconciliationStatement({
      bankClosingBalance: R(100000),
      bookBalance: R(105000),
      unmatchedEntries: [{ _id: 'b', debit: R(5000), credit: 0 }],
    });
    assert.strictEqual(r.adjustedBankBalance, R(105000));
    assert.strictEqual(r.reconciled, true);
  });

  await t.test('an unexplained difference does NOT reconcile', () => {
    const r = m.reconciliationStatement({
      bankClosingBalance: R(100000),
      bookBalance: R(107500),
      unmatchedEntries: [
        { _id: 'a', debit: 0, credit: R(12500) },
        { _id: 'b', debit: R(5000), credit: 0 },
      ],
    });
    assert.strictEqual(r.adjustedBankBalance, R(92500));
    assert.strictEqual(r.difference, R(-15000));
    assert.strictEqual(r.reconciled, false);
    assert.match(r.explanation, /Unexplained difference/);
  });

  await t.test('with nothing outstanding the balances must simply agree', () => {
    assert.strictEqual(
      m.reconciliationStatement({ bankClosingBalance: R(50000), bookBalance: R(50000) }).reconciled,
      true
    );
    assert.strictEqual(
      m.reconciliationStatement({ bankClosingBalance: R(50000), bookBalance: R(50001) }).reconciled,
      false
    );
  });
});