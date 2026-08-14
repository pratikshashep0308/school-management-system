// 018 — account mappings, and the ingest linkage on income vouchers.

module.exports = {
  id: '018_integrations',
  description: 'Create fms_accountmappings and index the SMS ingest linkage (P5.1)',

  collections: ['fms_accountmappings'],
  dependsOn: ['001_core_collections', '009_income_vouchers'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (!existing.includes('fms_accountmappings')) {
      await db.createCollection('fms_accountmappings');
    }

    await db.collection('fms_accountmappings').createIndexes([
      // One mapping per source key — two would let iteration order decide
      // where real money lands.
      { key: { school: 1, mappingType: 1, sourceKey: 1 }, name: 'school_type_key', unique: true },
      { key: { school: 1, mappingType: 1, isActive: 1 }, name: 'school_type_active' },
    ]);

    // The SMS receipt number is the ingest idempotency key. A unique partial
    // index makes a replayed cycle a database impossibility, not a hope.
    await db.collection('fms_incomevouchers').createIndexes([
      {
        key: { school: 1, sourceReceiptNumber: 1 },
        name: 'school_sourceReceiptNumber',
        unique: true,
        partialFilterExpression: { sourceReceiptNumber: { $type: 'string' } },
      },
      { key: { school: 1, needsReclassification: 1 }, name: 'school_needsReclassification' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);

    if (existing.includes('fms_incomevouchers')) {
      const ingested = await db.collection('fms_incomevouchers')
        .countDocuments({ sourceSystem: 'sms' });
      if (ingested > 0) {
        throw new Error(
          `Cannot roll back: ${ingested} receipt(s) were ingested from the SMS and ` +
          'have ledger entries behind them.'
        );
      }
      for (const n of ['school_sourceReceiptNumber', 'school_needsReclassification']) {
        try { await db.collection('fms_incomevouchers').dropIndex(n); } catch (_) { /* absent */ }
      }
    }

    if (existing.includes('fms_accountmappings')) {
      await db.collection('fms_accountmappings').drop();
    }
  },
};