// 006 — seed FMS role assignments for existing SMS users.
//
// Maps SMS User.role → an FMS finance role, per Data Dictionary §1:
//     superAdmin  → chairman
//     schoolAdmin → principal
//     accountant  → accountant
//
// Everyone else gets NO assignment, and therefore no FMS access. That is the
// intended outcome: teachers, students and parents have no business in the
// ledger, and deny-by-default means we do not have to enumerate them.
//
// Per-user permission overrides are left empty — the role default from
// permissionMatrix.js applies. Overrides are set later through the UI.
//
// This migration READS the SMS `users` collection. Reads are permitted; the
// runner's guard is on writes, and every write here is to fms_roleassignments.

const SMS_TO_FMS = {
  superAdmin: 'chairman',
  schoolAdmin: 'principal',
  accountant: 'accountant',
};

module.exports = {
  id: '006_seed_role_assignments',
  description: 'Map existing SMS admin users to FMS finance roles',

  collections: ['fms_roleassignments'],

  async up(db) {
    const school = await db.collection('schools').findOne({});
    if (!school) throw new Error('No school document found — cannot scope FMS data.');

    const users = await db.collection('users')
      .find({ role: { $in: Object.keys(SMS_TO_FMS) }, isActive: { $ne: false } })
      .project({ _id: 1, email: 1, role: 1, school: 1 })
      .toArray();

    if (!users.length) {
      throw new Error(
        'No superAdmin/schoolAdmin/accountant users found. ' +
        'At least one is required or nobody can access the FMS.'
      );
    }

    const now = new Date();
    let created = 0;

    for (const u of users) {
      const financeRole = SMS_TO_FMS[u.role];
      const res = await db.collection('fms_roleassignments').updateOne(
        { school: u.school || school._id, smsUserId: u._id },
        {
          $setOnInsert: {
            school: u.school || school._id,
            smsUserId: u._id,
            smsUserEmail: u.email,
            financeRole,
            permissions: {},        // empty = use the role default
            multiBranch: financeRole === 'chairman',
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
      if (res.upsertedCount) created += 1;
    }

    console.log(`   ${created} role assignment(s) created, ${users.length - created} already present`);
  },

  async down(db) {
    await db.collection('fms_roleassignments').deleteMany({});
  },
};