// backend/fms/services/audit/deleteGuards.test.js
//
//   node --test fms/services/audit/deleteGuards.test.js
//
// FR-M17: "No hard deletes anywhere — verify by code review and a test that
// attempts a delete and is blocked."
//
// Code review does not scale and does not run in CI. This enumerates EVERY FMS
// model and asserts the guard, so a model added later without one fails here
// rather than being discovered when somebody deletes a voucher.
//
// When this test was first written it found SIXTEEN unguarded models, including
// fms_vouchers (deleting a header orphans its ledger entries) and
// fms_ingeststate (deleting a row releases an idempotency key, so the next
// ingest cycle double-posts). The claim was being made and was not true.

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const MODEL_DIRS = [
  'core', 'income', 'expense', 'approval', 'payment', 'budget', 'vendor',
  'purchase', 'banking', 'pettyCash', 'integration', 'payroll', 'settlement',
  'journal', 'cashBankBook',
];

/**
 * Models that may legitimately be hard-deleted, with the reason.
 *
 * Deliberately tiny. Anything holding a financial record, an approval, a
 * signature, or an idempotency claim does NOT belong here.
 */
const ALLOWED_TO_DELETE = {
  FmsSettings:
    'Configuration only. Holds no financial record, no approval and no ' +
    'idempotency claim — a removed setting reverts to its default.',

  FmsSyncLog:
    'An operations diary, not a financial record. It describes import runs; the ' +
    'vouchers, ledger entries and ingest claims those runs produced are permanent ' +
    'and untouched by removing one. It also carries a TTL index and is DESIGNED to ' +
    'expire, so guarding it against deletion would contradict its own retention ' +
    'policy. Added 2026-07-30 with the sync logging work.',
};

function loadAll() {
  for (const d of MODEL_DIRS) {
    try { require(`../../models/${d}`); } catch (_) { /* module may not exist yet */ }
  }
  return Object.keys(mongoose.models).filter((n) => n.startsWith('Fms')).sort();
}

/**
 * Mongoose registers a built-in document-level `deleteOne` hook, so its
 * presence proves nothing. `deleteMany` has no built-in — a hook there is
 * necessarily one we added.
 */
function isGuarded(model) {
  const hooks = model.schema.s.hooks._pres || new Map();
  return (hooks.get('deleteMany') || []).length > 0;
}

test('no hard deletes anywhere', async (t) => {
  const names = loadAll();

  await t.test('every FMS model is accounted for', () => {
    assert.ok(names.length >= 30, `expected 30+ models, found ${names.length}`);
  });

  await t.test('EVERY MODEL EITHER BLOCKS DELETES OR IS EXPLICITLY ALLOWED', () => {
    const unguarded = names.filter((n) => !isGuarded(mongoose.models[n]));
    const unexplained = unguarded.filter((n) => !ALLOWED_TO_DELETE[n]);

    assert.deepStrictEqual(
      unexplained, [],
      'These models permit hard deletes and are not on the allowlist:\n  ' +
      unexplained.map((n) => `${n} (${mongoose.models[n].collection.collectionName})`).join('\n  ')
    );
  });

  await t.test('the allowlist is small and every entry gives a reason', () => {
    const keys = Object.keys(ALLOWED_TO_DELETE);
    assert.ok(keys.length <= 3, `the allowlist has grown to ${keys.length} — each addition weakens the guarantee`);
    for (const k of keys) {
      assert.ok(ALLOWED_TO_DELETE[k].length > 40, `${k} needs a real reason, not a note`);
    }
  });

  await t.test('nothing on the allowlist holds money or approvals', () => {
    for (const name of Object.keys(ALLOWED_TO_DELETE)) {
      const model = mongoose.models[name];
      if (!model) continue;
      const paths = Object.keys(model.schema.paths);
      const financial = paths.filter((p) =>
        /amount|debit|credit|voucher|balance|approv/i.test(p));
      assert.deepStrictEqual(
        financial, [],
        `${name} is allowed to be deleted but carries financial fields: ${financial.join(', ')}`
      );
    }
  });
});

test('the models that matter most are guarded', async (t) => {
  loadAll();

  // Named individually, because a regression in any of these is severe and the
  // reason is specific.
  const CRITICAL = {
    FmsVoucher: 'deleting a header orphans its ledger entries',
    FmsLedgerEntry: 'the ledger itself',
    FmsIngestState: 'releasing an idempotency key causes double-posting',
    FmsNumberSequence: 'restarting the counter produces duplicate voucher numbers',
    FmsDailyClosing: 'a signed physical cash count',
    FmsAuditTrail: 'an audit trail that can be edited is not one',
    FmsBankReconciliation: 'a signed statement of position',
    FmsPaymentVoucher: 'money leaving the school',
    FmsIncomeVoucher: 'money arriving',
    FmsExpenseApproval: 'who approved what',
    FmsSettlement: 'which receipts a bank credit cleared',
    FmsPayrollPosting: 'salary posted to the books',
  };

  for (const [name, why] of Object.entries(CRITICAL)) {
    await t.test(`${name} — ${why}`, () => {
      const model = mongoose.models[name];
      assert.ok(model, `${name} is not registered`);
      assert.ok(isGuarded(model), `${name} permits hard deletes: ${why}`);
    });
  }
});

test('the guard rejects with a readable reason', async (t) => {
  loadAll();

  await t.test('every guarded model names its collection in the error', async () => {
    // The hook throws synchronously; calling it directly avoids needing a
    // database while still exercising the real function.
    const names = loadAll().filter((n) => isGuarded(mongoose.models[n]));
    let checked = 0;

    for (const n of names) {
      const hooks = mongoose.models[n].schema.s.hooks._pres;
      const fn = (hooks.get('deleteMany') || [])[0]?.fn;
      if (!fn) continue;
      try {
        await fn.call({});
        assert.fail(`${n} did not throw`);
      } catch (err) {
        // The requirement is that the message NAMES ITS COLLECTION, so somebody
        // reading a stack trace knows what refused and why. Punctuation after
        // the name is style, not substance — an earlier version of this
        // assertion demanded a colon and spent three rounds enforcing it.
        assert.match(
          err.message, /^fms_[a-z]+[: ]/,
          `${n} should name its collection, got: ${err.message}`
        );
        assert.ok(err.message.length > 30, `${n} should explain, not just refuse`);
        checked += 1;
      }
    }

    assert.ok(checked >= 25, `only ${checked} guards were exercised`);
  });
});