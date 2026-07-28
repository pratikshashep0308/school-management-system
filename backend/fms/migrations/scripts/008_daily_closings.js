// 008 — create fms_dailyclosings.
//
// Cash Book (M13) and Bank Book (M14) daily closing + verification. Petty Cash
// (M10, P4.5) reuses the same collection rather than introducing a parallel one.

module.exports = {
  id: '008_daily_closings',
  description: 'Create fms_dailyclosings for cash/bank daily closing and verification (M13/M14)',

  collections: ['fms_dailyclosings'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (!existing.includes('fms_dailyclosings')) {
      await db.createCollection('fms_dailyclosings');
    }

    await db.collection('fms_dailyclosings').createIndexes([
      // One closing per account per day. Without this a day could be closed
      // twice with different counts and both would look authoritative.
      { key: { school: 1, account: 1, closingDate: 1 }, name: 'school_account_date', unique: true },
      { key: { school: 1, bookType: 1, closingDate: -1 }, name: 'school_type_date' },
      { key: { school: 1, closingStatus: 1, closingDate: -1 }, name: 'school_status_date' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (existing.includes('fms_dailyclosings')) {
      const verified = await db.collection('fms_dailyclosings')
        .countDocuments({ closingStatus: 'verified' });
      if (verified > 0) {
        throw new Error(
          `Cannot roll back: ${verified} verified daily closing(s) exist. ` +
          'These are signed records of a physical count and cannot be recreated.'
        );
      }
      await db.collection('fms_dailyclosings').drop();
    }
  },
};