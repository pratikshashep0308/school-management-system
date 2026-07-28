// backend/fms/services/cashBankBook/bookService.js
//
// Cash Book (M13, SCR-50) and Bank Book (M14, SCR-51).
//
// ─── EVERY FIGURE IS DERIVED ─────────────────────────────────────────────────
// Opening, receipts, payments and closing are all computed from
// fms_ledgerentries at query time. Nothing is stored twice, so the books can
// never disagree with the ledger — there is no second copy to drift.
//
// The one thing that IS stored is a daily closing: the physical count, who
// counted, who verified. The ledger cannot know that.
//
// ─── DIRECTION ───────────────────────────────────────────────────────────────
// Cash and bank accounts are debit-normal assets, so for these books:
//     debit  = money IN  = a receipt
//     credit = money OUT = a payment
// That mapping is only valid because these are asset accounts; it is not a
// general rule and is deliberately confined to this module.

const mongoose = require('mongoose');
const {
  FmsLedgerEntry, FmsAccount, FmsFinancialYear, FmsAuditTrail,
} = require('../../models/core');
const { FmsDailyClosing } = require('../../models/cashBankBook');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Midnight UTC — one bucket per calendar day, independent of server timezone. */
function dayStart(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) throw errors.badRequest(`Invalid date: ${d}`);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

function dayEnd(d) {
  const s = dayStart(d);
  return new Date(s.getTime() + 86400000 - 1);
}

/** Accounts that make up a book. */
async function bookAccounts(school, bookType, accountId) {
  const filter = { school: oid(school) };
  if (accountId) filter._id = oid(accountId);
  else if (bookType === 'cash') filter.isCashAccount = true;
  else if (bookType === 'bank') filter.isBankAccount = true;

  const accounts = await FmsAccount.find(filter)
    .select('_id accountCode accountName isCashAccount isBankAccount normalBalance status')
    .sort({ accountCode: 1 }).lean();

  if (!accounts.length) {
    throw errors.notFound(
      accountId ? 'Account' : `No ${bookType} accounts configured`
    );
  }
  if (accountId) {
    const a = accounts[0];
    const wanted = bookType === 'cash' ? a.isCashAccount : a.isBankAccount;
    if (!wanted) {
      throw errors.badRequest(
        `${a.accountCode} is not flagged as a ${bookType} account`,
        { hint: `Set is${bookType === 'cash' ? 'Cash' : 'Bank'}Account on the account first.` }
      );
    }
  }
  return accounts;
}

/** Σ(debit − credit) strictly before `before`. The opening balance. */
async function balanceBefore(school, accountIds, before) {
  const [agg] = await FmsLedgerEntry.aggregate([
    {
      $match: {
        school: oid(school),
        account: { $in: accountIds },
        entryDate: { $lt: before },
      },
    },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);
  return (agg?.debit || 0) - (agg?.credit || 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// The book: one row per day
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Day-by-day summary with continuity: each day's opening is the previous day's
 * closing, by construction rather than by lookup.
 */
async function book(school, { bookType, account, from, to }) {
  if (!from || !to) throw errors.badRequest("Both 'from' and 'to' are required");

  const start = dayStart(from);
  const end = dayEnd(to);
  if (start > end) throw errors.badRequest("'from' must not be after 'to'");

  const accounts = await bookAccounts(school, bookType, account);
  const ids = accounts.map((a) => a._id);

  const opening = await balanceBefore(school, ids, start);

  const daily = await FmsLedgerEntry.aggregate([
    { $match: { school: oid(school), account: { $in: ids }, entryDate: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$entryDate', timezone: 'UTC' } },
        receipts: { $sum: '$debit' },     // money in
        payments: { $sum: '$credit' },    // money out
        entries: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDate = new Map(daily.map((d) => [d._id, d]));

  // Walk every calendar day so a day with no movement still appears with its
  // carried-forward balance. Omitting empty days makes continuity impossible
  // to read.
  const days = [];
  let running = opening;

  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const key = new Date(t).toISOString().slice(0, 10);
    const d = byDate.get(key);
    const receipts = d?.receipts || 0;
    const payments = d?.payments || 0;
    const dayOpening = running;
    running = dayOpening + receipts - payments;

    days.push({
      date: key,
      openingBalance: dayOpening,
      receipts,
      payments,
      closingBalance: running,
      entries: d?.entries || 0,
    });
  }

  const totalReceipts = days.reduce((s, d) => s + d.receipts, 0);
  const totalPayments = days.reduce((s, d) => s + d.payments, 0);

  // Attach closing records where they exist, so the caller can see which days
  // have been counted and verified.
  const closings = await FmsDailyClosing.find({
    school: oid(school),
    account: { $in: ids },
    closingDate: { $gte: start, $lte: end },
  }).select('closingDate account closingStatus physicalCount variance verifiedBy').lean();

  const closingByDate = new Map(
    closings.map((c) => [c.closingDate.toISOString().slice(0, 10), c])
  );

  return {
    bookType,
    accounts: accounts.map((a) => ({
      _id: a._id, accountCode: a.accountCode, accountName: a.accountName,
    })),
    period: { from: start.toISOString().slice(0, 10), to: dayStart(to).toISOString().slice(0, 10) },
    openingBalance: opening,
    totalReceipts,
    totalPayments,
    closingBalance: running,
    // Arithmetic proof, computed independently of the running loop.
    continuous: opening + totalReceipts - totalPayments === running,
    days: days.map((d) => {
      const c = closingByDate.get(d.date);
      return {
        ...d,
        closing: c ? {
          status: c.closingStatus,
          physicalCount: c.physicalCount,
          variance: c.variance,
          verified: !!c.verifiedBy,
        } : null,
      };
    }),
  };
}

/** One day in full: every entry, with a running balance. */
async function day(school, { bookType, account, date }) {
  const start = dayStart(date);
  const end = dayEnd(date);

  const accounts = await bookAccounts(school, bookType, account);
  const ids = accounts.map((a) => a._id);

  const opening = await balanceBefore(school, ids, start);

  const rows = await FmsLedgerEntry.aggregate([
    { $match: { school: oid(school), account: { $in: ids }, entryDate: { $gte: start, $lte: end } } },
    { $sort: { entryDate: 1, _id: 1 } },
    {
      $setWindowFields: {
        sortBy: { entryDate: 1, _id: 1 },
        output: {
          movement: {
            $sum: { $subtract: ['$debit', '$credit'] },
            window: { documents: ['unbounded', 'current'] },
          },
        },
      },
    },
    {
      $project: {
        entryDate: 1, voucher: 1, voucherNumber: 1, voucherType: 1,
        accountCode: 1, accountName: 1, narration: 1,
        partyType: 1, partyName: 1, isReversal: 1,
        receipt: '$debit',
        payment: '$credit',
        runningBalance: { $add: [opening, '$movement'] },
      },
    },
  ]);

  const receipts = rows.reduce((s, r) => s + r.receipt, 0);
  const payments = rows.reduce((s, r) => s + r.payment, 0);

  const closing = await FmsDailyClosing.findOne({
    school: oid(school), account: { $in: ids }, closingDate: start,
  }).lean();

  return {
    bookType,
    date: start.toISOString().slice(0, 10),
    accounts: accounts.map((a) => ({ _id: a._id, accountCode: a.accountCode, accountName: a.accountName })),
    openingBalance: opening,
    receipts,
    payments,
    closingBalance: opening + receipts - payments,
    entries: rows,
    closing: closing || null,
    isClosed: !!closing,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily closing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Close a day for one account, recording the physical count.
 *
 * A cash closing REQUIRES a physical count — closing cash without counting it
 * is not a control, it is a formality. Bank closings do not, since there is
 * nothing to count.
 */
async function closeDay(school, { account, date, physicalCount, denominations, notes, varianceReason }, req) {
  const acct = await FmsAccount.findOne({ _id: account, school: oid(school) }).lean();
  if (!acct) throw errors.notFound('Account');

  if (!acct.isCashAccount && !acct.isBankAccount) {
    throw errors.badRequest(
      `${acct.accountCode} is neither a cash nor a bank account`,
      { hint: 'Only cash and bank accounts have a daily closing.' }
    );
  }

  const bookType = acct.isCashAccount ? 'cash' : 'bank';
  const start = dayStart(date);
  const end = dayEnd(date);

  if (start > new Date()) {
    throw errors.badRequest('Cannot close a day in the future');
  }

  if (bookType === 'cash' && (physicalCount === undefined || physicalCount === null)) {
    throw errors.validation('Validation failed', {
      physicalCount: 'is required for a cash closing — closing cash without counting it is not a control',
    });
  }
  if (physicalCount !== undefined && physicalCount !== null && !Number.isInteger(physicalCount)) {
    throw errors.validation('Validation failed', {
      physicalCount: 'must be integer paise, not float rupees',
    });
  }

  const existing = await FmsDailyClosing.findOne({
    school: oid(school), account: acct._id, closingDate: start,
  });
  if (existing) {
    throw errors.conflict(
      `${acct.accountCode} is already closed for ${start.toISOString().slice(0, 10)}`,
      { closingStatus: existing.closingStatus, closingId: existing._id }
    );
  }

  const fy = await FmsFinancialYear.findOne({
    school: oid(school), startDate: { $lte: start }, endDate: { $gte: start },
  }).lean();
  if (!fy) {
    throw errors.badRequest(`No financial year covers ${start.toISOString().slice(0, 10)}`);
  }

  // Every figure recomputed from the ledger at this moment.
  const openingBalance = await balanceBefore(school, [acct._id], start);
  const [agg] = await FmsLedgerEntry.aggregate([
    { $match: { school: oid(school), account: acct._id, entryDate: { $gte: start, $lte: end } } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, n: { $sum: 1 } } },
  ]);

  const totalReceipts = agg?.debit || 0;
  const totalPayments = agg?.credit || 0;
  const systemClosing = openingBalance + totalReceipts - totalPayments;

  const hasCount = physicalCount !== undefined && physicalCount !== null;
  const variance = hasCount ? physicalCount - systemClosing : 0;

  if (variance !== 0 && !varianceReason) {
    throw errors.validation('Validation failed', {
      varianceReason: `is required — the count differs from the system by ${variance} paise`,
      variance, systemClosing, physicalCount,
    });
  }

  const doc = await FmsDailyClosing.create({
    school: oid(school),
    financialYear: fy._id,
    account: acct._id,
    accountCode: acct.accountCode,
    accountName: acct.accountName,
    bookType,
    closingDate: start,
    openingBalance,
    totalReceipts,
    totalPayments,
    systemClosing,
    physicalCount: hasCount ? physicalCount : null,
    varianceReason,
    denominations: denominations || [],
    // A variance is a dispute until someone explains and verifies it.
    closingStatus: variance !== 0 ? 'disputed' : 'closed',
    closedBy: req?.user?._id,
    closedAt: new Date(),
    entryCount: agg?.n || 0,
    notes,
    createdBy: req?.user?._id,
  });

  await FmsAuditTrail.create({
    school: oid(school), entity: 'fms_dailyclosings', entityId: doc._id,
    action: 'create', after: doc.toObject(),
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip,
  });

  return doc;
}

/**
 * Verify a closing. The verifier must not be the person who closed it —
 * self-verification is not verification.
 */
async function verifyClosing(school, id, req, note) {
  const doc = await FmsDailyClosing.findOne({ _id: id, school: oid(school) });
  if (!doc) throw errors.notFound('Daily closing');

  if (doc.closingStatus === 'verified') {
    throw errors.conflict('This closing is already verified');
  }
  if (String(doc.closedBy) === String(req?.user?._id)) {
    throw errors.forbidden(
      'Separation of duties: you cannot verify a closing you performed.',
      { hint: 'A different authorised user must verify this.' }
    );
  }
  if (doc.variance !== 0 && !note) {
    throw errors.validation('Validation failed', {
      note: `is required — this closing has a variance of ${doc.variance} paise`,
      variance: doc.variance,
    });
  }

  const before = doc.toObject();
  doc.closingStatus = 'verified';
  doc.verifiedBy = req?.user?._id;
  doc.verifiedAt = new Date();
  doc.verificationNote = note;
  doc.updatedBy = req?.user?._id;
  await doc.save();

  await FmsAuditTrail.create({
    school: oid(school), entity: 'fms_dailyclosings', entityId: doc._id,
    action: 'approve', before, after: doc.toObject(),
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip,
  });

  return doc;
}

module.exports = {
  book, day, closeDay, verifyClosing,
  bookAccounts, balanceBefore, dayStart, dayEnd,
};