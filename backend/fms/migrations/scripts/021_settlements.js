// 021 — settlements of the online-collections clearing head.

module.exports = {
  id: '021_settlements',
  description: 'Create fms_settlements for clearing online collections into the bank (P5.4)',

  collections: ['fms_settlements'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (!existing.includes('fms_settlements')) {
      await db.createCollection('fms_settlements');
    }

    await db.collection('fms_settlements').createIndexes([
      // Settling the same bank credit twice would credit the clearing head for
      // money that arrived once.
      { key: { school: 1, settlementReference: 1 }, name: 'school_reference', unique: true },
      { key: { school: 1, settlementStatus: 1, settlementDate: -1 }, name: 'school_status_date' },
      { key: { school: 1, clearedEntries: 1 }, name: 'school_clearedEntries' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (existing.includes('fms_settlements')) {
      const n = await db.collection('fms_settlements')
        .countDocuments({ settlementStatus: 'settled' });
      if (n > 0) {
        throw new Error(
          `Cannot roll back: ${n} settlement(s) are live and have ledger entries behind them.`
        );
      }
      await db.collection('fms_settlements').drop();
    }
  },
};