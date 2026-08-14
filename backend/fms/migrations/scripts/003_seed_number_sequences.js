// 003 — seed voucher number sequences for the current financial year.
//
// One row per document type. Allocation itself is atomic ($inc + upsert inside
// the posting transaction); this migration just establishes the prefixes and
// year label so numbering starts consistently.

module.exports = {
  id: '003_seed_number_sequences',
  description: 'Seed fms_numbersequences for the current FY',

  collections: ['fms_numbersequences'],

  async up(db) {
    const school = await db.collection('schools').findOne({});
    if (!school) throw new Error('No school document found — cannot scope FMS data.');

    const fy = await db.collection('fms_financialyears').findOne({
      school: school._id,
      isCurrent: true,
    });
    if (!fy) throw new Error('No current financial year — run 002 first.');

    const types = [
      ['INC', 'INC'],  // income voucher
      ['RCT', 'RCT'],  // receipt voucher
      ['PMT', 'PAY'],  // payment voucher
      ['JV',  'JV'],   // journal voucher
      ['EXP', 'EXP'],  // expense request
      ['PR',  'PR'],   // purchase request
      ['PO',  'PO'],   // purchase order
      ['GRN', 'GRN'],  // goods receipt
      ['VEN', 'VEN'],  // vendor code
    ];

    const now = new Date();
    for (const [type, prefix] of types) {
      await db.collection('fms_numbersequences').updateOne(
        { school: school._id, financialYear: fy._id, type },
        {
          $setOnInsert: {
            school: school._id,
            financialYear: fy._id,
            type,
            prefix,
            yearLabel: fy.yearCode,
            sequence: 0,
            padding: 5,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
    }
  },

  async down(db) {
    await db.collection('fms_numbersequences').deleteMany({});
  },
};