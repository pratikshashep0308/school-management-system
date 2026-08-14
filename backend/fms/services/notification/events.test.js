// backend/fms/services/notification/events.test.js
//
//   node --test fms/services/notification/events.test.js
//
// Getting a recipient list wrong means either the wrong person reads a salary
// figure, or the right person never learns an expense is waiting. Both are
// testable here without an SMTP server.

const test = require('node:test');
const assert = require('node:assert');
const e = require('./events');

const R = (r) => r * 100;

// ─────────────────────────────────────────────────────────────────────────────
test('channel availability is stated, not assumed', async (t) => {
  await t.test('FR-M19 asks for four channels', () => {
    assert.deepStrictEqual(e.CHANNELS.sort(), ['email', 'inApp', 'sms', 'whatsapp']);
  });

  await t.test('ONLY TWO ARE ACTUALLY AVAILABLE', () => {
    // nodemailer and socket.io are already running in the SMS. There is no SMS
    // gateway and no WhatsApp Business API — no provider, no credentials.
    assert.deepStrictEqual(e.AVAILABLE_CHANNELS.sort(), ['email', 'inApp']);
  });

  await t.test('and the unavailable ones say WHY', () => {
    for (const c of ['sms', 'whatsapp']) {
      assert.ok(e.UNAVAILABLE_REASON[c], c);
      assert.match(e.UNAVAILABLE_REASON[c], /no credentials/);
    }
  });

  await t.test('an unavailable channel is REPORTED, not silently dropped', () => {
    // budgetExceeded declares sms because a budget breach warrants one. It is
    // not configured — so the result must say a message was MEANT to go and
    // did not, rather than showing nothing and letting somebody assume it did.
    const r = e.resolveChannels('budgetExceeded', null);
    assert.deepStrictEqual(r.channels, ['email', 'inApp']);
    assert.strictEqual(r.unavailable.length, 1);
    assert.strictEqual(r.unavailable[0].channel, 'sms');
    assert.match(r.unavailable[0].reason, /no credentials/);
  });

  await t.test('AT LEAST ONE EVENT EXERCISES THE UNAVAILABLE PATH', () => {
    // Otherwise the reporting is dead code — which is exactly what an earlier
    // version of this file had, and what this assertion now prevents.
    const declaring = Object.values(e.EVENTS).filter((d) =>
      d.defaultChannels.some((c) => !e.AVAILABLE_CHANNELS.includes(c)));
    assert.ok(declaring.length > 0,
      'no event declares an unavailable channel, so the reporting can never fire');
  });

  await t.test('asking for a channel the event does not use is not "unavailable"', () => {
    // sms is not unavailable for expenseSubmitted — that event simply does not
    // use it. Conflating the two would make the log misleading.
    const r = e.resolveChannels('expenseSubmitted', { channels: ['email', 'sms'] });
    assert.deepStrictEqual(r.channels, ['email']);
    assert.strictEqual(r.unavailable.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('preferences narrow but never widen', async (t) => {
  await t.test('a preference can drop a channel', () => {
    const r = e.resolveChannels('expenseSubmitted', { channels: ['inApp'] });
    assert.deepStrictEqual(r.channels, ['inApp']);
  });

  await t.test('A PREFERENCE CANNOT ADD A CHANNEL THE EVENT DOES NOT USE', () => {
    // budgetThreshold is inApp only. Asking for email must not grant it —
    // otherwise a preference becomes a way to route financial detail to a
    // mailbox the event was never meant to reach.
    const r = e.resolveChannels('budgetThreshold', { channels: ['email', 'inApp'] });
    assert.deepStrictEqual(r.channels, ['inApp']);
    assert.ok(!r.channels.includes('email'));
  });

  await t.test('no preference means the defaults', () => {
    const r = e.resolveChannels('expenseSubmitted', null);
    assert.deepStrictEqual(r.channels, ['email', 'inApp']);
  });

  await t.test('an empty preference list means the defaults, not silence', () => {
    // An empty array is far more likely to be a UI bug than a deliberate
    // request to receive nothing. Muting is explicit.
    const r = e.resolveChannels('expenseSubmitted', { channels: [] });
    assert.deepStrictEqual(r.channels, ['email', 'inApp']);
  });

  await t.test('muting is explicit and separate', () => {
    const r = e.resolveChannels('expenseSubmitted', { muted: true });
    assert.strictEqual(r.suppressed, true);
  });

  await t.test('an unknown event resolves to nothing and says so', () => {
    const r = e.resolveChannels('notAnEvent', null);
    assert.deepStrictEqual(r.channels, []);
    assert.ok(r.error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('recipients', async (t) => {
  await t.test('every event names at least one role', () => {
    for (const [k, def] of Object.entries(e.EVENTS)) {
      assert.ok(Array.isArray(def.roles) && def.roles.length > 0, k);
    }
  });

  await t.test('money-sensitive events reach a manager', () => {
    for (const k of ['budgetExceeded', 'closingVariance', 'settlementOverdue', 'ingestFailed']) {
      assert.ok(
        e.EVENTS[k].roles.includes('accountsManager') || e.EVENTS[k].roles.includes('principal'),
        `${k} should reach somebody answerable`
      );
    }
  });

  await t.test('the requester is told about their OWN expense outcome', () => {
    assert.strictEqual(e.EVENTS.expenseApproved.alsoNotifyRequester, true);
    assert.strictEqual(e.EVENTS.expenseRejected.alsoNotifyRequester, true);
  });

  await t.test('but not about somebody else raising one', () => {
    assert.ok(!e.EVENTS.expenseSubmitted.alsoNotifyRequester);
  });

  await t.test('the monthly summary goes to the people who govern, not operate', () => {
    assert.ok(e.EVENTS.monthlySummary.roles.includes('chairman'));
    assert.ok(e.EVENTS.monthlySummary.roles.includes('principal'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('composing messages', async (t) => {
  await t.test('an expense submission names who, how much and what for', () => {
    const m = e.compose('expenseSubmitted', {
      expenseNumber: 'EXP-2026-27-00007', requestedByName: 'Science Dept',
      amount: R(12500), purpose: 'Lab consumables',
    });
    assert.match(m.subject, /EXP-2026-27-00007/);
    assert.match(m.body, /Science Dept/);
    assert.match(m.body, /₹12,500\.00/);
    assert.match(m.body, /Lab consumables/);
  });

  await t.test('amounts use Indian grouping', () => {
    assert.strictEqual(e.rupees(12345678), '₹1,23,456.78');
    assert.strictEqual(e.rupees(100000), '₹1,000.00');
    assert.strictEqual(e.rupees(1), '₹0.01');
    assert.strictEqual(e.rupees(0), '₹0.00');
  });

  await t.test('a missing amount shows a dash, not ₹0.00', () => {
    // Reporting nothing as zero is how a reader concludes a payment was free.
    assert.strictEqual(e.rupees(null), '—');
    assert.strictEqual(e.rupees(undefined), '—');
  });

  await t.test('a variance says whether it was short or over', () => {
    const short = e.compose('closingVariance', { variance: -R(50), accountName: 'Petty Cash' });
    assert.match(short.body, /short/);
    const over = e.compose('closingVariance', { variance: R(50), accountName: 'Petty Cash' });
    assert.match(over.body, /over/);
  });

  await t.test('a deficit is named as one', () => {
    const m = e.compose('monthlySummary', { income: R(1000), expenditure: R(1500), surplus: -R(500) });
    assert.match(m.body, /deficit ₹500\.00/);
  });

  await t.test('an unknown event returns an error rather than an empty message', () => {
    const m = e.compose('somethingElse', {});
    assert.ok(m.error);
    assert.ok(Array.isArray(m.known));
  });

  await t.test('every event composes without throwing on an EMPTY payload', () => {
    // A notification path must not be able to crash the operation that raised
    // it, and a missing field is the most likely cause.
    for (const k of Object.keys(e.EVENTS)) {
      const m = e.compose(k, {});
      assert.ok(m.subject && m.subject.length > 0, `${k} produced no subject`);
      assert.ok(m.body && m.body.length > 0, `${k} produced no body`);
    }
  });

  await t.test('urgency is carried through', () => {
    assert.strictEqual(e.compose('budgetExceeded', {}).urgency, 'high');
    assert.strictEqual(e.compose('monthlySummary', {}).urgency, 'low');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test('bodies stay short and do not reproduce the record', async (t) => {
  await t.test('no body exceeds a couple of lines', () => {
    // A notification exists to make somebody open the system. An email holding
    // the full figures is one that leaks them to whatever mailbox it reaches.
    for (const k of Object.keys(e.EVENTS)) {
      const m = e.compose(k, { amount: R(1000), consumed: R(1000), budgetAmount: R(900) });
      assert.ok(m.body.length < 260, `${k} body is ${m.body.length} chars`);
    }
  });

  await t.test('no subject exceeds a mail client line', () => {
    for (const k of Object.keys(e.EVENTS)) {
      const m = e.compose(k, { expenseNumber: 'EXP-2026-27-00001', accountName: 'Printing & Stationery' });
      assert.ok(m.subject.length < 80, `${k} subject is ${m.subject.length} chars`);
    }
  });
});