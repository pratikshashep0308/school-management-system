// 016 — banking and reconciliation collections.

module.exports = {
  id: '016_banking',
  description: 'Create bank accounts, transactions and reconciliations (M9, WF7)',

  collections: ['fms_bankaccounts', 'fms_banktransactions', 'fms_bankreconciliations'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    for (const name of this.collections) {
      if (!existing.includes(name)) await db.createCollection(name);
    }

    await db.collection('fms_bankaccounts').createIndexes([
      { key: { school: 1, accountNumber: 1 }, name: 'school_accountNumber', unique: true },
      // One GL head per bank account — two sharing a head would make their
      // balances indistinguishable and reconciliation impossible for either.
      { key: { school: 1, ledgerAccount: 1 }, name: 'school_ledgerAccount', unique: true },
    ]);

    await db.collection('fms_banktransactions').createIndexes([
      // The duplicate-import guard. Re-importing an overlapping range is normal;
      // without this the same withdrawal appears twice and the account looks
      // short by that amount with nothing obviously wrong.
      {
        key: { school: 1, bankAccount: 1, valueDate: 1, amount: 1, statementDirection: 1, narration: 1 },
        name: 'statement_line_identity',
        unique: true,
      },
      { key: { school: 1, bankAccount: 1, reconciliationStatus: 1, valueDate: 1 }, name: 'school_bank_status_date' },
      { key: { matchedEntry: 1 }, name: 'matchedEntry', sparse: true },
      { key: { importBatch: 1 }, name: 'importBatch' },
    ]);

    await db.collection('fms_bankreconciliations').createIndexes([
      { key: { school: 1, bankAccount: 1, periodTo: 1 }, name: 'school_bank_periodTo', unique: true },
      { key: { school: 1, periodStatus: 1, periodTo: -1 }, name: 'school_status_period' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (existing.includes('fms_bankreconciliations')) {
      const done = await db.collection('fms_bankreconciliations')
        .countDocuments({ periodStatus: { $in: ['reconciled', 'locked'] } });
      if (done > 0) {
        throw new Error(`Cannot roll back: ${done} completed reconciliation(s) exist.`);
      }
    }
    for (const name of [...this.collections].reverse()) {
      if (existing.includes(name)) await db.collection(name).drop();
    }
  },
};