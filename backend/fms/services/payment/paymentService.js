// backend/fms/services/payment/paymentService.js
//
// Payment processing. BPMN WF3, screens SCR-52 / SCR-53.
//
// This is where an approved expense finally reaches the ledger:
//     Dr  <expense head>        totalAmount
//         Cr  <cash or bank>                totalAmount
//
// ─── WHY GST IS NOT SPLIT OUT ────────────────────────────────────────────────
// An expense carries base + GST. A GST-registered entity able to claim input
// credit would debit the GST portion to an input-credit asset account instead.
// Education services are exempt in India, so a school generally cannot claim
// it, and the whole amount is genuinely the cost.
//
// Posting the full amount to the expense head is therefore correct here — and
// building the split now would be speculative machinery for a rule that does
// not apply. If the school is registered and can claim, that becomes a
// configuration decision, not a default.

const mongoose = require('mongoose');
const {
  FmsAccount, FmsFinancialYear, FmsAuditTrail,
} = require('../../models/core');
const { FmsExpenseRequest } = require('../../models/expense');
const { FmsPaymentVoucher, INSTRUMENT_MODES } = require('../../models/payment');
const posting = require('../ledger/LedgerPostingService');
const money = require('../../utils/money');
const { errors } = require('../../utils/apiResponse');

const LOCKED_FY = ['closed', 'locked'];

/** Which asset account a mode draws from, when the caller does not name one. */
const MODE_SOURCE = {
  cash: 'isCashAccount',
  cheque: 'isBankAccount',
  neft: 'isBankAccount',
  rtgs: 'isBankAccount',
  dd: 'isBankAccount',
  upi: 'isBankAccount',
};

async function audit({ school, doc, action, before, after, req }) {
  await FmsAuditTrail.create({
    school,
    entity: 'fms_paymentvouchers',
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

async function resolveSource(school, paymentMode, creditAccount) {
  if (creditAccount) {
    const a = await FmsAccount.findOne({ _id: creditAccount, school }).lean();
    if (!a) throw errors.validation('Validation failed', { creditAccount: 'account not found' });
    if (!a.isCashAccount && !a.isBankAccount) {
      throw errors.validation('Validation failed', {
        creditAccount: `${a.accountCode} is neither a cash nor a bank account — payment must come from one`,
      });
    }
    if (!a.isPostable || a.status !== 'active') {
      throw errors.validation('Validation failed', {
        creditAccount: `${a.accountCode} is ${!a.isPostable ? 'not postable' : a.status}`,
      });
    }
    return a;
  }

  const hint = MODE_SOURCE[paymentMode];
  const candidates = await FmsAccount.find({ school, [hint]: true, status: 'active' }).lean();
  if (candidates.length !== 1) {
    throw errors.validation('Validation failed', {
      creditAccount: candidates.length === 0
        ? `no active account is configured for '${paymentMode}' payments`
        : `${candidates.length} accounts could fund a '${paymentMode}' payment — name one explicitly`,
    });
  }
  return candidates[0];
}

/**
 * Pay an approved expense.
 *
 * One call: create the voucher, post the ledger, advance the expense. The money
 * leaves in a single act, so splitting it across two calls would only create a
 * window in which the books and reality disagree.
 */
async function pay(school, expenseId, payload, req) {
  const expense = await FmsExpenseRequest.findOne({ _id: expenseId, school });
  if (!expense) throw errors.notFound('Expense request');

  if (expense.expenseStatus !== 'paymentPending') {
    throw errors.conflict(
      `Only a fully approved expense can be paid (this one is '${expense.expenseStatus}')`,
      {
        expenseStatus: expense.expenseStatus,
        hint: expense.expenseStatus === 'paymentCompleted'
          ? 'This expense has already been paid.'
          : 'The approval chain must complete first.',
      }
    );
  }

  const { paymentMode, instrumentNumber, instrumentDate, bankReference, bankName,
    creditAccount, paymentDate, narration, payeeName, payeeType } = payload;

  if (INSTRUMENT_MODES.includes(paymentMode) && !instrumentNumber) {
    throw errors.validation('Validation failed', {
      instrumentNumber: `is required for a ${paymentMode} payment — without it the payment cannot be traced`,
    });
  }

  const date = paymentDate ? new Date(paymentDate) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw errors.validation('Validation failed', { paymentDate: 'must be a valid date' });
  }
  if (date > new Date()) {
    throw errors.validation('Validation failed', {
      paymentDate: 'cannot be in the future — a payment records money that has left',
    });
  }

  const fy = await FmsFinancialYear.findOne({
    school, startDate: { $lte: date }, endDate: { $gte: date },
  }).lean();
  if (!fy) {
    throw errors.validation('Validation failed', {
      paymentDate: `no financial year covers ${date.toISOString().slice(0, 10)}`,
    });
  }
  if (LOCKED_FY.includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year ${fy.yearCode} is ${fy.fyStatus}`);
  }

  const source = await resolveSource(school, paymentMode, creditAccount);
  const head = await FmsAccount.findOne({ _id: expense.budgetHead, school }).lean();
  if (!head) throw errors.validation('Validation failed', { budgetHead: 'expense account not found' });
  if (!head.isPostable || head.status !== 'active') {
    throw errors.conflict(`Expense head ${head.accountCode} is ${!head.isPostable ? 'not postable' : head.status}`);
  }

  const amount = expense.totalAmount;

  // Claim the slot BEFORE posting. The unique partial index means a concurrent
  // second attempt fails here rather than after money has moved.
  let claim;
  try {
    claim = await FmsPaymentVoucher.create({
      school,
      financialYear: fy._id,
      paymentNumber: `PENDING-${expense._id}`,   // replaced once the GL number exists
      paymentDate: date,
      expenseRequest: expense._id,
      expenseNumber: expense.expenseNumber,
      amount,
      paymentMode,
      instrumentNumber,
      instrumentDate: instrumentDate ? new Date(instrumentDate) : undefined,
      bankReference,
      bankName,
      debitAccount: head._id,
      debitAccountCode: head.accountCode,
      debitAccountName: head.accountName,
      creditAccount: source._id,
      creditAccountCode: source.accountCode,
      payeeName: payeeName || expense.vendor?.name || expense.requestedByName || 'Payee',
      payeeType: payeeType || (expense.vendor?.name ? 'vendor' : 'other'),
      vendorRef: expense.vendor?.ref || null,
      narration: narration || expense.purpose,
      paymentStatus: 'processing',
      isLive: true,
      createdBy: req?.user?._id,
    });
  } catch (err) {
    if (err.code === 11000) {
      const existing = await FmsPaymentVoucher
        .findOne({ school, expenseRequest: expense._id, isLive: true }).lean();
      throw errors.conflict(
        'This expense already has a live payment — it cannot be paid twice',
        {
          paymentNumber: existing?.paymentNumber,
          paymentStatus: existing?.paymentStatus,
          paidAt: existing?.paidAt,
        }
      );
    }
    throw err;
  }

  // Post. If this throws, the claim is released so a corrected retry is possible.
  let result;
  try {
    result = await posting.post({
      school,
      financialYear: fy._id,
      voucherType: 'payment',
      voucherDate: date,
      narration: narration || `Payment for ${expense.expenseNumber}: ${expense.purpose}`,
      referenceNumber: instrumentNumber || bankReference,
      source: 'manual',
      postedBy: req?.user?._id,
      lines: [
        {
          account: head._id,
          debit: amount,
          credit: 0,
          narration: expense.purpose,
          partyType: expense.vendor?.name ? 'vendor' : 'other',
          partyName: payeeName || expense.vendor?.name,
        },
        {
          account: source._id,
          debit: 0,
          credit: amount,
          narration: `${paymentMode}${instrumentNumber ? ' ' + instrumentNumber : ''}`,
          partyType: expense.vendor?.name ? 'vendor' : 'other',
          partyName: payeeName || expense.vendor?.name,
        },
      ],
    });
  } catch (err) {
    await FmsPaymentVoucher.updateOne(
      { _id: claim._id },
      { $set: { paymentStatus: 'failed', isLive: false, failureReason: `Posting failed: ${err.message}` } }
    );
    throw err;
  }

  const before = expense.toObject();

  claim.paymentNumber = result.voucher.voucherNumber;
  claim.voucher = result.voucher._id;
  claim.paymentStatus = 'paid';
  claim.paidBy = req?.user?._id;
  claim.paidAt = new Date();
  await claim.save();

  expense.expenseStatus = 'paymentCompleted';
  expense.workflow.push({
    action: 'pay',
    actor: req?.user?._id,
    actorEmail: req?.user?.email,
    actorRole: req?.fmsRole,
    comment: `${paymentMode}${instrumentNumber ? ' ' + instrumentNumber : ''} — ${result.voucher.voucherNumber}`,
    fromStatus: 'paymentPending',
    toStatus: 'paymentCompleted',
    at: new Date(),
  });
  expense.updatedBy = req?.user?._id;
  await expense.save();

  await audit({ school, doc: claim, action: 'post', after: claim.toObject(), req });
  await FmsAuditTrail.create({
    school, entity: 'fms_expenserequests', entityId: expense._id,
    action: 'post', before, after: expense.toObject(),
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip,
  });

  return {
    payment: claim,
    expense,
    voucher: result.voucher,
    entries: result.entries,
    notify: { event: 'expense.paid', expenseNumber: expense.expenseNumber },
  };
}

/**
 * Mark a payment failed — a bounced cheque, a rejected transfer.
 *
 * Reverses the posting and releases the expense to be paid again. The failed
 * voucher stays on record: a cheque that bounced is part of the history.
 */
async function fail(school, paymentId, req, reason) {
  const payment = await FmsPaymentVoucher.findOne({ _id: paymentId, school });
  if (!payment) throw errors.notFound('Payment voucher');

  if (payment.paymentStatus === 'failed') {
    throw errors.conflict('This payment is already marked failed');
  }
  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', {
      reason: 'is required — a failed payment must be explainable',
    });
  }

  const fy = await FmsFinancialYear.findById(payment.financialYear).lean();
  if (!fy || LOCKED_FY.includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year is ${fy ? fy.fyStatus : 'missing'}; the reversal cannot be posted`);
  }

  const before = payment.toObject();
  let reversal = null;

  if (payment.voucher) {
    const result = await posting.reverse(payment.voucher, req?.user?._id, `Payment failed: ${reason}`);
    reversal = result.reversal;
    payment.reversalVoucher = reversal._id;
  }

  payment.paymentStatus = 'failed';
  payment.isLive = false;              // frees the expense for a retry
  payment.failedBy = req?.user?._id;
  payment.failedAt = new Date();
  payment.failureReason = reason;
  payment.updatedBy = req?.user?._id;
  await payment.save();

  const expense = await FmsExpenseRequest.findOne({ _id: payment.expenseRequest, school });
  if (expense && expense.expenseStatus === 'paymentCompleted') {
    expense.expenseStatus = 'paymentPending';
    expense.workflow.push({
      action: 'paymentFailed',
      actor: req?.user?._id,
      actorEmail: req?.user?.email,
      actorRole: req?.fmsRole,
      comment: reason,
      fromStatus: 'paymentCompleted',
      toStatus: 'paymentPending',
      at: new Date(),
    });
    await expense.save();
  }

  await audit({ school, doc: payment, action: 'reverse', before, after: payment.toObject(), req });
  return { payment, reversal, expense };
}

/** Close a completed expense. Terminal — nothing further happens to it. */
async function close(school, expenseId, req) {
  const expense = await FmsExpenseRequest.findOne({ _id: expenseId, school });
  if (!expense) throw errors.notFound('Expense request');

  if (expense.expenseStatus !== 'paymentCompleted') {
    throw errors.conflict(
      `Only a paid expense can be closed (this one is '${expense.expenseStatus}')`
    );
  }

  const before = expense.toObject();
  expense.expenseStatus = 'closed';
  expense.workflow.push({
    action: 'close',
    actor: req?.user?._id,
    actorEmail: req?.user?.email,
    actorRole: req?.fmsRole,
    fromStatus: 'paymentCompleted',
    toStatus: 'closed',
    at: new Date(),
  });
  expense.updatedBy = req?.user?._id;
  await expense.save();

  await FmsAuditTrail.create({
    school, entity: 'fms_expenserequests', entityId: expense._id,
    action: 'update', before, after: expense.toObject(),
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip,
  });

  return expense;
}

/** Expenses fully approved and awaiting payment (SCR-53). */
async function queue(school, { skip = 0, limit = 25, paymentMode } = {}) {
  const filter = { school, expenseStatus: 'paymentPending' };

  const [items, total] = await Promise.all([
    FmsExpenseRequest.find(filter)
      .select('_id expenseNumber requestDate purpose vendor department totalAmount ' +
              'paymentMode dueDate priority budgetHeadCode budgetHeadName requestedByName')
      .sort({ priority: -1, dueDate: 1, requestDate: 1 })
      .skip(skip).limit(limit).lean(),
    FmsExpenseRequest.countDocuments(filter),
  ]);

  const [agg] = await FmsExpenseRequest.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } },
  ]);

  const filtered = paymentMode ? items.filter((i) => i.paymentMode === paymentMode) : items;

  return { items: filtered, total, totalAmount: agg?.total || 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cheque printing (SCR-40)
// ─────────────────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Printable cheque overlay.
 *
 * Positioned in millimetres for a standard CTS-2010 cheque leaf, so it prints
 * onto a real cheque rather than producing a picture of one. The measurements
 * will need adjusting to the school's bank — every layout differs slightly, and
 * that is a calibration step, not a code change.
 */
function renderCheque(payment, opts = {}) {
  const d = payment.instrumentDate || payment.paymentDate;
  const dd = new Date(d);
  const digits = [
    String(dd.getUTCDate()).padStart(2, '0'),
    String(dd.getUTCMonth() + 1).padStart(2, '0'),
    String(dd.getUTCFullYear()),
  ].join('');

  const income = require('../income/incomeService');
  const words = income.inWords(payment.amount);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Cheque ${esc(payment.instrumentNumber || payment.paymentNumber)}</title>
<style>
  @page { size: 202mm 92mm; margin: 0; }
  body { margin:0; font-family:"Courier New",monospace; font-size:11pt; }
  .leaf { position:relative; width:202mm; height:92mm; }
  .f { position:absolute; white-space:nowrap; }
  .date   { top:8mm;  right:12mm; letter-spacing:3.6mm; font-size:12pt; }
  .payee  { top:22mm; left:22mm;  max-width:140mm; overflow:hidden; }
  .words1 { top:32mm; left:30mm;  max-width:150mm; }
  .words2 { top:39mm; left:14mm;  max-width:165mm; }
  .figure { top:36mm; right:14mm; font-weight:bold; font-size:13pt; }
  .ac     { top:52mm; left:14mm;  font-size:9pt; }
  .guide  { position:absolute; inset:0; border:1px dashed #bbb; }
  .note   { position:absolute; bottom:2mm; left:14mm; font-size:7pt; color:#888; }
  @media print { .guide, .note { display:none; } }
</style></head>
<body><div class="leaf">
  ${opts.showGuide === false ? '' : '<div class="guide"></div>'}
  <div class="f date">${esc(digits)}</div>
  <div class="f payee">${esc(payment.payeeName)}</div>
  <div class="f words1">${esc(words)}</div>
  <div class="f figure">${esc(require('../../utils/money').format(payment.amount))}</div>
  <div class="f ac">A/C PAYEE ONLY</div>
  <div class="note">
    Alignment guide — hidden when printing. Calibrate the millimetre offsets to
    your bank's cheque layout before first use.
  </div>
</div></body></html>`;
}

module.exports = { pay, fail, close, queue, renderCheque, resolveSource };