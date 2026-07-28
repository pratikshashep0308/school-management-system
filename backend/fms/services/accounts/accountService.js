// backend/fms/services/accounts/accountService.js
//
// Chart of Accounts business rules.
//
// Routes stay thin; everything that could corrupt the books lives here.
//
// ─── THE RULES THAT MATTER ───────────────────────────────────────────────────
//  1. An account with ledger entries can never be deleted — only deactivated.
//     Deleting it would orphan every posting that references it and make the
//     trial balance unexplainable.
//  2. accountType and normalBalance become immutable once postings exist.
//     Flipping an income head to an expense head after the fact would silently
//     invert every report that reads it.
//  3. accountCode is immutable once postings exist, because fms_ledgerentries
//     denormalises it as a snapshot. Changing it would leave history showing
//     the old code and the account showing the new one.
//  4. A group with children (groups or accounts) cannot be deleted.
//  5. Group hierarchies cannot contain cycles.

const mongoose = require('mongoose');
const {
  FmsAccount, FmsAccountGroup, FmsLedgerEntry, FmsAuditTrail,
} = require('../../models/core');
const { errors } = require('../../utils/apiResponse');

const ACCOUNT_TYPES = ['asset', 'liability', 'income', 'expense', 'equity'];
const NORMAL_BALANCE = ['debit', 'credit'];

/** Conventional normal balance for each type. Used to warn, not to force. */
const CONVENTIONAL_BALANCE = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  income: 'credit',
  equity: 'credit',
};

// ─────────────────────────────────────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────────────────────────────────────

async function audit({ school, entity, entityId, action, before, after, req }) {
  await FmsAuditTrail.create({
    school,
    entity,
    entityId,
    action,
    before,
    after,
    actor: req?.user?._id,
    actorEmail: req?.user?.email,
    actorRole: req?.fmsRole,
    ipAddress: req?.ip,
    userAgent: req?.get?.('user-agent'),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Account groups
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Walk up from `parentId` looking for `selfId`. A group cannot be its own
 * ancestor; without this check a UI mistake could make the tree unrenderable
 * and every recursive query hang.
 */
async function wouldCycle(school, selfId, parentId) {
  let cursor = parentId;
  const seen = new Set();

  while (cursor) {
    const key = String(cursor);
    if (selfId && key === String(selfId)) return true;
    if (seen.has(key)) return true;               // pre-existing cycle
    seen.add(key);

    const doc = await FmsAccountGroup
      .findOne({ _id: cursor, school })
      .select('parent')
      .lean();
    if (!doc) return false;
    cursor = doc.parent;
  }
  return false;
}

async function createGroup(school, payload, req) {
  const { groupCode, groupName, accountType, normalBalance, parent } = payload;

  let level = 1;
  if (parent) {
    const p = await FmsAccountGroup.findOne({ _id: parent, school }).lean();
    if (!p) throw errors.validation('Validation failed', { parent: 'parent group not found' });
    if (p.accountType !== accountType) {
      throw errors.validation('Validation failed', {
        accountType: `must match the parent group's type ('${p.accountType}')`,
      });
    }
    level = (p.level || 1) + 1;
  }

  const existing = await FmsAccountGroup.findOne({ school, groupCode }).lean();
  if (existing) throw errors.conflict(`Group code '${groupCode}' already exists`);

  const doc = await FmsAccountGroup.create({
    school,
    groupCode,
    groupName,
    accountType,
    normalBalance: normalBalance || CONVENTIONAL_BALANCE[accountType],
    parent: parent || null,
    level,
    isSystem: false,
    status: 'active',
    createdBy: req?.user?._id,
  });

  await audit({
    school, entity: 'fms_accountgroups', entityId: doc._id,
    action: 'create', after: doc.toObject(), req,
  });

  return doc;
}

async function updateGroup(school, id, payload, req) {
  const doc = await FmsAccountGroup.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Account group');

  const before = doc.toObject();

  if (payload.parent !== undefined) {
    if (payload.parent && await wouldCycle(school, id, payload.parent)) {
      throw errors.validation('Validation failed', {
        parent: 'would create a cycle in the group hierarchy',
      });
    }
    doc.parent = payload.parent || null;

    if (doc.parent) {
      const p = await FmsAccountGroup.findOne({ _id: doc.parent, school }).select('level').lean();
      doc.level = (p?.level || 1) + 1;
    } else {
      doc.level = 1;
    }
  }

  if (payload.groupName !== undefined) doc.groupName = payload.groupName;
  if (payload.status !== undefined) doc.status = payload.status;

  // groupCode and accountType are not editable — accounts reference this group,
  // and changing its type would silently reclassify all of them.

  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({
    school, entity: 'fms_accountgroups', entityId: doc._id,
    action: 'update', before, after: doc.toObject(), req,
  });

  return doc;
}

async function deleteGroup(school, id, req) {
  const doc = await FmsAccountGroup.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Account group');

  if (doc.isSystem) {
    throw errors.conflict('System groups cannot be deleted', { hint: 'Deactivate it instead.' });
  }

  const [childGroups, childAccounts] = await Promise.all([
    FmsAccountGroup.countDocuments({ school, parent: id }),
    FmsAccount.countDocuments({ school, accountGroup: id }),
  ]);

  if (childGroups || childAccounts) {
    throw errors.conflict(
      'Group is not empty',
      { childGroups, childAccounts, hint: 'Move or remove its children first, or deactivate the group.' }
    );
  }

  await audit({
    school, entity: 'fms_accountgroups', entityId: doc._id,
    action: 'cancel', before: doc.toObject(), req,
  });

  await FmsAccountGroup.deleteOne({ _id: id, school });
  return { deleted: true };
}

/** Nested tree for the SCR-08 sidebar. */
async function groupTree(school) {
  const groups = await FmsAccountGroup
    .find({ school })
    .select('_id groupCode groupName accountType normalBalance parent level status')
    .sort({ groupCode: 1 })
    .lean();

  const byId = new Map(groups.map((g) => [String(g._id), { ...g, children: [] }]));
  const roots = [];

  for (const g of byId.values()) {
    if (g.parent && byId.has(String(g.parent))) {
      byId.get(String(g.parent)).children.push(g);
    } else {
      roots.push(g);
    }
  }
  return roots;
}

// ─────────────────────────────────────────────────────────────────────────────
// Accounts
// ─────────────────────────────────────────────────────────────────────────────

/** How many ledger entries reference this account. The delete guard's basis. */
async function postingCount(accountId) {
  return FmsLedgerEntry.countDocuments({ account: accountId });
}

async function createAccount(school, payload, req) {
  const {
    accountCode, accountName, accountGroup, isPostable,
    isBankAccount, isCashAccount, openingBalance, smsFeeTypeId, smsExpenseCategoryId,
  } = payload;

  const group = await FmsAccountGroup.findOne({ _id: accountGroup, school }).lean();
  if (!group) {
    throw errors.validation('Validation failed', { accountGroup: 'group not found' });
  }

  const existing = await FmsAccount.findOne({ school, accountCode }).lean();
  if (existing) throw errors.conflict(`Account code '${accountCode}' already exists`);

  // Type and normal balance are INHERITED from the group, never supplied by the
  // caller. Letting a client set them independently is how an income head ends
  // up inside the expense tree.
  const doc = await FmsAccount.create({
    school,
    accountCode,
    accountName,
    accountGroup,
    accountType: group.accountType,
    normalBalance: group.normalBalance,
    isPostable: isPostable !== false,
    isBankAccount: !!isBankAccount,
    isCashAccount: !!isCashAccount,
    openingBalance: openingBalance || 0,
    currentBalance: 0,
    smsFeeTypeId: smsFeeTypeId || null,
    smsExpenseCategoryId: smsExpenseCategoryId || null,
    status: 'active',
    createdBy: req?.user?._id,
  });

  await audit({
    school, entity: 'fms_accounts', entityId: doc._id,
    action: 'create', after: doc.toObject(), req,
  });

  return doc;
}

async function updateAccount(school, id, payload, req) {
  const doc = await FmsAccount.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Account');

  const before = doc.toObject();
  const posted = await postingCount(id);

  // Once an account carries postings, its identity is frozen. History
  // references it by code and interprets it by type.
  if (posted > 0) {
    const frozen = [];
    if (payload.accountCode && payload.accountCode !== doc.accountCode) frozen.push('accountCode');
    if (payload.accountGroup && String(payload.accountGroup) !== String(doc.accountGroup)) {
      frozen.push('accountGroup');
    }
    if (payload.openingBalance !== undefined && payload.openingBalance !== doc.openingBalance) {
      frozen.push('openingBalance');
    }
    if (frozen.length) {
      throw errors.conflict(
        `Cannot change ${frozen.join(', ')} — this account has ${posted} ledger entries`,
        { postings: posted, frozen, hint: 'Create a new account and deactivate this one.' }
      );
    }
  }

  if (payload.accountCode !== undefined && posted === 0) {
    const clash = await FmsAccount
      .findOne({ school, accountCode: payload.accountCode, _id: { $ne: id } })
      .lean();
    if (clash) throw errors.conflict(`Account code '${payload.accountCode}' already exists`);
    doc.accountCode = payload.accountCode;
  }

  if (payload.accountGroup !== undefined && posted === 0) {
    const group = await FmsAccountGroup.findOne({ _id: payload.accountGroup, school }).lean();
    if (!group) throw errors.validation('Validation failed', { accountGroup: 'group not found' });
    doc.accountGroup = group._id;
    doc.accountType = group.accountType;
    doc.normalBalance = group.normalBalance;
  }

  if (payload.accountName !== undefined) doc.accountName = payload.accountName;
  if (payload.isPostable !== undefined) doc.isPostable = payload.isPostable;
  if (payload.isBankAccount !== undefined) doc.isBankAccount = payload.isBankAccount;
  if (payload.isCashAccount !== undefined) doc.isCashAccount = payload.isCashAccount;
  if (payload.openingBalance !== undefined && posted === 0) {
    doc.openingBalance = payload.openingBalance;
  }
  if (payload.smsFeeTypeId !== undefined) doc.smsFeeTypeId = payload.smsFeeTypeId || null;
  if (payload.smsExpenseCategoryId !== undefined) {
    doc.smsExpenseCategoryId = payload.smsExpenseCategoryId || null;
  }
  if (payload.status !== undefined) doc.status = payload.status;

  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({
    school, entity: 'fms_accounts', entityId: doc._id,
    action: 'update', before, after: doc.toObject(), req,
  });

  return doc;
}

/**
 * Delete — but only ever for an account that has never been posted to.
 * Anything else is deactivated instead, and the caller is told why.
 */
async function removeAccount(school, id, req) {
  const doc = await FmsAccount.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Account');

  const posted = await postingCount(id);

  if (posted > 0) {
    throw errors.conflict(
      `Account ${doc.accountCode} has ${posted} ledger entries and cannot be deleted`,
      {
        postings: posted,
        hint: 'Deactivate it instead: PATCH with { "status": "inactive" }. ' +
              'Inactive accounts reject new postings but keep their history.',
      }
    );
  }

  await audit({
    school, entity: 'fms_accounts', entityId: doc._id,
    action: 'cancel', before: doc.toObject(), req,
  });

  await FmsAccount.deleteOne({ _id: id, school });
  return { deleted: true, accountCode: doc.accountCode };
}

/**
 * Balance recomputed from the ledger, alongside the cached value.
 *
 * NOTE: `currentBalance` reflects LEDGER POSTINGS ONLY. `openingBalance` is
 * stored but not posted — opening balances become real when a financial-year
 * opening journal is posted (fms_financialyears.openingBalancesPosted). Adding
 * them here would double-count once that journal exists.
 */
async function balance(school, id) {
  const doc = await FmsAccount.findOne({ _id: id, school }).lean();
  if (!doc) throw errors.notFound('Account');

  const [agg] = await FmsLedgerEntry.aggregate([
    { $match: { account: new mongoose.Types.ObjectId(String(id)) } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, entries: { $sum: 1 } } },
  ]);

  const debit = agg?.debit || 0;
  const credit = agg?.credit || 0;
  const computed = debit - credit;

  return {
    accountCode: doc.accountCode,
    accountName: doc.accountName,
    normalBalance: doc.normalBalance,
    openingBalance: doc.openingBalance,
    openingBalancePosted: false,
    totalDebit: debit,
    totalCredit: credit,
    currentBalance: computed,
    cachedBalance: doc.currentBalance,
    drift: doc.currentBalance - computed,
    entries: agg?.entries || 0,
  };
}

module.exports = {
  ACCOUNT_TYPES,
  NORMAL_BALANCE,
  CONVENTIONAL_BALANCE,
  createGroup, updateGroup, deleteGroup, groupTree,
  createAccount, updateAccount, removeAccount, balance,
  postingCount, wouldCycle,
};