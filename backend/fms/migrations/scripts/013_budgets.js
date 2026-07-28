// 013 — create fms_budgets.
//
// P3.2's budget check has been returning `notChecked` because this collection
// did not exist. Once it does, and a budget is activated, the check becomes
// real without any change to the expense code.

module.exports = {
  id: '013_budgets',
  description: 'Create fms_budgets for spending allowances (M6)',

  collections: ['fms_budgets'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (!existing.includes('fms_budgets')) {
      await db.createCollection('fms_budgets');
    }

    await db.collection('fms_budgets').createIndexes([
      // One budget per account per year per department. Two would make "the
      // budget for this head" ambiguous, and any answer would be arbitrary.
      {
        key: { school: 1, financialYear: 1, account: 1, 'department.name': 1 },
        name: 'school_fy_account_dept',
        unique: true,
      },
      { key: { school: 1, financialYear: 1, budgetStatus: 1 }, name: 'school_fy_status' },
      { key: { school: 1, account: 1, budgetStatus: 1 }, name: 'school_account_status' },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (existing.includes('fms_budgets')) {
      const live = await db.collection('fms_budgets')
        .countDocuments({ budgetStatus: { $in: ['active', 'revised'] } });
      if (live > 0) {
        throw new Error(
          `Cannot roll back: ${live} live budget(s) exist and expenses have been ` +
          'checked against them.'
        );
      }
      await db.collection('fms_budgets').drop();
    }
  },
};