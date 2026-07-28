// 011 — approval matrix and approval records.

const DEFAULT_TIERS = [
  { tier: 1, minAmount: 0, maxAmount: 1000000, approvers: ['deptHead'], label: 'Up to ₹10,000' },
  { tier: 2, minAmount: 1000001, maxAmount: 5000000, approvers: ['principal'], label: '₹10,001 – ₹50,000' },
  { tier: 3, minAmount: 5000001, maxAmount: 20000000, approvers: ['principal', 'chairman'], label: '₹50,001 – ₹2,00,000' },
  { tier: 4, minAmount: 20000001, maxAmount: null, approvers: ['principal', 'chairman', 'trustee'], label: 'Above ₹2,00,000' },
];

module.exports = {
  id: '011_approval_workflow',
  description: 'Create fms_approvalmatrix and fms_expenseapprovals, seed default thresholds (M5)',

  collections: ['fms_approvalmatrix', 'fms_expenseapprovals'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    for (const name of this.collections) {
      if (!existing.includes(name)) await db.createCollection(name);
    }

    await db.collection('fms_approvalmatrix').createIndexes([
      {
        key: { school: 1, financialYear: 1, isActive: 1 },
        name: 'school_fy_active',
        unique: true,
        partialFilterExpression: { isActive: true },
      },
    ]);

    await db.collection('fms_expenseapprovals').createIndexes([
      { key: { school: 1, expenseRequest: 1, actedAt: 1 }, name: 'school_expense_time' },
      { key: { school: 1, actor: 1, actedAt: -1 }, name: 'school_actor_time' },
      { key: { school: 1, step: 1, action: 1, actedAt: -1 }, name: 'school_step_action' },
    ]);

    // Seed the default thresholds so the workflow is usable immediately.
    // Amounts are integer paise.
    const school = await db.collection('schools').findOne({});
    if (school) {
      const already = await db.collection('fms_approvalmatrix')
        .findOne({ school: school._id, financialYear: null, isActive: true });
      if (!already) {
        const now = new Date();
        await db.collection('fms_approvalmatrix').insertOne({
          school: school._id,
          financialYear: null,
          tiers: DEFAULT_TIERS,
          isActive: true,
          version: 1,
          notes: 'Seeded defaults per SRS FR-M5. Editable via SCR-20.',
          createdAt: now,
          updatedAt: now,
        });
        console.log('   default approval thresholds seeded');
      }
    }
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);

    if (existing.includes('fms_expenseapprovals')) {
      const n = await db.collection('fms_expenseapprovals').countDocuments({});
      if (n > 0) {
        throw new Error(
          `Cannot roll back: ${n} approval record(s) exist. These are the evidence ` +
          'of how payments were authorised and cannot be recreated.'
        );
      }
      await db.collection('fms_expenseapprovals').drop();
    }
    if (existing.includes('fms_approvalmatrix')) {
      await db.collection('fms_approvalmatrix').drop();
    }
  },
};