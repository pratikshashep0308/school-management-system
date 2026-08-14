// backend/fms/services/approval/approvalMatrix.test.js
//
// Threshold routing tests. SRS M5 / BPMN WF1.
//
//   node --test fms/services/approval/approvalMatrix.test.js
//
// The playbook names these the critical tests for the whole project, and
// specifies the boundary values explicitly:
//     10000 / 10001 / 50000 / 50001 / 200000 / 200001
//
// Written before the workflow service, against the brief rather than against
// the implementation. Every value below is in PAISE, so ₹10,000 is 1000000.

const test = require('node:test');
const assert = require('node:assert');

const m = require('./approvalMatrix');

const rupees = (r) => r * 100;

// ─────────────────────────────────────────────────────────────────────────────
test('threshold routing at the exact boundaries', async (t) => {
  // The brief:
  //   ≤10k Dept Head
  //   10,001–50,000 Principal
  //   50,001–200,000 Principal + Chairman
  //   >200,000 Principal + Chairman + Trustee

  await t.test('₹9,999 → Dept Head', () => {
    assert.deepStrictEqual(m.tierFor(rupees(9999)).approvers, ['deptHead']);
  });

  await t.test('₹10,000 exactly → Dept Head (inclusive upper bound)', () => {
    assert.deepStrictEqual(m.tierFor(rupees(10000)).approvers, ['deptHead']);
    assert.strictEqual(m.tierFor(rupees(10000)).tier, 1);
  });

  await t.test('₹10,000.01 → Principal (one paisa over)', () => {
    assert.deepStrictEqual(m.tierFor(rupees(10000) + 1).approvers, ['principal']);
  });

  await t.test('₹10,001 → Principal', () => {
    assert.deepStrictEqual(m.tierFor(rupees(10001)).approvers, ['principal']);
    assert.strictEqual(m.tierFor(rupees(10001)).tier, 2);
  });

  await t.test('₹50,000 exactly → Principal', () => {
    assert.deepStrictEqual(m.tierFor(rupees(50000)).approvers, ['principal']);
  });

  await t.test('₹50,001 → Principal + Chairman', () => {
    assert.deepStrictEqual(m.tierFor(rupees(50001)).approvers, ['principal', 'chairman']);
    assert.strictEqual(m.tierFor(rupees(50001)).tier, 3);
  });

  await t.test('₹2,00,000 exactly → Principal + Chairman', () => {
    assert.deepStrictEqual(m.tierFor(rupees(200000)).approvers, ['principal', 'chairman']);
  });

  await t.test('₹2,00,001 → Principal + Chairman + Trustee', () => {
    assert.deepStrictEqual(m.tierFor(rupees(200001)).approvers,
      ['principal', 'chairman', 'trustee']);
    assert.strictEqual(m.tierFor(rupees(200001)).tier, 4);
  });

  await t.test('the playbook verification amounts land correctly', () => {
    assert.deepStrictEqual(m.tierFor(rupees(9000)).approvers, ['deptHead']);
    assert.deepStrictEqual(m.tierFor(rupees(40000)).approvers, ['principal']);
    assert.deepStrictEqual(m.tierFor(rupees(150000)).approvers, ['principal', 'chairman']);
    assert.deepStrictEqual(m.tierFor(rupees(300000)).approvers,
      ['principal', 'chairman', 'trustee']);
  });

  await t.test('₹0 and ₹0.01 route to tier 1', () => {
    assert.strictEqual(m.tierFor(0).tier, 1);
    assert.strictEqual(m.tierFor(1).tier, 1);
  });

  await t.test('a very large amount routes to tier 4, not an error', () => {
    assert.strictEqual(m.tierFor(rupees(100000000)).tier, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('amounts must be integer paise', async (t) => {
  await t.test('float rejected', () => {
    assert.throws(() => m.tierFor(10000.5), /integer/);
  });
  await t.test('negative rejected', () => {
    assert.throws(() => m.tierFor(-1), /non-negative/);
  });
  await t.test('string rejected', () => {
    assert.throws(() => m.tierFor('10000'), /integer/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('the chain always starts with accounts and ends at paymentPending', async (t) => {
  await t.test('tier 1: accounts → deptHead', () => {
    const c = m.chainFor(rupees(9000));
    assert.deepStrictEqual(c.map((s) => s.step), ['accounts', 'deptHead']);
    assert.strictEqual(c[0].fromStatus, 'submitted');
    assert.strictEqual(c[0].toStatus, 'accountsVerified');
    assert.strictEqual(c[1].toStatus, 'paymentPending');
  });

  await t.test('tier 2: accounts → principal', () => {
    const c = m.chainFor(rupees(40000));
    assert.deepStrictEqual(c.map((s) => s.step), ['accounts', 'principal']);
    assert.strictEqual(c[1].toStatus, 'paymentPending');
  });

  await t.test('tier 3: accounts → principal → chairman', () => {
    const c = m.chainFor(rupees(150000));
    assert.deepStrictEqual(c.map((s) => s.step), ['accounts', 'principal', 'chairman']);
    assert.strictEqual(c[1].toStatus, 'principalApproved');
    assert.strictEqual(c[2].toStatus, 'paymentPending');
  });

  await t.test('tier 4: accounts → principal → chairman → trustee', () => {
    const c = m.chainFor(rupees(300000));
    assert.deepStrictEqual(c.map((s) => s.step),
      ['accounts', 'principal', 'chairman', 'trustee']);
    assert.strictEqual(c[2].toStatus, 'chairmanApproved');
    assert.strictEqual(c[3].toStatus, 'paymentPending');
  });

  await t.test('every chain begins at submitted and ends at paymentPending', () => {
    for (const amt of [0, rupees(9999), rupees(10001), rupees(50001), rupees(200001), rupees(999999)]) {
      const c = m.chainFor(amt);
      assert.strictEqual(c[0].fromStatus, 'submitted', `amount ${amt}`);
      assert.strictEqual(c[c.length - 1].toStatus, 'paymentPending', `amount ${amt}`);
      assert.strictEqual(c[0].step, 'accounts', `amount ${amt}`);
    }
  });

  await t.test('each step continues from the previous one', () => {
    for (const amt of [rupees(9000), rupees(40000), rupees(150000), rupees(300000)]) {
      const c = m.chainFor(amt);
      for (let i = 1; i < c.length; i++) {
        assert.strictEqual(c[i].fromStatus, c[i - 1].toStatus,
          `amount ${amt}, step ${c[i].step}: from ${c[i].fromStatus} but previous ended at ${c[i - 1].toStatus}`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('no state skipping', async (t) => {
  const amt = rupees(150000);   // tier 3: accounts → principal → chairman

  await t.test('principal cannot act before accounts verify', () => {
    const r = m.canAct('principal', 'principal', 'submitted', amt, []);
    assert.strictEqual(r.allowed, false);
    assert.match(r.reason, /Out of order/);
    assert.strictEqual(r.expected, 'accounts');
  });

  await t.test('chairman cannot act before the principal', () => {
    const r = m.canAct('chairman', 'chairman', 'accountsVerified', amt, ['accounts']);
    assert.strictEqual(r.allowed, false);
    assert.match(r.reason, /Out of order/);
    assert.strictEqual(r.expected, 'principal');
  });

  await t.test('the correct step at the correct time is allowed', () => {
    assert.strictEqual(m.canAct('accountant', 'accounts', 'submitted', amt, []).allowed, true);
    assert.strictEqual(
      m.canAct('principal', 'principal', 'accountsVerified', amt, ['accounts']).allowed, true);
    assert.strictEqual(
      m.canAct('chairman', 'chairman', 'principalApproved', amt, ['accounts', 'principal']).allowed, true);
  });

  await t.test('the final approval leads to paymentPending', () => {
    const r = m.canAct('chairman', 'chairman', 'principalApproved', amt, ['accounts', 'principal']);
    assert.strictEqual(r.toStatus, 'paymentPending');
    assert.strictEqual(r.isFinal, true);
  });

  await t.test('a trustee cannot short-circuit a tier-4 chain', () => {
    const big = rupees(300000);
    const r = m.canAct('trustee', 'trustee', 'accountsVerified', big, ['accounts']);
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.expected, 'principal');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('unauthorised roles are blocked', async (t) => {
  const amt = rupees(150000);

  await t.test('a cashier cannot verify', () => {
    const r = m.canAct('cashier', 'accounts', 'submitted', amt, []);
    assert.strictEqual(r.allowed, false);
    assert.match(r.reason, /cannot perform/);
    assert.ok(r.allowedRoles.includes('accountant'));
  });

  await t.test('a teacher cannot approve at any step', () => {
    for (const [step, status, done] of [
      ['accounts', 'submitted', []],
      ['principal', 'accountsVerified', ['accounts']],
      ['chairman', 'principalApproved', ['accounts', 'principal']],
    ]) {
      assert.strictEqual(m.canAct('teacher', step, status, amt, done).allowed, false, step);
    }
  });

  await t.test('an auditor is read-only in the workflow too', () => {
    assert.strictEqual(m.canAct('auditor', 'accounts', 'submitted', amt, []).allowed, false);
  });

  await t.test('a vice principal may stand in for the principal', () => {
    assert.strictEqual(
      m.canAct('vicePrincipal', 'principal', 'accountsVerified', amt, ['accounts']).allowed, true);
  });

  await t.test('a chairman may act at the trustee step', () => {
    const big = rupees(300000);
    assert.strictEqual(
      m.canAct('chairman', 'trustee', 'chairmanApproved', big,
        ['accounts', 'principal', 'chairman']).allowed, true);
  });

  await t.test('but a principal may NOT act as chairman', () => {
    assert.strictEqual(
      m.canAct('principal', 'chairman', 'principalApproved', amt, ['accounts', 'principal']).allowed,
      false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('nextAction resolves the state ambiguity', async (t) => {
  await t.test('tier 3 at chairmanApproved is COMPLETE', () => {
    const r = m.nextAction('chairmanApproved', rupees(150000), ['accounts', 'principal', 'chairman']);
    assert.strictEqual(r.done, true);
  });

  await t.test('tier 4 at chairmanApproved is WAITING FOR A TRUSTEE', () => {
    const r = m.nextAction('chairmanApproved', rupees(300000), ['accounts', 'principal', 'chairman']);
    assert.strictEqual(r.done, false);
    assert.strictEqual(r.step, 'trustee');
    assert.strictEqual(r.isFinal, true);
  });

  await t.test('a draft has not entered the chain', () => {
    const r = m.nextAction('draft', rupees(9000), []);
    assert.strictEqual(r.step, null);
    assert.match(r.reason, /Not yet submitted/);
  });

  await t.test('paymentPending awaits payment, not approval', () => {
    const r = m.nextAction('paymentPending', rupees(9000), ['accounts', 'deptHead']);
    assert.strictEqual(r.step, 'payment');
  });

  await t.test('terminal states are done', () => {
    for (const s of ['rejected', 'cancelled', 'closed', 'paymentCompleted']) {
      assert.strictEqual(m.nextAction(s, rupees(9000), []).done, true, s);
    }
  });

  await t.test('remaining steps are listed', () => {
    const r = m.nextAction('accountsVerified', rupees(300000), ['accounts']);
    assert.deepStrictEqual(r.remaining, ['principal', 'chairman', 'trustee']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('a configured matrix must have no gaps or overlaps', async (t) => {
  await t.test('the defaults are valid', () => {
    assert.deepStrictEqual(m.validateTiers(m.DEFAULT_TIERS), []);
  });

  await t.test('a gap is rejected', () => {
    const bad = [
      { minAmount: 0, maxAmount: 1000000, approvers: ['deptHead'] },
      { minAmount: 2000000, maxAmount: null, approvers: ['principal'] },
    ];
    assert.match(m.validateTiers(bad).join(' '), /gap/);
  });

  await t.test('an overlap is rejected', () => {
    const bad = [
      { minAmount: 0, maxAmount: 2000000, approvers: ['deptHead'] },
      { minAmount: 1000000, maxAmount: null, approvers: ['principal'] },
    ];
    assert.match(m.validateTiers(bad).join(' '), /overlap/);
  });

  await t.test('the lowest tier must start at zero', () => {
    const bad = [{ minAmount: 100, maxAmount: null, approvers: ['deptHead'] }];
    assert.match(m.validateTiers(bad).join(' '), /must start at 0/);
  });

  await t.test('the highest tier must be open-ended', () => {
    const bad = [{ minAmount: 0, maxAmount: 1000000, approvers: ['deptHead'] }];
    assert.match(m.validateTiers(bad).join(' '), /open-ended/);
  });

  await t.test('a tier with no approvers is rejected', () => {
    const bad = [{ minAmount: 0, maxAmount: null, approvers: [] }];
    assert.match(m.validateTiers(bad).join(' '), /no approvers/);
  });

  await t.test('an unknown approver role is rejected', () => {
    const bad = [{ minAmount: 0, maxAmount: null, approvers: ['headmaster'] }];
    assert.match(m.validateTiers(bad).join(' '), /unknown approver/);
  });

  await t.test('a custom valid matrix is accepted and routes', () => {
    const custom = [
      { tier: 1, minAmount: 0, maxAmount: 500000, approvers: ['deptHead'] },
      { tier: 2, minAmount: 500001, maxAmount: null, approvers: ['principal', 'chairman'] },
    ];
    assert.deepStrictEqual(m.validateTiers(custom), []);
    assert.deepStrictEqual(m.tierFor(rupees(4000), custom).approvers, ['deptHead']);
    assert.deepStrictEqual(m.tierFor(rupees(6000), custom).approvers, ['principal', 'chairman']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('exhaustive sweep across every boundary', async (t) => {
  await t.test('every amount from ₹0 to ₹3,00,001 routes to exactly one tier', () => {
    // Step in ₹1 up to ₹3,00,001, plus every boundary ±1 paisa.
    const probes = new Set();
    for (let r = 0; r <= 300001; r += 1) probes.add(rupees(r));
    for (const b of [1000000, 5000000, 20000000]) {
      probes.add(b - 1); probes.add(b); probes.add(b + 1);
    }

    let checked = 0;
    for (const amt of probes) {
      const matches = m.DEFAULT_TIERS.filter((t2) =>
        amt >= t2.minAmount &&
        (t2.maxAmount === null || amt <= t2.maxAmount));
      assert.strictEqual(matches.length, 1,
        `${amt} paise matched ${matches.length} tiers`);
      checked += 1;
    }
    assert.ok(checked > 300000, `only ${checked} amounts probed`);
  });
});