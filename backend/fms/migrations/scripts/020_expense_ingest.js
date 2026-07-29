// 020 — index the SMS expense import linkage.
//
// No new collection: imported expenses live in fms_expenserequests alongside
// FMS-originated ones, because people want one list of expenses. They are
// distinguished by sourceSystem and by an explicit workflow entry, never by
// being hidden somewhere else.

module.exports = {
  id: '020_expense_ingest',
  description: 'Index the SMS expense import linkage on fms_expenserequests (P5.3)',

  collections: ['fms_expenserequests'],
  dependsOn: ['010_expense_requests'],

  async up(db) {
    await db.collection('fms_expenserequests').createIndexes([
      // The SMS expense id is the idempotency key. A unique partial index makes
      // a replayed import impossible at the database rather than in code.
      {
        key: { school: 1, sourceExpenseId: 1 },
        name: 'school_sourceExpenseId',
        unique: true,
        partialFilterExpression: { sourceExpenseId: { $type: 'objectId' } },
      },
      { key: { school: 1, sourceSystem: 1 }, name: 'school_sourceSystem' },
    ]);
  },

  async down(db) {
    const imported = await db.collection('fms_expenserequests')
      .countDocuments({ sourceSystem: 'sms' });
    if (imported > 0) {
      throw new Error(
        `Cannot roll back: ${imported} expense(s) were imported from the SMS and ` +
        'have ledger entries behind them.'
      );
    }
    for (const n of ['school_sourceExpenseId', 'school_sourceSystem']) {
      try { await db.collection('fms_expenserequests').dropIndex(n); } catch (_) { /* absent */ }
    }
  },
};