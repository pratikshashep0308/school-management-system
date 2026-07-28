// 007 — create fms_journalvouchers.
//
// Deferred from P1.2 on purpose: domain collections land with the module that
// uses them, so a migration and the code that depends on it ship together and
// are tested together.

module.exports = {
  id: '007_journal_vouchers',
  description: 'Create fms_journalvouchers for manual journal entries (M12)',

  collections: ['fms_journalvouchers'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (!existing.includes('fms_journalvouchers')) {
      await db.createCollection('fms_journalvouchers');
    }

    await db.collection('fms_journalvouchers').createIndexes([
      { key: { school: 1, jvStatus: 1, jvDate: -1 }, name: 'school_status_date' },
      { key: { school: 1, financialYear: 1, jvDate: -1 }, name: 'school_fy_date' },
      { key: { school: 1, createdBy: 1, jvStatus: 1 }, name: 'school_creator_status' },
      // Sparse: only posted vouchers carry one, and a unique index over many
      // nulls would reject every second draft.
      { key: { voucher: 1 }, name: 'voucher', sparse: true },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (existing.includes('fms_journalvouchers')) {
      // A posted JV has ledger entries behind it. Dropping the collection would
      // orphan them — the ledger would hold postings with no explanation.
      const posted = await db.collection('fms_journalvouchers')
        .countDocuments({ jvStatus: { $in: ['posted', 'reversed'] } });
      if (posted > 0) {
        throw new Error(
          `Cannot roll back: ${posted} journal voucher(s) are posted or reversed and ` +
          'have ledger entries behind them. Reverse and reconcile first.'
        );
      }
      await db.collection('fms_journalvouchers').drop();
    }
  },
};