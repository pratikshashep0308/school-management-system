// 001 — create the foundational FMS collections and their indexes.
//
// Collections are created explicitly rather than left to Mongoose's create-on-
// first-write, so that down() has something definite to drop and the indexes
// (especially the unique ones) exist before any data does.

module.exports = {
  id: '001_core_collections',
  description: 'Create foundational fms_ collections and indexes',

  // Declared for the runner's fms_-only guard. If any name here lacked the
  // prefix, the runner would refuse to execute this migration at all.
  collections: [
    'fms_financialyears',
    'fms_accountgroups',
    'fms_accounts',
    'fms_vouchers',
    'fms_ledgerentries',
    'fms_numbersequences',
    'fms_ingeststate',
    'fms_roleassignments',
    'fms_settings',
    'fms_audittrail',
  ],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    for (const name of this.collections) {
      if (!existing.includes(name)) await db.createCollection(name);
    }

    await db.collection('fms_financialyears').createIndexes([
      { key: { school: 1, yearCode: 1 }, name: 'school_yearCode', unique: true },
      {
        key: { school: 1, isCurrent: 1 },
        name: 'school_isCurrent',
        partialFilterExpression: { isCurrent: true },
      },
      { key: { school: 1, fyStatus: 1 }, name: 'school_fyStatus' },
    ]);

    await db.collection('fms_accountgroups').createIndexes([
      { key: { school: 1, groupCode: 1 }, name: 'school_groupCode', unique: true },
      { key: { school: 1, parent: 1 }, name: 'school_parent' },
      { key: { school: 1, accountType: 1 }, name: 'school_accountType' },
    ]);

    await db.collection('fms_accounts').createIndexes([
      { key: { school: 1, accountCode: 1 }, name: 'school_accountCode', unique: true },
      { key: { school: 1, accountGroup: 1 }, name: 'school_accountGroup' },
      { key: { school: 1, accountType: 1, status: 1 }, name: 'school_type_status' },
      { key: { school: 1, isBankAccount: 1 }, name: 'school_isBank' },
      {
        key: { school: 1, smsFeeTypeId: 1 },
        name: 'school_smsFeeType',
        unique: true,
        partialFilterExpression: { smsFeeTypeId: { $type: 'objectId' } },
      },
    ]);

    await db.collection('fms_vouchers').createIndexes([
      { key: { school: 1, voucherNumber: 1 }, name: 'school_voucherNumber', unique: true },
      { key: { school: 1, financialYear: 1, voucherDate: -1 }, name: 'school_fy_date' },
      { key: { school: 1, voucherType: 1, voucherDate: -1 }, name: 'school_type_date' },
      { key: { source: 1, sourceRef: 1 }, name: 'source_sourceRef' },
      { key: { school: 1, voucherStatus: 1 }, name: 'school_status' },
    ]);

    await db.collection('fms_ledgerentries').createIndexes([
      { key: { school: 1, financialYear: 1, entryDate: -1 }, name: 'school_fy_entryDate' },
      { key: { school: 1, account: 1, entryDate: -1 }, name: 'school_account_entryDate' },
      { key: { school: 1, voucher: 1 }, name: 'school_voucher' },
      { key: { school: 1, party: 1, entryDate: -1 }, name: 'school_party_entryDate' },
      { key: { voucherNumber: 1 }, name: 'voucherNumber' },
    ]);

    await db.collection('fms_numbersequences').createIndexes([
      { key: { school: 1, financialYear: 1, type: 1 }, name: 'school_fy_type', unique: true },
    ]);

    // THE anti-double-posting guard. A concurrent duplicate insert throws
    // E11000, which the ingest service catches as "already posted". This index
    // is what makes idempotency a database property rather than a code promise.
    await db.collection('fms_ingeststate').createIndexes([
      { key: { school: 1, source: 1, sourceId: 1 }, name: 'school_source_sourceId', unique: true },
      { key: { school: 1, source: 1, ingestStatus: 1 }, name: 'school_source_status' },
    ]);

    await db.collection('fms_roleassignments').createIndexes([
      { key: { school: 1, smsUserId: 1 }, name: 'school_smsUserId', unique: true },
      { key: { school: 1, financeRole: 1, status: 1 }, name: 'school_role_status' },
    ]);

    await db.collection('fms_settings').createIndexes([
      { key: { school: 1, key: 1 }, name: 'school_key', unique: true },
    ]);

    await db.collection('fms_audittrail').createIndexes([
      { key: { school: 1, entity: 1, entityId: 1, createdAt: -1 }, name: 'school_entity_created' },
      { key: { school: 1, actor: 1, createdAt: -1 }, name: 'school_actor_created' },
      { key: { school: 1, createdAt: -1 }, name: 'school_created' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    // fms_settings carries the migration state itself, so it is preserved here.
    // Removing it is part of full plugin removal, not migration rollback.
    for (const name of this.collections) {
      if (name === 'fms_settings') continue;
      if (existing.includes(name)) await db.collection(name).drop();
    }
  },
};