// 017 — petty cash floats and transactions.
//
// Daily closing is NOT created here: fms_dailyclosings already exists from
// migration 008 and serves any cash account, petty cash included.

module.exports = {
  id: '017_petty_cash',
  description: 'Create fms_pettycashfloats and fms_pettycashtransactions (M10, WF9)',

  collections: ['fms_pettycashfloats', 'fms_pettycashtransactions'],
  dependsOn: ['001_core_collections', '008_daily_closings'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    for (const name of this.collections) {
      if (!existing.includes(name)) await db.createCollection(name);
    }

    await db.collection('fms_pettycashfloats').createIndexes([
      // One float per cash head, or "how much is in the tin" is unanswerable.
      { key: { school: 1, account: 1 }, name: 'school_account', unique: true },
      { key: { school: 1, floatStatus: 1 }, name: 'school_status' },
      { key: { school: 1, custodian: 1 }, name: 'school_custodian' },
    ]);

    await db.collection('fms_pettycashtransactions').createIndexes([
      { key: { school: 1, voucherNumber: 1 }, name: 'school_voucherNumber', unique: true },
      { key: { school: 1, pettyCashFloat: 1, transactionDate: -1 }, name: 'school_float_date' },
      { key: { school: 1, transactionType: 1, transactionDate: -1 }, name: 'school_type_date' },
      { key: { voucher: 1 }, name: 'voucher' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (existing.includes('fms_pettycashtransactions')) {
      const posted = await db.collection('fms_pettycashtransactions')
        .countDocuments({ pcStatus: 'posted' });
      if (posted > 0) {
        throw new Error(
          `Cannot roll back: ${posted} petty cash entr(ies) are posted and have ` +
          'ledger entries behind them.'
        );
      }
      await db.collection('fms_pettycashtransactions').drop();
    }
    if (existing.includes('fms_pettycashfloats')) {
      await db.collection('fms_pettycashfloats').drop();
    }
  },
};