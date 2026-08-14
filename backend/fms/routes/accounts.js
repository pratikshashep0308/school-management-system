// backend/fms/routes/accounts.js
//
// Chart of Accounts — SRS M2 / FR-M2, screens SCR-08 (list), SCR-09 (group),
// SCR-10 (account head).
//
// RBAC note: the permission matrix (derived from SRS §9.10) gives `edit` on
// `accounts` to accountsManager only. The P2.1 prompt says
// "ACCOUNTS_MGR/ACCOUNTANT manage", which disagrees with the SRS table.
// The matrix wins here because it is what is implemented and tested; a specific
// accountant can be granted management rights with a per-user override:
//
//     db.fms_roleassignments.updateOne(
//       { smsUserEmail: '…' },
//       { $set: { 'permissions.accounts': 'edit' } })

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const { FmsAccount, FmsAccountGroup } = require('../models/core');
const svc = require('../services/accounts/accountService');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

const GROUP_FIELDS = '_id groupCode groupName accountType normalBalance parent level isSystem status';
const ACCOUNT_FIELDS =
  '_id accountCode accountName accountGroup accountType normalBalance isPostable ' +
  'isBankAccount isCashAccount openingBalance currentBalance smsFeeTypeId ' +
  'smsExpenseCategoryId status createdAt updatedAt';

const GROUP_SORT = ['groupCode', 'groupName', 'accountType', 'level', 'createdAt'];
const ACCOUNT_SORT = ['accountCode', 'accountName', 'accountType', 'currentBalance', 'createdAt'];

// Codes are the primary key of the whole chart. Constrain the shape now:
// loosening a format later is easy, tightening it after data exists is not.
const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;
const codeRule = (v) =>
  CODE.test(String(v))
    ? null
    : 'must be 1-20 chars: letters, digits, dot, underscore or hyphen; cannot start with punctuation';

// ─────────────────────────────────────────────────────────────────────────────
// Account groups
// ─────────────────────────────────────────────────────────────────────────────

router.get('/groups/tree', fmsAuthorize('accounts', 'VIEW'), asyncHandler(async (req, res) => {
  return ok(res, await svc.groupTree(req.fmsScope.school));
}));

router.get('/groups', fmsAuthorize('accounts', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: GROUP_SORT, defaultSort: 'groupCode',
  });

  const filter = { school: req.fmsScope.school };
  if (req.query.accountType) {
    if (!svc.ACCOUNT_TYPES.includes(req.query.accountType)) {
      throw errors.badRequest(`Unknown accountType '${req.query.accountType}'`,
        { allowed: svc.ACCOUNT_TYPES });
    }
    filter.accountType = req.query.accountType;
  }
  if (req.query.parent) filter.parent = req.query.parent;

  const [items, total] = await Promise.all([
    FmsAccountGroup.find(filter).select(GROUP_FIELDS).sort(sort).skip(skip).limit(limit).lean(),
    FmsAccountGroup.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
}));

router.get('/groups/:id', fmsAuthorize('accounts', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsAccountGroup
    .findOne({ _id: req.params.id, school: req.fmsScope.school })
    .select(GROUP_FIELDS).lean();
  if (!doc) throw errors.notFound('Account group');
  return ok(res, doc);
}));

router.post('/groups', fmsAuthorize('accounts', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    groupCode: { required: true, rules: [check.nonEmpty, codeRule] },
    groupName: { required: true, rules: [check.nonEmpty] },
    accountType: { required: true, rules: [check.enumOf(svc.ACCOUNT_TYPES)] },
    normalBalance: { rules: [check.enumOf(svc.NORMAL_BALANCE)] },
    parent: { rules: [check.objectId] },
  });

  const doc = await svc.createGroup(req.fmsScope.school, req.body, req);
  return created(res, doc, 'Account group created');
}));

router.patch('/groups/:id', fmsAuthorize('accounts', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    groupName: { rules: [check.nonEmpty] },
    parent: { rules: [check.objectId] },
    status: { rules: [check.enumOf(['active', 'inactive', 'archived'])] },
  });

  const doc = await svc.updateGroup(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, doc, { message: 'Account group updated' });
}));

router.delete('/groups/:id', fmsAuthorize('accounts', 'DELETE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  return ok(res, await svc.deleteGroup(req.fmsScope.school, req.params.id, req),
    { message: 'Account group deleted' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// Accounts
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', fmsAuthorize('accounts', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: ACCOUNT_SORT, defaultSort: 'accountCode',
  });

  const filter = { school: req.fmsScope.school };

  if (req.query.accountType) {
    if (!svc.ACCOUNT_TYPES.includes(req.query.accountType)) {
      throw errors.badRequest(`Unknown accountType '${req.query.accountType}'`,
        { allowed: svc.ACCOUNT_TYPES });
    }
    filter.accountType = req.query.accountType;
  }
  if (req.query.accountGroup) {
    if (check.objectId(req.query.accountGroup)) throw errors.badRequest('Invalid accountGroup id');
    filter.accountGroup = req.query.accountGroup;
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.isPostable !== undefined) filter.isPostable = req.query.isPostable === 'true';
  if (req.query.isBankAccount !== undefined) filter.isBankAccount = req.query.isBankAccount === 'true';

  if (req.query.q) {
    // Escaped — an unescaped user string in a regex is a denial-of-service.
    const safe = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { accountCode: new RegExp(safe, 'i') },
      { accountName: new RegExp(safe, 'i') },
    ];
  }

  const [items, total] = await Promise.all([
    FmsAccount.find(filter).select(ACCOUNT_FIELDS).sort(sort).skip(skip).limit(limit).lean(),
    FmsAccount.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
}));

router.get('/:id', fmsAuthorize('accounts', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsAccount
    .findOne({ _id: req.params.id, school: req.fmsScope.school })
    .select(ACCOUNT_FIELDS).lean();
  if (!doc) throw errors.notFound('Account');
  return ok(res, doc);
}));

router.get('/:id/balance', fmsAuthorize('accounts', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  return ok(res, await svc.balance(req.fmsScope.school, req.params.id));
}));

router.post('/', fmsAuthorize('accounts', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    accountCode: { required: true, rules: [check.nonEmpty, codeRule] },
    accountName: { required: true, rules: [check.nonEmpty] },
    accountGroup: { required: true, rules: [check.objectId] },
    isPostable: { rules: [check.boolean] },
    isBankAccount: { rules: [check.boolean] },
    isCashAccount: { rules: [check.boolean] },
    // Integer paise. A float here means someone passed rupees.
    openingBalance: { rules: [check.integer] },
    smsFeeTypeId: { rules: [check.objectId] },
    smsExpenseCategoryId: { rules: [check.objectId] },
  });

  const doc = await svc.createAccount(req.fmsScope.school, req.body, req);
  return created(res, doc, 'Account created');
}));

router.patch('/:id', fmsAuthorize('accounts', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    accountCode: { rules: [check.nonEmpty, codeRule] },
    accountName: { rules: [check.nonEmpty] },
    accountGroup: { rules: [check.objectId] },
    isPostable: { rules: [check.boolean] },
    isBankAccount: { rules: [check.boolean] },
    isCashAccount: { rules: [check.boolean] },
    openingBalance: { rules: [check.integer] },
    smsFeeTypeId: { rules: [check.objectId] },
    smsExpenseCategoryId: { rules: [check.objectId] },
    status: { rules: [check.enumOf(['active', 'inactive', 'archived'])] },
  });

  const doc = await svc.updateAccount(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, doc, { message: 'Account updated' });
}));

/**
 * DELETE only succeeds for an account that has never been posted to.
 * Otherwise 409 with the posting count and instructions to deactivate.
 */
router.delete('/:id', fmsAuthorize('accounts', 'DELETE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  return ok(res, await svc.removeAccount(req.fmsScope.school, req.params.id, req),
    { message: 'Account deleted' });
}));

module.exports = router;