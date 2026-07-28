// 015 — the procure-to-pay collections.

module.exports = {
  id: '015_purchase',
  description: 'Create purchase requests, orders, goods receipts and invoices (M8, WF2)',

  collections: [
    'fms_purchaserequests', 'fms_purchaseorders',
    'fms_goodsreceipts', 'fms_purchaseinvoices',
  ],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    for (const name of this.collections) {
      if (!existing.includes(name)) await db.createCollection(name);
    }

    await db.collection('fms_purchaserequests').createIndexes([
      { key: { school: 1, prNumber: 1 }, name: 'school_prNumber', unique: true },
      { key: { school: 1, purchaseStatus: 1, requestDate: -1 }, name: 'school_status_date' },
      { key: { school: 1, requestedBy: 1, purchaseStatus: 1 }, name: 'school_requester_status' },
    ]);

    await db.collection('fms_purchaseorders').createIndexes([
      { key: { school: 1, poNumber: 1 }, name: 'school_poNumber', unique: true },
      { key: { school: 1, poStatus: 1, poDate: -1 }, name: 'school_status_date' },
      { key: { school: 1, vendor: 1, poDate: -1 }, name: 'school_vendor_date' },
      { key: { school: 1, purchaseRequest: 1 }, name: 'school_pr' },
    ]);

    await db.collection('fms_goodsreceipts').createIndexes([
      { key: { school: 1, grnNumber: 1 }, name: 'school_grnNumber', unique: true },
      { key: { school: 1, purchaseOrder: 1, grnDate: 1 }, name: 'school_po_date' },
      { key: { school: 1, vendor: 1, grnDate: -1 }, name: 'school_vendor_date' },
    ]);

    await db.collection('fms_purchaseinvoices').createIndexes([
      // The same invoice number from two vendors is normal; the same number
      // twice from ONE vendor is a duplicate bill.
      { key: { school: 1, vendor: 1, invoiceNumber: 1 }, name: 'school_vendor_invoiceNumber', unique: true },
      { key: { school: 1, invoiceStatus: 1, invoiceDate: -1 }, name: 'school_status_date' },
      { key: { school: 1, purchaseOrder: 1 }, name: 'school_po' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);

    if (existing.includes('fms_purchaseinvoices')) {
      const posted = await db.collection('fms_purchaseinvoices')
        .countDocuments({ invoiceStatus: { $in: ['verified', 'paid'] } });
      if (posted > 0) {
        throw new Error(
          `Cannot roll back: ${posted} invoice(s) are verified or paid and have ` +
          'ledger entries behind them.'
        );
      }
    }

    for (const name of [...this.collections].reverse()) {
      if (existing.includes(name)) await db.collection(name).drop();
    }
  },
};