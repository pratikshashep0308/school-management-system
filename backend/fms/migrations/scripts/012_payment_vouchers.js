// 012 — create fms_paymentvouchers.

module.exports = {
  id: '012_payment_vouchers',
  description: 'Create fms_paymentvouchers for expense payments (WF3)',

  collections: ['fms_paymentvouchers'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (!existing.includes('fms_paymentvouchers')) {
      await db.createCollection('fms_paymentvouchers');
    }

    await db.collection('fms_paymentvouchers').createIndexes([
      // THE double-payment guarantee. One live payment per expense; a failed
      // one sets isLive:false and frees the expense for a retry.
      {
        key: { school: 1, expenseRequest: 1 },
        name: 'school_expense_live',
        unique: true,
        partialFilterExpression: { isLive: true },
      },
      { key: { school: 1, paymentNumber: 1 }, name: 'school_paymentNumber', unique: true },
      { key: { school: 1, paymentStatus: 1, paymentDate: -1 }, name: 'school_status_date' },
      { key: { school: 1, paymentMode: 1, paymentDate: -1 }, name: 'school_mode_date' },
      { key: { voucher: 1 }, name: 'voucher' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (existing.includes('fms_paymentvouchers')) {
      const n = await db.collection('fms_paymentvouchers').countDocuments({});
      if (n > 0) {
        throw new Error(
          `Cannot roll back: ${n} payment voucher(s) exist. These record money that ` +
          'left the school and have ledger entries behind them.'
        );
      }
      await db.collection('fms_paymentvouchers').drop();
    }
  },
};