// 009 — create fms_incomevouchers.

module.exports = {
  id: '009_income_vouchers',
  description: 'Create fms_incomevouchers for money received (M3)',

  collections: ['fms_incomevouchers'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (!existing.includes('fms_incomevouchers')) {
      await db.createCollection('fms_incomevouchers');
    }

    await db.collection('fms_incomevouchers').createIndexes([
      // A receipt number is a legal document number — duplicates are not a
      // tidiness issue, they are two receipts claiming to be the same one.
      { key: { school: 1, receiptNumber: 1 }, name: 'school_receiptNumber', unique: true },
      { key: { school: 1, receiptDate: -1 }, name: 'school_date' },
      { key: { school: 1, category: 1, receiptDate: -1 }, name: 'school_category_date' },
      { key: { school: 1, smsStudentId: 1, receiptDate: -1 }, name: 'school_student_date' },
      { key: { school: 1, incomeStatus: 1, receiptDate: -1 }, name: 'school_status_date' },
      { key: { voucher: 1 }, name: 'voucher' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (existing.includes('fms_incomevouchers')) {
      const n = await db.collection('fms_incomevouchers').countDocuments({});
      if (n > 0) {
        throw new Error(
          `Cannot roll back: ${n} receipt(s) exist. These were issued to payers and ` +
          'have ledger entries behind them.'
        );
      }
      await db.collection('fms_incomevouchers').drop();
    }
  },
};