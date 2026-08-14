// 006 — assign FMS finance roles to named individuals.
//
// ─── WHY AN EXPLICIT LIST, NOT A ROLE MAPPING ────────────────────────────────
//
// Data Dictionary §1 suggests mapping SMS roles to FMS roles
// (schoolAdmin → principal, accountant → accountant, superAdmin → chairman).
// Applied to this deployment that produced ELEVEN principals, because
// `schoolAdmin` here means "staff member who needs admin access to the school
// portal", not "person authorised to approve expenditure". Most of them are
// teaching staff.
//
// It also produced no chairman and no accountant, because this SMS has no
// superAdmin and no accountant accounts at all. The result was a flat finance
// hierarchy — eleven equal top-level approvers, which makes separation of
// duties meaningless, since any two of them satisfy maker-checker.
//
// Access to a ledger is a decision about people, not a side effect of a role
// someone was given for an unrelated reason. So it is enumerated here, where
// changing it is deliberate, reviewable and version-controlled.
//
// Everyone omitted keeps full SMS access. Nothing about their day changes —
// they simply have no FMS role, and deny-by-default returns 403 on /api/fms/*.
//
// ─── EDIT THIS LIST ──────────────────────────────────────────────────────────
// Roles: chairman, trustee, principal, vicePrincipal, accountsManager,
//        accountant, cashier, purchaseOfficer, deptHead, teacher, auditor,
//        readOnly
// See fms/services/auth/permissionMatrix.js for what each can do.

const ASSIGNMENTS = [
  {
    email: 'vijayborse@gmail.com',
    financeRole: 'chairman',
    multiBranch: true,
    note: 'System owner. Full access including financial-year close.',
  },
  {
    email: 'pratikshashep0308@gmail.com',
    financeRole: 'principal',
    multiBranch: false,
    note: 'School administrator. Approves expenditure and budgets.',
  },

  // Add whoever actually keeps the books, once appointed:
  // {
  //   email: 'accounts@thefuturestepschool.in',
  //   financeRole: 'accountant',
  //   multiBranch: false,
  //   note: 'Creates vouchers and postings. Cannot approve own work.',
  // },
];

module.exports = {
  id: '006_seed_role_assignments',
  description: 'Assign FMS finance roles to named individuals',

  collections: ['fms_roleassignments'],

  // Independent of the Chart of Accounts — declared so a blocked 005 does not
  // hold this back.
  dependsOn: ['001_core_collections'],

  async up(db) {
    const school = await db.collection('schools').findOne({});
    if (!school) throw new Error('No school document found — cannot scope FMS data.');

    if (!ASSIGNMENTS.length) {
      throw new Error('ASSIGNMENTS is empty — nobody would be able to access the FMS.');
    }

    const now = new Date();
    const missing = [];
    let created = 0;

    for (const a of ASSIGNMENTS) {
      const user = await db.collection('users').findOne(
        { email: a.email },
        { projection: { _id: 1, email: 1, school: 1, isActive: 1 } }
      );

      if (!user) { missing.push(a.email); continue; }
      if (user.isActive === false) {
        throw new Error(`${a.email} is deactivated in the SMS — refusing to grant FMS access.`);
      }

      const res = await db.collection('fms_roleassignments').updateOne(
        { school: user.school || school._id, smsUserId: user._id },
        {
          $set: {
            financeRole: a.financeRole,
            multiBranch: !!a.multiBranch,
            smsUserEmail: user.email,
            status: 'active',
            updatedAt: now,
          },
          $setOnInsert: {
            school: user.school || school._id,
            smsUserId: user._id,
            permissions: {},          // empty = role default from permissionMatrix
            createdAt: now,
          },
        },
        { upsert: true }
      );
      if (res.upsertedCount) created += 1;
      console.log(`   ${a.email} → ${a.financeRole}`);
    }

    if (missing.length) {
      throw new Error(
        `Not SMS users: ${missing.join(', ')}. ` +
        'Correct ASSIGNMENTS in this migration, or create the accounts first.'
      );
    }

    if (!ASSIGNMENTS.some((a) => a.financeRole === 'chairman')) {
      console.log('   ⚠  No chairman assigned — nobody can close or reopen a financial year.');
    }
    if (!ASSIGNMENTS.some((a) => a.financeRole === 'accountant')) {
      console.log('   ⚠  No accountant assigned — separation of duties is not yet meaningful.');
    }

    console.log(`   ${created} created, ${ASSIGNMENTS.length - created} updated`);
  },

  async down(db) {
    await db.collection('fms_roleassignments').deleteMany({});
  },
};