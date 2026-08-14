// 019 — payroll postings.

module.exports = {
  id: '019_payroll_postings',
  description: 'Create fms_payrollpostings for the payroll integration (P5.2, M15)',

  collections: ['fms_payrollpostings'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (!existing.includes('fms_payrollpostings')) {
      await db.createCollection('fms_payrollpostings');
    }

    await db.collection('fms_payrollpostings').createIndexes([
      // One LIVE posting per slip. A reversed one may coexist with a fresh
      // posting for the same slip — §3.5.
      {
        key: { school: 1, salarySlip: 1 },
        name: 'school_slip_live',
        unique: true,
        partialFilterExpression: { postingStatus: 'posted' },
      },
      { key: { school: 1, postingStatus: 1, postingDate: -1 }, name: 'school_status_date' },
      { key: { school: 1, teacher: 1, year: 1, month: 1 }, name: 'school_teacher_period' },
      { key: { voucher: 1 }, name: 'voucher' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (existing.includes('fms_payrollpostings')) {
      const n = await db.collection('fms_payrollpostings').countDocuments({});
      if (n > 0) {
        throw new Error(
          `Cannot roll back: ${n} payroll posting(s) exist and have ledger entries behind them.`
        );
      }
      await db.collection('fms_payrollpostings').drop();
    }
  },
};