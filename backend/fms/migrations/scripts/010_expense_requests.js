// 010 — create fms_expenserequests.

module.exports = {
  id: '010_expense_requests',
  description: 'Create fms_expenserequests for spending requests (M4)',

  collections: ['fms_expenserequests'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (!existing.includes('fms_expenserequests')) {
      await db.createCollection('fms_expenserequests');
    }

    await db.collection('fms_expenserequests').createIndexes([
      { key: { school: 1, expenseNumber: 1 }, name: 'school_expenseNumber', unique: true },
      { key: { school: 1, expenseStatus: 1, requestDate: -1 }, name: 'school_status_date' },
      { key: { school: 1, financialYear: 1, requestDate: -1 }, name: 'school_fy_date' },
      { key: { school: 1, requestedBy: 1, expenseStatus: 1 }, name: 'school_requester_status' },
      // Supports the budget check, which sums committed spend per head.
      { key: { school: 1, budgetHead: 1, expenseStatus: 1 }, name: 'school_head_status' },
      { key: { school: 1, 'department.name': 1, requestDate: -1 }, name: 'school_dept_date' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (existing.includes('fms_expenserequests')) {
      const live = await db.collection('fms_expenserequests').countDocuments({
        expenseStatus: { $nin: ['draft', 'cancelled', 'rejected'] },
      });
      if (live > 0) {
        throw new Error(
          `Cannot roll back: ${live} expense request(s) are in an active workflow state.`
        );
      }
      await db.collection('fms_expenserequests').drop();
    }
  },
};