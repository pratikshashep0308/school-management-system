// 014 — create fms_vendors and fms_vendordocuments.

module.exports = {
  id: '014_vendors',
  description: 'Create fms_vendors and fms_vendordocuments (M7)',

  collections: ['fms_vendors', 'fms_vendordocuments'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    for (const name of this.collections) {
      if (!existing.includes(name)) await db.createCollection(name);
    }

    await db.collection('fms_vendors').createIndexes([
      { key: { school: 1, vendorCode: 1 }, name: 'school_vendorCode', unique: true },
      // A GSTIN identifies one taxable person. Two vendor records sharing one
      // means duplicate masters and payments split across both.
      {
        key: { school: 1, gstin: 1 },
        name: 'school_gstin',
        unique: true,
        partialFilterExpression: { gstin: { $type: 'string' } },
      },
      { key: { school: 1, vendorStatus: 1, vendorName: 1 }, name: 'school_status_name' },
      { key: { school: 1, vendorName: 1 }, name: 'school_name' },
    ]);

    await db.collection('fms_vendordocuments').createIndexes([
      { key: { school: 1, vendor: 1, docType: 1 }, name: 'school_vendor_type' },
      { key: { school: 1, expiryDate: 1 }, name: 'school_expiry' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (existing.includes('fms_vendors')) {
      const live = await db.collection('fms_vendors')
        .countDocuments({ vendorStatus: { $ne: 'draft' } });
      if (live > 0) {
        throw new Error(
          `Cannot roll back: ${live} vendor(s) are past draft and may be referenced ` +
          'by expenses and payments.'
        );
      }
      await db.collection('fms_vendors').drop();
    }
    if (existing.includes('fms_vendordocuments')) {
      await db.collection('fms_vendordocuments').drop();
    }
  },
};