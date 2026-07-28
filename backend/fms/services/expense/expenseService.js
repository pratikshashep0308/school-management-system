// backend/fms/services/expense/expenseService.js
//
// Expense Management. SRS M4 / FR-M4, screens SCR-14/15/16/17.
//
// P3.2 covers creation, editing, submission and cancellation. The approval
// chain is P3.3; payment and the GL posting are P3.4.
//
// Nothing here touches the ledger. An expense request is a request — no money
// has moved.

const mongoose = require('mongoose');
const {
  FmsAccount, FmsFinancialYear, FmsNumberSequence, FmsAuditTrail,
} = require('../../models/core');
const { FmsExpenseRequest } = require('../../models/expense');
const { errors } = require('../../utils/apiResponse');

const LOCKED_FY = ['closed', 'locked'];
const EDITABLE = ['draft', 'returned', 'rejected'];

/**
 * Warn at this fraction of the budget. Configurable per school in fms_settings
 * once P4.1 lands; a constant until there is a budget to threshold against.
 */
const WARN_AT = 0.9;

async function audit({ school, doc, action, before, after, req }) {
  await FmsAuditTrail.create({
    school,
    entity: 'fms_expenserequests',
    entityId: doc?._id,
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

function step(req, action, fromStatus, toStatus, comment) {
  return {
    action,
    actor: req?.user?._id,
    actorEmail: req?.user?.email,
    actorRole: req?.fmsRole,
    comment,
    fromStatus,
    toStatus,
    at: new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget availability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check a request against its budget head.
 *
 * ⚠️ fms_budgets does not exist until P4.1. When it is absent this returns
 * `{ checked: false, outcome: 'notChecked' }` — NOT `ok`.
 *
 * That distinction is the whole point. Returning "ok" when nobody looked would
 * let every unbudgeted request pass a control that was never actually applied,
 * and the records would later read as though it had been.
 */
async function checkBudget(school, budgetHead, financialYear, amount) {
  const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);

  if (!names.includes('fms_budgets')) {
    return {
      checked: false,
      outcome: 'notChecked',
      reason: 'Budget module not yet installed (P4.1) — no budget was consulted',
      checkedAt: new Date(),
    };
  }

  const budget = await mongoose.connection.db.collection('fms_budgets').findOne({
    school: new mongoose.Types.ObjectId(String(school)),
    account: new mongoose.Types.ObjectId(String(budgetHead)),
    financialYear: new mongoose.Types.ObjectId(String(financialYear)),
    budgetStatus: { $in: ['active', 'revised'] },
  });

  if (!budget) {
    return {
      checked: false,
      outcome: 'notChecked',
      reason: 'No active budget is set for this head',
      checkedAt: new Date(),
    };
  }

  const budgetAmount = budget.revisedBudget ?? budget.budgetAmount ?? 0;

  // Committed = everything already asked for and not rejected/cancelled.
  // Counting only paid spend would let ten pending requests each pass a check
  // that they collectively blow.
  const [committed] = await FmsExpenseRequest.aggregate([
    {
      $match: {
        school: new mongoose.Types.ObjectId(String(school)),
        budgetHead: new mongoose.Types.ObjectId(String(budgetHead)),
        financialYear: new mongoose.Types.ObjectId(String(financialYear)),
        expenseStatus: { $nin: ['draft', 'rejected', 'cancelled'] },
      },
    },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } },
  ]);

  const consumed = committed?.total || 0;
  const available = budgetAmount - consumed;

  let outcome = 'ok';
  let reason;
  if (amount > available) {
    outcome = 'exceeded';
    reason = `Request of ${amount} exceeds the available balance of ${available}`;
  } else if (consumed + amount > budgetAmount * WARN_AT) {
    outcome = 'warning';
    reason = `This request takes the head past ${Math.round(WARN_AT * 100)}% of its budget`;
  }

  return {
    checked: true, outcome, reason,
    budgetAmount, consumed, available,
    checkedAt: new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Create / update
// ─────────────────────────────────────────────────────────────────────────────

async function validateHead(school, budgetHead) {
  const acct = await FmsAccount.findOne({ _id: budgetHead, school }).lean();
  if (!acct) throw errors.validation('Validation failed', { budgetHead: 'account not found' });

  // Spending must be charged to an expense head. Charging it to an income or
  // asset head balances arithmetically and is nonsense in every report.
  if (acct.accountType !== 'expense') {
    throw errors.validation('Validation failed', {
      budgetHead: `${acct.accountCode} is an ${acct.accountType} account — expenses must be charged to an expense head`,
    });
  }
  if (!acct.isPostable) {
    throw errors.validation('Validation failed', {
      budgetHead: `${acct.accountCode} is a grouping head, not postable`,
    });
  }
  if (acct.status !== 'active') {
    throw errors.validation('Validation failed', { budgetHead: `${acct.accountCode} is ${acct.status}` });
  }
  return acct;
}

async function resolveFy(school, date) {
  const fy = await FmsFinancialYear.findOne({
    school, startDate: { $lte: date }, endDate: { $gte: date },
  }).lean();
  if (!fy) {
    throw errors.validation('Validation failed', {
      requestDate: `no financial year covers ${date.toISOString().slice(0, 10)}`,
    });
  }
  if (LOCKED_FY.includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year ${fy.yearCode} is ${fy.fyStatus}`);
  }
  return fy;
}

/**
 * Create a draft.
 *
 * The expense number is allocated in the same transaction as the document, so
 * a failed create consumes no number and the sequence stays gapless.
 */
async function create(school, payload, req) {
  const date = new Date(payload.requestDate);
  if (Number.isNaN(date.getTime())) {
    throw errors.validation('Validation failed', { requestDate: 'must be a valid date' });
  }

  const fy = await resolveFy(school, date);
  const head = await validateHead(school, payload.budgetHead);

  const session = await mongoose.startSession();
  let doc;

  try {
    await session.withTransaction(async () => {
      const expenseNumber = await FmsNumberSequence.next(
        school, fy._id, 'EXP', 'EXP', fy.yearCode, session
      );

      const [created] = await FmsExpenseRequest.create([{
        school,
        financialYear: fy._id,
        expenseNumber,
        requestDate: date,
        department: {
          name: payload.department?.name || payload.departmentName,
          ref: payload.department?.ref || null,
        },
        requestedBy: payload.requestedBy || req?.user?._id,
        requestedByName: payload.requestedByName || req?.user?.name || req?.user?.email,
        vendor: payload.vendor || {},
        category: payload.category,
        subCategory: payload.subCategory,
        purpose: payload.purpose,
        remarks: payload.remarks,
        budgetHead: head._id,
        budgetHeadCode: head.accountCode,
        budgetHeadName: head.accountName,
        baseAmount: payload.baseAmount,
        gstType: payload.gstType || 'none',
        gstRate: payload.gstRate || 0,
        cgst: payload.cgst || 0,
        sgst: payload.sgst || 0,
        igst: payload.igst || 0,
        otherTaxAmount: payload.otherTaxAmount || 0,
        totalAmount: payload.totalAmount,
        paymentMode: payload.paymentMode,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
        priority: payload.priority || 'normal',
        expenseStatus: 'draft',
        attachments: payload.attachments || [],
        workflow: [step(req, 'create', null, 'draft')],
        createdBy: req?.user?._id,
      }], { session });

      doc = created;
    });
  } finally {
    await session.endSession();
  }

  await audit({ school, doc, action: 'create', after: doc.toObject(), req });
  return doc;
}

async function update(school, id, payload, req) {
  const doc = await FmsExpenseRequest.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Expense request');

  if (!EDITABLE.includes(doc.expenseStatus)) {
    throw errors.conflict(
      `A ${doc.expenseStatus} expense request cannot be edited`,
      {
        expenseStatus: doc.expenseStatus,
        hint: 'Only draft, returned and rejected requests are editable.',
      }
    );
  }

  const before = doc.toObject();
  await resolveFy(school, doc.requestDate);

  if (payload.budgetHead !== undefined) {
    const head = await validateHead(school, payload.budgetHead);
    doc.budgetHead = head._id;
    doc.budgetHeadCode = head.accountCode;
    doc.budgetHeadName = head.accountName;
  }

  const passthrough = [
    'category', 'subCategory', 'purpose', 'remarks', 'paymentMode', 'priority',
    'baseAmount', 'gstType', 'gstRate', 'cgst', 'sgst', 'igst',
    'otherTaxAmount', 'totalAmount', 'attachments',
  ];
  for (const k of passthrough) {
    if (payload[k] !== undefined) doc[k] = payload[k];
  }
  if (payload.department) doc.department = { ...doc.department, ...payload.department };
  if (payload.vendor) doc.vendor = { ...doc.vendor, ...payload.vendor };
  if (payload.dueDate !== undefined) doc.dueDate = payload.dueDate ? new Date(payload.dueDate) : undefined;

  // A returned or rejected request goes back to draft when edited, so the
  // correction cannot skip re-approval.
  const from = doc.expenseStatus;
  if (from !== 'draft') {
    doc.workflow.push(step(req, 'update', from, 'draft', `Corrected after ${from}`));
    doc.expenseStatus = 'draft';
  } else {
    doc.workflow.push(step(req, 'update', 'draft', 'draft'));
  }

  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({ school, doc, action: 'update', before, after: doc.toObject(), req });
  return doc;
}

/**
 * Submit for approval. Runs the budget check and records its result on the
 * request, so an approver later sees what was known at submission time.
 *
 * @param {boolean} acknowledgeOverBudget  an over-budget request may still be
 *        submitted, but only if the requester explicitly acknowledges it —
 *        silence must not be the way past a control.
 */
async function submit(school, id, req, { comment, acknowledgeOverBudget } = {}) {
  const doc = await FmsExpenseRequest.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Expense request');

  if (!EDITABLE.includes(doc.expenseStatus)) {
    throw errors.conflict(`Cannot submit a ${doc.expenseStatus} expense request`);
  }
  if (!doc.attachments?.length) {
    throw errors.validation('Validation failed', {
      attachments: 'at least one supporting document is required before submission',
    });
  }

  await resolveFy(school, doc.requestDate);

  const check = await checkBudget(school, doc.budgetHead, doc.financialYear, doc.totalAmount);

  if (check.outcome === 'exceeded' && !acknowledgeOverBudget) {
    throw errors.conflict(
      `Over budget: ${check.reason}`,
      {
        ...check,
        hint: 'Resubmit with acknowledgeOverBudget: true to proceed — the ' +
              'over-budget status is recorded and visible to every approver.',
      }
    );
  }

  const before = doc.toObject();
  doc.budgetCheck = check;
  doc.workflow.push(step(
    req, 'submit', doc.expenseStatus, 'submitted',
    check.outcome === 'exceeded' ? `${comment || ''} [OVER BUDGET ACKNOWLEDGED]`.trim() : comment
  ));
  doc.expenseStatus = 'submitted';
  doc.submittedBy = req?.user?._id;
  doc.submittedAt = new Date();
  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({ school, doc, action: 'update', before, after: doc.toObject(), req });
  return doc;
}

async function cancel(school, id, req, reason) {
  const doc = await FmsExpenseRequest.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Expense request');

  if (['paymentCompleted', 'closed'].includes(doc.expenseStatus)) {
    throw errors.conflict(
      `A ${doc.expenseStatus} expense cannot be cancelled — the money has already moved`,
      { hint: 'Reverse the payment instead.' }
    );
  }
  if (doc.expenseStatus === 'cancelled') {
    throw errors.conflict('This request is already cancelled');
  }
  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', { reason: 'is required' });
  }

  const before = doc.toObject();
  doc.workflow.push(step(req, 'cancel', doc.expenseStatus, 'cancelled', reason));
  doc.expenseStatus = 'cancelled';
  doc.cancelledBy = req?.user?._id;
  doc.cancelledAt = new Date();
  doc.cancellationReason = reason;
  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({ school, doc, action: 'cancel', before, after: doc.toObject(), req });
  return doc;
}

module.exports = {
  create, update, submit, cancel,
  checkBudget, validateHead, WARN_AT, EDITABLE,
};