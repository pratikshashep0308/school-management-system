// backend/fms/services/expense/categoryService.js
//
// Managing the expense category master.
//
// Every rule below refuses something. That is deliberate: this collection
// decides which account an expense lands in, and a category master that lets
// you point at a non-postable account, delete something the ledger references,
// or silently reclassify history is worse than the free-text field it replaces.

const mongoose = require('mongoose');

const audit = require('../audit/auditService');
const { FmsExpenseCategory } = require('../../models/expense/category');
const { FmsAccount, FmsLedgerEntry } = require('../../models/core');
const { FmsExpenseRequest } = require('../../models/expense');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Resolve and validate the account a category will post to.
 *
 * A reference alone proves nothing — an account can exist, be a group header,
 * or be deactivated. All three would fail at posting time, long after the
 * person who chose it has moved on.
 */
async function assertPostableAccount(school, accountId) {
  const account = await FmsAccount.findOne({
    _id: oid(accountId), school: oid(school),
  }).select('_id accountCode accountName isPostable status accountType').lean();

  if (!account) throw errors.notFound('Account');

  if (account.status !== 'active') {
    throw errors.badRequest(
      `Account ${account.accountCode} ${account.accountName} is deactivated`
    );
  }
  if (!account.isPostable) {
    throw errors.badRequest(
      `Account ${account.accountCode} ${account.accountName} is a group header and cannot receive postings`
    );
  }
  return account;
}

/** Categories, newest-relevant first. Returns everything — see the note. */
async function list(school, { status, parent } = {}) {
  const filter = { school: oid(school) };
  if (status) filter.status = status;
  if (parent !== undefined) filter.parent = parent === null ? null : oid(parent);

  // NOT paginated, deliberately, and this is a decision rather than an
  // oversight: a category master is tens of rows, and every caller wants all of
  // them for a picker. A default page size with unpaged callers is precisely
  // the bug that nearly imported 50 of 169 fee ledgers.
  return FmsExpenseCategory.find(filter).sort({ code: 1 }).lean();
}

async function get(school, id) {
  const doc = await FmsExpenseCategory.findOne({ _id: oid(id), school: oid(school) }).lean();
  if (!doc) throw errors.notFound('Expense category');

  const children = await FmsExpenseCategory.find({
    school: oid(school), parent: doc._id,
  }).sort({ code: 1 }).lean();

  return { ...doc, children };
}

/** Two-level tree, for pickers. */
async function tree(school) {
  const all = await FmsExpenseCategory.find({
    school: oid(school), status: 'active',
  }).sort({ code: 1 }).lean();

  const roots = all.filter((c) => !c.parent);
  return roots.map((r) => ({
    ...r,
    children: all.filter((c) => String(c.parent) === String(r._id)),
  }));
}

async function create(school, body, req) {
  const account = await assertPostableAccount(school, body.account);

  const doc = await FmsExpenseCategory.create({
    school: oid(school),
    code: String(body.code || '').trim().toUpperCase(),
    name: body.name,
    description: body.description,
    account: account._id,
    accountCode: account.accountCode,
    parent: body.parent ? oid(body.parent) : null,
    defaultCostCentre: body.defaultCostCentre || null,
    budgetHead: body.budgetHead ? oid(body.budgetHead) : null,
    requiresVendor: body.requiresVendor === true,
    requiresInvoice: body.requiresInvoice === true,
    colour: body.colour,
    icon: body.icon,
    smsCategoryId: body.smsCategoryId || null,
    createdBy: req?.user?._id,
  });

  await audit.record({
    school, entity: 'fms_expensecategories', entityId: doc._id, action: 'create',
    after: doc.toObject(), req,
    notes: `Expense category ${doc.code} → ${account.accountCode} ${account.accountName}`,
  });

  return doc;
}

/**
 * Has anything ever posted against this category?
 *
 * Used to refuse an account change. Checked against LEDGER ENTRIES rather than
 * expense requests, because the ledger is the record — a cancelled request is
 * not a posting, and a posting is what makes the reclassification dangerous.
 */
async function hasPostings(school, categoryId) {
  const count = await FmsLedgerEntry.countDocuments({
    school: oid(school), expenseCategory: oid(categoryId),
  });
  return count > 0;
}

async function update(school, id, body, req) {
  const before = await FmsExpenseCategory.findOne({ _id: oid(id), school: oid(school) });
  if (!before) throw errors.notFound('Expense category');

  const updates = {};

  if (body.account && String(body.account) !== String(before.account)) {
    // Changing the account once postings exist would silently reclassify
    // history: past entries stay where they were, future ones go elsewhere, and
    // the category no longer describes either. Correcting a classification is a
    // journal voucher, not a master-data edit.
    if (await hasPostings(school, before._id)) {
      throw errors.conflict(
        'This category already has postings against it — changing its account would '
        + 'split its history across two heads.',
        { hint: 'Create a new category, deactivate this one, and reclassify by journal voucher if needed.' }
      );
    }
    const account = await assertPostableAccount(school, body.account);
    updates.account = account._id;
    updates.accountCode = account.accountCode;
  }

  for (const f of ['name', 'description', 'defaultCostCentre', 'colour', 'icon', 'smsCategoryId']) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  for (const f of ['requiresVendor', 'requiresInvoice']) {
    if (body[f] !== undefined) updates[f] = body[f] === true;
  }
  if (body.parent !== undefined) {
    updates.parent = body.parent ? oid(body.parent) : null;
  }
  if (body.budgetHead !== undefined) {
    updates.budgetHead = body.budgetHead ? oid(body.budgetHead) : null;
  }

  if (Object.keys(updates).length === 0) {
    throw errors.badRequest('Nothing to change');
  }

  updates.updatedBy = req?.user?._id;

  // save(), not findByIdAndUpdate — the depth guard is a pre('save') hook and
  // an update query would bypass it entirely.
  Object.assign(before, updates);
  await before.save();

  await audit.record({
    school, entity: 'fms_expensecategories', entityId: before._id, action: 'update',
    after: before.toObject(), req,
    notes: `Expense category ${before.code} updated`,
  });

  return before;
}

/**
 * Deactivate.
 *
 * Refuses while anything live points at it, and NAMES what — a bare "in use"
 * message leaves somebody hunting through screens for a reference the system
 * already knows about.
 */
async function deactivate(school, id, req) {
  const doc = await FmsExpenseCategory.findOne({ _id: oid(id), school: oid(school) });
  if (!doc) throw errors.notFound('Expense category');
  if (doc.status === 'inactive') return doc;

  const blockers = [];

  // `categoryRef`, a flat field — NOT `category.ref`.
  //
  // `department` and `vendor` on the expense request use a {name, ref} shape,
  // and this originally followed them. Discovery found `category` is already a
  // REQUIRED String carrying live data: converting it to an object would fail
  // to cast on every existing request. So the reference goes in a sibling field
  // and the string stays authoritative until every request has a ref.
  const openRequests = await FmsExpenseRequest.find({
    school: oid(school),
    categoryRef: doc._id,
    expenseStatus: { $nin: ['paymentCompleted', 'closed', 'rejected', 'cancelled'] },
  }).select('expenseNumber expenseStatus').limit(20).lean();

  for (const r of openRequests) {
    blockers.push({ type: 'expenseRequest', ref: r.expenseNumber, status: r.expenseStatus });
  }

  // Recurring templates land in P6. Guarded here already so that stage cannot
  // introduce an orphan by forgetting to extend this check.
  if (mongoose.models.FmsRecurringExpense) {
    const templates = await mongoose.models.FmsRecurringExpense.find({
      school: oid(school), category: doc._id, isActive: true,
    }).select('name').limit(20).lean();
    for (const t of templates) blockers.push({ type: 'recurringTemplate', ref: t.name });
  }

  const children = await FmsExpenseCategory.find({
    school: oid(school), parent: doc._id, status: 'active',
  }).select('code').lean();
  for (const c of children) blockers.push({ type: 'childCategory', ref: c.code });

  if (blockers.length) {
    throw errors.conflict(
      `${doc.code} is still in use by ${blockers.length} item(s)`,
      { blockers }
    );
  }

  doc.status = 'inactive';
  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit.record({
    school, entity: 'fms_expensecategories', entityId: doc._id, action: 'cancel',
    before: { status: 'active' }, after: { status: 'inactive' }, req,
    notes: `Expense category ${doc.code} deactivated`,
  });

  return doc;
}

module.exports = {
  list, get, tree, create, update, deactivate,
  assertPostableAccount, hasPostings,
};