// backend/fms/services/access/accessService.js
//
// Who may see the books, and in what capacity.
//
// ─── WHY THIS IS SEPARATE FROM THE SMS ACCESS CONTROL SCREEN ─────────────────
// The SMS has its own role matrix (RolePermission) covering students, fees,
// library and the rest. The finance module is absent from it, and that is
// correct rather than an oversight.
//
// If finance access lived in the SMS matrix, switching FMS_ENABLED off would
// leave orphaned finance permissions scattered through SMS role documents, and
// the SMS would have to carry knowledge of FMS modules. That is coupling in
// exactly the direction the plugin design forbids — the toggle only stays clean
// while the SMS knows nothing about the FMS.
//
// So finance access is its own list, keyed by SMS user id, managed here.
// Granting somebody `accountant` in the SMS does not grant them anything in the
// books, and it should not: the SMS role says who collects fees at the counter,
// which is a different question from who may approve a payment voucher.
//
// ─── THE LOCKOUT GUARD ───────────────────────────────────────────────────────
// The last active chairman cannot be demoted or removed. Without that rule one
// wrong click leaves nobody able to grant finance access to anybody, ever — and
// because this screen is the only way to do it, the only recovery would be
// editing the database by hand. See `assertNotLastAdministrator`.

const mongoose = require('mongoose');

const audit = require('../audit/auditService');
const { FmsRoleAssignment } = require('../../models/core');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Roles that can administer finance access. Kept narrow: granting somebody the
 * ability to approve payments is a governance act, not an administrative one.
 */
const ADMIN_ROLES = ['chairman', 'trustee'];

/** Every finance role, with what it is actually for. */
const ROLE_CATALOGUE = [
  { role: 'chairman', label: 'Chairman',
    summary: 'Full visibility and final approval. Can grant finance access.' },
  { role: 'trustee', label: 'Trustee',
    summary: 'Governance oversight. Can grant finance access.' },
  { role: 'principal', label: 'Principal',
    summary: 'Sees everything, approves within limits. Does not run imports.' },
  { role: 'vicePrincipal', label: 'Vice Principal',
    summary: 'As principal, with lower approval limits.' },
  { role: 'accountsManager', label: 'Accounts Manager',
    summary: 'Runs the books day to day — imports, mappings, approvals.' },
  { role: 'accountant', label: 'Accountant',
    summary: 'Vouchers, receipts and payments. Runs imports.' },
  { role: 'cashier', label: 'Cashier',
    summary: 'Receipts and petty cash only.' },
  { role: 'purchaseOfficer', label: 'Purchase Officer',
    summary: 'Purchase requests, orders and goods receipts.' },
  { role: 'deptHead', label: 'Department Head',
    summary: 'Raises expense requests and sees their own budget.' },
  { role: 'teacher', label: 'Teacher',
    summary: 'Raises expense requests. Sees nothing else.' },
  { role: 'auditor', label: 'Auditor',
    summary: 'Reads everything, changes nothing.' },
  { role: 'readOnly', label: 'Read Only',
    summary: 'Reports and balances, no detail, no changes.' },
];

const VALID_ROLES = new Set(ROLE_CATALOGUE.map((r) => r.role));

/**
 * Everyone in the school, with the finance role they hold — including the many
 * who hold none.
 *
 * Showing only people who already have access would make it impossible to grant
 * access to anybody else, which is the main thing this screen is for.
 */
async function listUsers(school) {
  const User = mongoose.model('User');

  const [users, assignments] = await Promise.all([
    User.find({ school: oid(school) })
      .select('_id name email role isActive')
      .sort({ name: 1 })
      .lean(),
    FmsRoleAssignment.find({ school: oid(school) })
      .select('smsUserId financeRole status multiBranch updatedAt').lean(),
  ]);

  const byUser = new Map(assignments.map((a) => [String(a.smsUserId), a]));

  return users.map((u) => {
    const a = byUser.get(String(u._id));
    return {
      smsUserId: u._id,
      name: u.name,
      email: u.email,
      smsRole: u.role,
      smsActive: u.isActive !== false,
      financeRole: a && a.status === 'active' ? a.financeRole : null,
      financeStatus: a ? a.status : null,
      multiBranch: a?.multiBranch || false,
      changedAt: a?.updatedAt || null,
    };
  });
}

/**
 * Refuse to remove the last person who can grant finance access.
 *
 * @param {string} school
 * @param {string} smsUserId  the person about to lose administrator rights
 */
async function assertNotLastAdministrator(school, smsUserId) {
  const admins = await FmsRoleAssignment.find({
    school: oid(school),
    status: 'active',
    financeRole: { $in: ADMIN_ROLES },
  }).select('smsUserId financeRole').lean();

  const others = admins.filter((a) => String(a.smsUserId) !== String(smsUserId));
  if (others.length > 0) return;

  const isAdmin = admins.some((a) => String(a.smsUserId) === String(smsUserId));
  if (!isAdmin) return;   // they were not an administrator; nothing is being lost

  throw errors.conflict(
    'This is the only person who can grant finance access — removing it would '
    + 'leave nobody able to restore it.',
    {
      hint: 'Give somebody else the Chairman or Trustee role first, then change this one.',
    }
  );
}

/**
 * Grant or change a finance role.
 *
 * Upserts: one assignment per person per school, and changing a role is the
 * same operation as granting one.
 */
async function assign(school, smsUserId, financeRole, { multiBranch = false } = {}, req) {
  if (!VALID_ROLES.has(financeRole)) {
    throw errors.badRequest(`'${financeRole}' is not a finance role`, {
      valid: [...VALID_ROLES],
    });
  }

  const User = mongoose.model('User');
  const user = await User.findOne({ _id: oid(smsUserId), school: oid(school) })
    .select('_id name email isActive').lean();
  if (!user) throw errors.notFound('User');

  if (user.isActive === false) {
    // Granting finance access to a deactivated account creates a dormant way in
    // that nobody is watching.
    throw errors.conflict(
      `${user.name} is deactivated in the school system — refusing to grant finance access.`,
      { hint: 'Reactivate the account first if this person still works here.' }
    );
  }

  const before = await FmsRoleAssignment.findOne({
    school: oid(school), smsUserId: oid(smsUserId),
  }).lean();

  // Losing administrator rights counts whether by demotion or removal.
  const wasAdmin = before?.status === 'active' && ADMIN_ROLES.includes(before.financeRole);
  const willBeAdmin = ADMIN_ROLES.includes(financeRole);
  if (wasAdmin && !willBeAdmin) {
    await assertNotLastAdministrator(school, smsUserId);
  }

  const after = await FmsRoleAssignment.findOneAndUpdate(
    { school: oid(school), smsUserId: oid(smsUserId) },
    {
      $set: {
        financeRole,
        multiBranch,
        status: 'active',
        smsUserEmail: user.email,
        updatedBy: req?.user?._id,
      },
      $setOnInsert: {
        school: oid(school),
        smsUserId: oid(smsUserId),
        createdBy: req?.user?._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  await audit.record({
    school,
    entity: 'fms_roleassignments',
    entityId: after._id,
    action: before ? 'update' : 'create',
    before: before ? { financeRole: before.financeRole, status: before.status } : null,
    after: { financeRole: after.financeRole, status: after.status },
    req,
    notes: before
      ? `Finance role for ${user.email} changed from ${before.financeRole} to ${financeRole}`
      : `${user.email} granted finance role ${financeRole}`,
  });

  return after;
}

/**
 * Withdraw finance access.
 *
 * Deactivates rather than deletes. The row is the record that this person once
 * had access, which is exactly what an auditor asks about after the fact.
 */
async function revoke(school, smsUserId, req) {
  const before = await FmsRoleAssignment.findOne({
    school: oid(school), smsUserId: oid(smsUserId),
  }).lean();

  if (!before || before.status !== 'active') {
    throw errors.notFound('Finance access for this user');
  }

  await assertNotLastAdministrator(school, smsUserId);

  const after = await FmsRoleAssignment.findOneAndUpdate(
    { _id: before._id },
    { $set: { status: 'inactive', updatedBy: req?.user?._id } },
    { new: true }
  ).lean();

  await audit.record({
    school,
    entity: 'fms_roleassignments',
    entityId: before._id,
    action: 'deactivate',
    before: { financeRole: before.financeRole, status: before.status },
    after: { financeRole: after.financeRole, status: after.status },
    req,
    notes: `Finance access withdrawn from ${before.smsUserEmail || smsUserId}`,
  });

  return after;
}

module.exports = {
  listUsers, assign, revoke, assertNotLastAdministrator,
  ROLE_CATALOGUE, ADMIN_ROLES, VALID_ROLES,
};
