// backend/fms/services/purchase/threeWayMatch.test.js
//
//   node --test fms/services/purchase/threeWayMatch.test.js
//
// This is the control that stops the school paying for goods it never received.
// Pure logic, so every case is tested directly. Amounts are integer PAISE.

const test = require('node:test');
const assert = require('node:assert');
const m = require('./threeWayMatch');

const R = (rupees) => rupees * 100;

const poItem = (o = {}) => ({
  itemId: 'i1', description: 'A4 Paper (ream)',
  quantity: 10, rate: R(250), amount: R(2500), ...o,
});
const invItem = (o = {}) => ({ itemId: 'i1', quantity: 10, rate: R(250), amount: R(2500), ...o });
const got = (qty) => ({ acceptedQty: qty });

const types = (r) => r.discrepancies.map((d) => d.type);

// ─────────────────────────────────────────────────────────────────────────────
test('a clean match', async (t) => {
  await t.test('ordered 10, received 10, invoiced 10 at the agreed rate', () => {
    const r = m.matchLine(poItem(), got(10), invItem());
    assert.strictEqual(r.matched, true);
    assert.deepStrictEqual(r.discrepancies, []);
  });

  await t.test('a full invoice matches', () => {
    const r = m.matchInvoice([poItem()], { i1: got(10) }, [invItem()]);
    assert.strictEqual(r.matched, true);
    assert.strictEqual(r.canVerify, true);
    assert.strictEqual(r.blockingCount, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('being billed for more than arrived — the case that matters', async (t) => {
  await t.test('invoiced 10, received 8 → BLOCKING', () => {
    const r = m.matchLine(poItem(), got(8), invItem());
    assert.ok(types(r).includes(m.DISCREPANCY.OVER_INVOICED_VS_RECEIVED));
    assert.strictEqual(r.matched, false);
  });

  await t.test('the excess is reported', () => {
    const r = m.matchLine(poItem(), got(8), invItem());
    const d = r.discrepancies.find((x) => x.type === m.DISCREPANCY.OVER_INVOICED_VS_RECEIVED);
    assert.strictEqual(d.excess, 2);
    assert.strictEqual(d.severity, 'blocking');
  });

  await t.test('invoiced with nothing received at all → BLOCKING', () => {
    const r = m.matchLine(poItem(), got(0), invItem());
    assert.ok(types(r).includes(m.DISCREPANCY.NOT_RECEIVED));
    assert.strictEqual(r.matched, false);
  });

  await t.test('one unit over is still caught', () => {
    const r = m.matchLine(poItem(), got(9), invItem({ quantity: 10 }));
    assert.strictEqual(r.matched, false);
  });

  await t.test('invoicing exactly what arrived is fine', () => {
    const r = m.matchLine(poItem(), got(8), invItem({ quantity: 8, amount: R(2000) }));
    assert.strictEqual(r.matched, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('billed for more than ordered', async (t) => {
  await t.test('invoiced 12 against an order for 10 → BLOCKING', () => {
    const r = m.matchLine(poItem(), got(12), invItem({ quantity: 12, amount: R(3000) }));
    assert.ok(types(r).includes(m.DISCREPANCY.OVER_INVOICED_VS_ORDERED));
    assert.strictEqual(r.matched, false);
  });

  await t.test('the over-receipt is flagged too, as a warning', () => {
    const r = m.matchLine(poItem(), got(12), invItem({ quantity: 12, amount: R(3000) }));
    const over = r.discrepancies.find((d) => d.type === m.DISCREPANCY.OVER_RECEIPT);
    assert.strictEqual(over.severity, 'warning');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('rate changes', async (t) => {
  await t.test('a higher rate than agreed → BLOCKING', () => {
    const r = m.matchLine(poItem(), got(10), invItem({ rate: R(275), amount: R(2750) }));
    assert.ok(types(r).includes(m.DISCREPANCY.RATE_MISMATCH));
    assert.strictEqual(r.matched, false);
  });

  await t.test('a LOWER rate is also flagged — a silent change is still a change', () => {
    const r = m.matchLine(poItem(), got(10), invItem({ rate: R(225), amount: R(2250) }));
    assert.ok(types(r).includes(m.DISCREPANCY.RATE_MISMATCH));
  });

  await t.test('the difference is reported in paise', () => {
    const r = m.matchLine(poItem(), got(10), invItem({ rate: R(275), amount: R(2750) }));
    const d = r.discrepancies.find((x) => x.type === m.DISCREPANCY.RATE_MISMATCH);
    assert.strictEqual(d.differencePaise, R(25));
  });

  await t.test('a rate tolerance can be allowed explicitly', () => {
    // 1% tolerance: ₹250 → ₹252.50 is within, ₹255 is not.
    const within = m.matchLine(poItem(), got(10), invItem({ rate: 25250, amount: 252500 }),
      { rateBps: 100, amountPaise: 100 });
    assert.ok(!types(within).includes(m.DISCREPANCY.RATE_MISMATCH));

    const beyond = m.matchLine(poItem(), got(10), invItem({ rate: 25500, amount: 255000 }),
      { rateBps: 100, amountPaise: 100 });
    assert.ok(types(beyond).includes(m.DISCREPANCY.RATE_MISMATCH));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test("the invoice's own arithmetic", async (t) => {
  await t.test('a line amount that does not equal qty × rate → BLOCKING', () => {
    const r = m.matchLine(poItem(), got(10), invItem({ amount: R(2600) }));
    assert.ok(types(r).includes(m.DISCREPANCY.AMOUNT_MISMATCH));
    assert.strictEqual(r.matched, false);
  });

  await t.test('the computed value is shown alongside the stated one', () => {
    const r = m.matchLine(poItem(), got(10), invItem({ amount: R(2600) }));
    const d = r.discrepancies.find((x) => x.type === m.DISCREPANCY.AMOUNT_MISMATCH);
    assert.strictEqual(d.stated, R(2600));
    assert.strictEqual(d.computed, R(2500));
    assert.strictEqual(d.differencePaise, R(100));
  });

  await t.test('rounding within a rupee is tolerated', () => {
    // 3 × ₹33.33 = ₹99.99; billed as ₹100.00.
    const po = poItem({ quantity: 3, rate: 3333, amount: 9999 });
    const r = m.matchLine(po, got(3), { itemId: 'i1', quantity: 3, rate: 3333, amount: 10000 });
    assert.ok(!types(r).includes(m.DISCREPANCY.AMOUNT_MISMATCH));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('partial delivery is normal, not an error', async (t) => {
  await t.test('short receipt is a WARNING, not blocking', () => {
    const r = m.matchLine(poItem(), got(6), invItem({ quantity: 6, amount: R(1500) }));
    assert.strictEqual(r.matched, true);
    const d = r.discrepancies.find((x) => x.type === m.DISCREPANCY.SHORT_RECEIPT);
    assert.strictEqual(d.severity, 'warning');
    assert.strictEqual(d.shortfall, 4);
  });

  await t.test('so a partial invoice can still be verified', () => {
    const r = m.matchInvoice([poItem()], { i1: got(6) },
      [invItem({ quantity: 6, amount: R(1500) })]);
    assert.strictEqual(r.canVerify, true);
    assert.strictEqual(r.warningCount, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('a line that was never ordered', async (t) => {
  await t.test('is blocking', () => {
    const r = m.matchInvoice([poItem()], { i1: got(10) },
      [invItem(), { itemId: 'sneaky', quantity: 1, rate: R(9999), amount: R(9999) }]);
    assert.strictEqual(r.matched, false);
    assert.ok(r.blocking.some((d) => d.type === m.DISCREPANCY.NOT_ORDERED));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('multi-line invoices', async (t) => {
  const po = [
    poItem({ itemId: 'a', description: 'Paper', quantity: 10, rate: R(250), amount: R(2500) }),
    poItem({ itemId: 'b', description: 'Toner', quantity: 2, rate: R(3000), amount: R(6000) }),
  ];

  await t.test('all lines clean → matched', () => {
    const r = m.matchInvoice(po, { a: got(10), b: got(2) }, [
      { itemId: 'a', quantity: 10, rate: R(250), amount: R(2500) },
      { itemId: 'b', quantity: 2, rate: R(3000), amount: R(6000) },
    ]);
    assert.strictEqual(r.matched, true);
    assert.strictEqual(r.lineCount, 2);
  });

  await t.test('one bad line blocks the whole invoice', () => {
    const r = m.matchInvoice(po, { a: got(10), b: got(1) }, [
      { itemId: 'a', quantity: 10, rate: R(250), amount: R(2500) },
      { itemId: 'b', quantity: 2, rate: R(3000), amount: R(6000) },   // only 1 received
    ]);
    assert.strictEqual(r.matched, false);
    assert.strictEqual(r.blockingCount, 1);
    assert.strictEqual(r.lines[0].matched, true);
    assert.strictEqual(r.lines[1].matched, false);
  });

  await t.test('the line total is computed', () => {
    const r = m.matchInvoice(po, { a: got(10), b: got(2) }, [
      { itemId: 'a', quantity: 10, rate: R(250), amount: R(2500) },
      { itemId: 'b', quantity: 2, rate: R(3000), amount: R(6000) },
    ]);
    assert.strictEqual(r.invoiceLineTotal, R(8500));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('accumulating across documents', async (t) => {
  await t.test('receipts add up across several GRNs', () => {
    const acc = m.accumulateReceipts([
      { items: [{ poItemId: 'a', receivedQty: 6, acceptedQty: 5, rejectedQty: 1 }] },
      { items: [{ poItemId: 'a', receivedQty: 4, acceptedQty: 4, rejectedQty: 0 }] },
    ]);
    assert.strictEqual(acc.a.acceptedQty, 9);
    assert.strictEqual(acc.a.receivedQty, 10);
    assert.strictEqual(acc.a.rejectedQty, 1);
    assert.strictEqual(acc.a.grnCount, 2);
  });

  await t.test('REJECTED goods do not count as accepted', () => {
    // The distinction that matters: 10 arrived, 1 was faulty, so 9 are payable.
    const acc = m.accumulateReceipts([
      { items: [{ poItemId: 'a', receivedQty: 10, acceptedQty: 9, rejectedQty: 1 }] },
    ]);
    const r = m.matchLine(poItem(), acc.a, invItem({ quantity: 10 }));
    assert.strictEqual(r.matched, false, 'invoicing for the rejected unit must be caught');
  });

  await t.test('invoiced quantities add up across bills', () => {
    const acc = m.accumulateInvoiced([
      { items: [{ itemId: 'a', quantity: 6, amount: R(1500) }] },
      { items: [{ itemId: 'a', quantity: 4, amount: R(1000) }] },
    ]);
    assert.strictEqual(acc.a.quantity, 10);
    assert.strictEqual(acc.a.amount, R(2500));
  });

  await t.test('cancelled invoices are excluded', () => {
    const acc = m.accumulateInvoiced([
      { invoiceStatus: 'verified', items: [{ itemId: 'a', quantity: 6, amount: R(1500) }] },
      { invoiceStatus: 'cancelled', items: [{ itemId: 'a', quantity: 4, amount: R(1000) }] },
    ]);
    assert.strictEqual(acc.a.quantity, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('every discrepancy has a severity', async (t) => {
  await t.test('no type is left unclassified', () => {
    for (const type of Object.values(m.DISCREPANCY)) {
      assert.ok(['blocking', 'warning'].includes(m.SEVERITY[type]), type);
    }
  });

  await t.test('only receipt-quantity differences are warnings', () => {
    const warnings = Object.entries(m.SEVERITY)
      .filter(([, s]) => s === 'warning').map(([t2]) => t2).sort();
    assert.deepStrictEqual(warnings, ['OVER_RECEIPT', 'SHORT_RECEIPT']);
  });
});