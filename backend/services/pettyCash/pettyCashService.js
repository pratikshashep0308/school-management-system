// backend/fms/services/pettyCash/pettyCashService.js
//
// Petty Cash. SRS M10 / FR-M10, BPMN WF9, screens SCR-43/44/45.
//
// ─── THE IMPREST ARRANGEMENT ─────────────────────────────────────────────────
//   float          Dr Petty Cash        Cr Bank/Cash     the tin is filled
//   expense        Dr <expense head>    Cr Petty Cash    money leaves the tin
//   replenishment  Dr Petty Cash        Cr Bank/Cash     topped back up
//   return         Dr Bank/Cash         Cr Petty Cash    unspent cash handed back
//
// The balance is never stored. It is Σ(debit − credit) on the petty cash head,
// exactly like the cash book — so what the books say and what the tin should
// hold cannot drift apart in software.
//
// ─── DAILY CLOSING IS NOT REBUILT HERE ───────────────────────────────────────
// Physical count, variance and verification live in bookService (P2.4) and work
// on any cash account. A petty cash account IS one. Two implementations would
// mean two places a variance could be recorded and eventually two answers to
// "was the cash counted?".

const mongoose = require('mongoose');
const {
  FmsAccount, FmsLedgerEntry, FmsFinancialYear, FmsAuditTrail,
} = require('../../models/core');
const { FmsPettyCashFloat, FmsPettyCashTransaction } = require('../../models/pettyCash');
const { FmsDailyClosing } = require('../../models/cashBankBook');
const posting = require('../ledger/LedgerPostingService');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const LOCKED_FY = ['closed', 'locked'];

/** Types that ADD to the tin. */
const INFLOW = ['float', 'replenishment'];

async function audit({ school, entity, doc, action, before, after, req }) {
  await FmsAuditTrail.create({
    school, entity, entityId: doc?._id, action, before, after,
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip,
  });
}

async function openFy(school, date) {
  const fy = await FmsFinancialYear.findOne({
    school, startDate: { $lte: date }, endDate: { $gte: date },
  }).lean();
  if (!fy) {
    throw errors.validation('Validation failed', {
      transactionDate: `no financial year covers ${date.toISOString().slice(0, 10)}`,
    });
  }
  if (LOCKED_FY.includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year ${fy.yearCode} is ${fy.fyStatus}`);
  }
  return fy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Floats
// ─────────────────────────────────────────────────────────────────────────────

async function createFloat(school, payload, req) {
  const acct = await FmsAccount.findOne({ _id: payload.account, school }).lean();
  if (!acct) throw errors.validation('Validation failed', { account: 'account not found' });

  if (!acct.isCashAccount) {
    throw errors.validation('Validation failed', {
      account: `${acct.accountCode} is not flagged as a cash account — petty cash is cash`,
    });
  }
  if (!acct.isPostable || acct.status !== 'active') {
    throw errors.validation('Validation failed', {
      account: `${acct.accountCode} is ${!acct.isPostable ? 'not postable' : acct.status}`,
    });
  }

  const clash = await FmsPettyCashFloat.findOne({ school, account: acct._id }).lean();
  if (clash) {
    throw errors.conflict(
      `${acct.accountCode} already holds the float '${clash.name}'`,
      { hint: 'Each float needs its own cash head, or the balance is unattributable.' }
    );
  }

  const doc = await FmsPettyCashFloat.create({
    school,
    name: payload.name,
    account: acct._id,
    accountCode: acct.accountCode,
    accountName: acct.accountName,
    custodian: payload.custodian,
    custodianName: payload.custodianName,
    floatAmount: payload.floatAmount,
    replenishThreshold: payload.replenishThreshold ?? null,
    maxSingleExpense: payload.maxSingleExpense ?? null,
    notes: payload.notes,
    createdBy: req?.user?._id,
  });

  await audit({ school, entity: 'fms_pettycashfloats', doc, action: 'create', after: doc.toObject(), req });
  return doc;
}

/**
 * The float's position: balance from the ledger, and whether it needs topping up.
 *
 * `balance` is derived, never stored — the same rule as the cash book.
 */
async function position(school, floatId, asAt) {
  const f = await FmsPettyCashFloat.findOne({ _id: floatId, school }).lean();
  if (!f) throw errors.notFound('Petty cash float');

  const match = { school: oid(school), account: oid(f.account) };
  if (asAt) match.entryDate = { $lte: new Date(asAt) };

  const [agg] = await FmsLedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, n: { $sum: 1 } } },
  ]);

  const balance = (agg?.debit || 0) - (agg?.credit || 0);
  const spent = f.floatAmount - balance;

  return {
    float: {
      _id: f._id, name: f.name, accountCode: f.accountCode,
      custodian: f.custodian, custodianName: f.custodianName,
      floatAmount: f.floatAmount, replenishThreshold: f.replenishThreshold,
      floatStatus: f.floatStatus,
    },
    balance,
    entries: agg?.n || 0,
    /** What a replenishment would need to be to restore the imprest. */
    replenishmentDue: spent > 0 ? spent : 0,
    needsReplenishment: balance <= f.replenishThreshold,
    // Over the imprest means someone put in more than the float. Not a crime,
    // but it means the arrangement is no longer what was agreed.
    isOverFloat: balance > f.floatAmount,
  };
}

async function setFloatStatus(school, floatId, { floatStatus, reason }, req) {
  const f = await FmsPettyCashFloat.findOne({ _id: floatId, school });
  if (!f) throw errors.notFound('Petty cash float');

  if (f.floatStatus === floatStatus) {
    throw errors.conflict(`This float is already ${floatStatus}`);
  }
  if (['suspended', 'closed'].includes(floatStatus) && (!reason || !String(reason).trim())) {
    throw errors.validation('Validation failed', {
      reason: `is required when setting a float to '${floatStatus}'`,
    });
  }

  // Closing while cash is still held would leave money nobody is answerable for.
  if (floatStatus === 'closed') {
    const pos = await position(school, floatId);
    if (pos.balance !== 0) {
      throw errors.conflict(
        `This float still holds ${pos.balance} paise`,
        { balance: pos.balance, hint: 'Return the unspent cash before closing it.' }
      );
    }
  }

  const before = f.toObject();
  f.floatStatus = floatStatus;
  f.statusReason = reason;
  f.updatedBy = req?.user?._id;
  await f.save();

  await audit({ school, entity: 'fms_pettycashfloats', doc: f, action: 'update', before, after: f.toObject(), req });
  return f;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a movement and post it.
 *
 * @param {'float'|'replenishment'|'expense'|'return'|'adjustment'} transactionType
 */
async function record(school, floatId, payload, req) {
  const f = await FmsPettyCashFloat.findOne({ _id: floatId, school }).lean();
  if (!f) throw errors.notFound('Petty cash float');

  if (f.floatStatus !== 'active') {
    throw errors.conflict(
      `This float is ${f.floatStatus} and cannot be transacted with`,
      { reason: f.statusReason }
    );
  }

  const { transactionType, amount, counterAccount, particulars, paidTo, billNumber, attachmentUrl } = payload;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw errors.validation('Validation failed', {
      amount: 'must be a positive integer in paise (₹123.45 → 12345)',
    });
  }

  const date = new Date(payload.transactionDate || Date.now());
  if (Number.isNaN(date.getTime())) {
    throw errors.validation('Validation failed', { transactionDate: 'must be a valid date' });
  }
  if (date > new Date()) {
    throw errors.validation('Validation failed', {
      transactionDate: 'cannot be in the future — this records cash that has already moved',
    });
  }

  const fy = await openFy(school, date);

  const counter = await FmsAccount.findOne({ _id: counterAccount, school }).lean();
  if (!counter) throw errors.validation('Validation failed', { counterAccount: 'account not found' });
  if (!counter.isPostable || counter.status !== 'active') {
    throw errors.validation('Validation failed', {
      counterAccount: `${counter.accountCode} is ${!counter.isPostable ? 'not postable' : counter.status}`,
    });
  }

  const isInflow = INFLOW.includes(transactionType);

  if (transactionType === 'expense') {
    if (counter.accountType !== 'expense') {
      throw errors.validation('Validation failed', {
        counterAccount:
          `${counter.accountCode} is an ${counter.accountType} account — petty cash ` +
          'spending must go to an expense head',
      });
    }
    if (f.maxSingleExpense && amount > f.maxSingleExpense) {
      throw errors.conflict(
        `${amount} exceeds the single-expense limit of ${f.maxSingleExpense} for this float`,
        {
          limit: f.maxSingleExpense, amount,
          hint: 'Raise an expense request instead — petty cash is for small sums.',
        }
      );
    }
  }

  if (isInflow && !counter.isCashAccount && !counter.isBankAccount) {
    throw errors.validation('Validation failed', {
      counterAccount: `${counter.accountCode} is neither cash nor bank — a float comes from one of them`,
    });
  }

  // Spending more than is in the tin is physically impossible, so a request to
  // do it means either the balance or the entry is wrong.
  if (!isInflow) {
    const pos = await position(school, floatId);
    if (amount > pos.balance) {
      throw errors.conflict(
        `Only ${pos.balance} paise is in this float; ${amount} cannot be paid out`,
        {
          balance: pos.balance, requested: amount,
          hint: 'Replenish the float first, or check the amount.',
        }
      );
    }
  }

  const lines = isInflow
    ? [
      { account: f.account, debit: amount, credit: 0, narration: particulars },
      { account: counter._id, debit: 0, credit: amount, narration: particulars },
    ]
    : [
      { account: counter._id, debit: amount, credit: 0, narration: particulars, partyName: paidTo },
      { account: f.account, debit: 0, credit: amount, narration: particulars, partyName: paidTo },
    ];

  const result = await posting.post({
    school,
    financialYear: fy._id,
    voucherType: isInflow ? 'receipt' : 'payment',
    voucherDate: date,
    narration: particulars,
    referenceNumber: billNumber,
    source: 'manual',
    postedBy: req?.user?._id,
    lines,
  });

  const doc = await FmsPettyCashTransaction.create({
    school,
    financialYear: fy._id,
    pettyCashFloat: f._id,
    // One number, as elsewhere — the GL voucher number is the petty cash
    // voucher number, so the tin's book and the ledger cannot drift.
    voucherNumber: result.voucher.voucherNumber,
    transactionDate: date,
    transactionType,
    amount,
    counterAccount: counter._id,
    counterAccountCode: counter.accountCode,
    counterAccountName: counter.accountName,
    particulars,
    paidTo,
    billNumber,
    attachmentUrl,
    pcStatus: 'posted',
    voucher: result.voucher._id,
    recordedBy: req?.user?._id,
    createdBy: req?.user?._id,
  });

  await audit({ school, entity: 'fms_pettycashtransactions', doc, action: 'create', after: doc.toObject(), req });

  return { transaction: doc, voucher: result.voucher, position: await position(school, floatId) };
}

/** Cancel a transaction: reverses the posting, keeps the record. */
async function cancel(school, txnId, req, reason) {
  const t = await FmsPettyCashTransaction.findOne({ _id: txnId, school });
  if (!t) throw errors.notFound('Petty cash transaction');

  if (t.pcStatus === 'cancelled') throw errors.conflict('This entry is already cancelled');
  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', { reason: 'is required' });
  }

  const fy = await FmsFinancialYear.findById(t.financialYear).lean();
  if (!fy || LOCKED_FY.includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year is ${fy ? fy.fyStatus : 'missing'}`);
  }

  // A day that has been counted and signed off must not change underneath the
  // count. That is the whole point of closing it.
  const closed = await FmsDailyClosing.findOne({
    school,
    account: (await FmsPettyCashFloat.findById(t.pettyCashFloat).lean())?.account,
    closingDate: { $gte: new Date(Date.UTC(
      t.transactionDate.getUTCFullYear(), t.transactionDate.getUTCMonth(), t.transactionDate.getUTCDate()
    )) },
  }).lean();
  if (closed) {
    throw errors.conflict(
      `${t.transactionDate.toISOString().slice(0, 10)} has already been closed and counted`,
      { closingId: closed._id, hint: 'Post a correcting entry on a later date instead.' }
    );
  }

  const before = t.toObject();
  const result = await posting.reverse(t.voucher, req?.user?._id, `Petty cash entry cancelled: ${reason}`);

  t.pcStatus = 'cancelled';
  t.reversalVoucher = result.reversal._id;
  t.cancelledBy = req?.user?._id;
  t.cancelledAt = new Date();
  t.cancellationReason = reason;
  await t.save();

  await audit({ school, entity: 'fms_pettycashtransactions', doc: t, action: 'cancel', before, after: t.toObject(), req });
  return { transaction: t, reversal: result.reversal };
}

/**
 * Post a verified variance to the books.
 *
 * A counted shortfall is real money gone. Until it is posted, the ledger says
 * the tin holds more than it does — so a verified variance has to reach the
 * accounts, not just sit on the closing record.
 */
async function postVariance(school, closingId, payload, req) {
  const closing = await FmsDailyClosing.findOne({ _id: closingId, school });
  if (!closing) throw errors.notFound('Daily closing');

  if (closing.variance === 0) {
    throw errors.conflict('This closing has no variance to post');
  }
  if (closing.closingStatus !== 'verified') {
    throw errors.conflict(
      `Only a verified closing can be posted (this one is ${closing.closingStatus})`,
      { hint: 'A variance must be checked by someone else before it reaches the books.' }
    );
  }

  const existing = await FmsPettyCashTransaction.findOne({
    school, dailyClosing: closing._id, pcStatus: 'posted',
  }).lean();
  if (existing) {
    throw errors.conflict(
      'This variance has already been posted',
      { voucherNumber: existing.voucherNumber }
    );
  }

  const f = await FmsPettyCashFloat.findOne({ school, account: closing.account }).lean();
  if (!f) throw errors.notFound('Petty cash float for this account');

  const counter = await FmsAccount.findOne({ _id: payload.counterAccount, school }).lean();
  if (!counter) throw errors.validation('Validation failed', { counterAccount: 'account not found' });

  const fy = await openFy(school, closing.closingDate);
  const shortfall = closing.variance < 0;
  const amount = Math.abs(closing.variance);

  // Short: the tin holds less than the books say, so credit petty cash and
  // debit the loss. Over: the reverse.
  const lines = shortfall
    ? [
      { account: counter._id, debit: amount, credit: 0, narration: 'Petty cash shortfall' },
      { account: f.account, debit: 0, credit: amount, narration: 'Petty cash shortfall' },
    ]
    : [
      { account: f.account, debit: amount, credit: 0, narration: 'Petty cash overage' },
      { account: counter._id, debit: 0, credit: amount, narration: 'Petty cash overage' },
    ];

  const result = await posting.post({
    school, financialYear: fy._id, voucherType: 'journal',
    voucherDate: closing.closingDate,
    narration: `Petty cash ${shortfall ? 'shortfall' : 'overage'} on ` +
               `${closing.closingDate.toISOString().slice(0, 10)} — ${closing.varianceReason || 'counted variance'}`,
    source: 'manual',
    postedBy: req?.user?._id,
    lines,
  });

  const doc = await FmsPettyCashTransaction.create({
    school, financialYear: fy._id,
    pettyCashFloat: f._id,
    voucherNumber: result.voucher.voucherNumber,
    transactionDate: closing.closingDate,
    transactionType: 'adjustment',
    amount,
    counterAccount: counter._id,
    counterAccountCode: counter.accountCode,
    counterAccountName: counter.accountName,
    particulars: `${shortfall ? 'Shortfall' : 'Overage'} on count — ${closing.varianceReason || ''}`.trim(),
    pcStatus: 'posted',
    voucher: result.voucher._id,
    dailyClosing: closing._id,
    recordedBy: req?.user?._id,
    createdBy: req?.user?._id,
  });

  await audit({ school, entity: 'fms_pettycashtransactions', doc, action: 'post', after: doc.toObject(), req });
  return { transaction: doc, voucher: result.voucher, position: await position(school, f._id) };
}

/** The petty cash book: every movement with a running balance. */
async function book(school, floatId, { from, to } = {}) {
  const f = await FmsPettyCashFloat.findOne({ _id: floatId, school }).lean();
  if (!f) throw errors.notFound('Petty cash float');

  const filter = { school: oid(school), pettyCashFloat: f._id };
  if (from || to) {
    filter.transactionDate = {};
    if (from) filter.transactionDate.$gte = new Date(from);
    if (to) {
      const d = new Date(to); d.setUTCHours(23, 59, 59, 999);
      filter.transactionDate.$lte = d;
    }
  }

  let opening = 0;
  if (from) {
    const before = new Date(from);
    const [agg] = await FmsLedgerEntry.aggregate([
      { $match: { school: oid(school), account: oid(f.account), entryDate: { $lt: before } } },
      { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ]);
    opening = (agg?.debit || 0) - (agg?.credit || 0);
  }

  const rows = await FmsPettyCashTransaction.find(filter)
    .sort({ transactionDate: 1, createdAt: 1 }).lean();

  let running = opening;
  const entries = rows.map((r) => {
    const inflow = INFLOW.includes(r.transactionType) ||
                   (r.transactionType === 'adjustment' && r.particulars?.startsWith('Overage'));
    // A cancelled entry stays visible but no longer moves the balance.
    const delta = r.pcStatus === 'cancelled' ? 0 : (inflow ? r.amount : -r.amount);
    running += delta;
    return {
      ...r,
      inflow: inflow ? r.amount : 0,
      outflow: inflow ? 0 : r.amount,
      runningBalance: running,
    };
  });

  return {
    float: { _id: f._id, name: f.name, accountCode: f.accountCode, floatAmount: f.floatAmount },
    period: { from: from || null, to: to || null },
    openingBalance: opening,
    closingBalance: running,
    entries,
    count: entries.length,
  };
}

module.exports = {
  createFloat, position, setFloatStatus,
  record, cancel, postVariance, book,
  INFLOW,
};