// backend/fms/services/ledger/ledgerQueryService.js
//
// READ-ONLY General Ledger queries. SRS M11 / FR-M11, screen SCR-46.
//
// ─── NOTHING HERE WRITES ─────────────────────────────────────────────────────
// This module imports FmsLedgerEntry for aggregation only. Writes are
// impossible in three independent ways:
//   1. the model rejects updateOne/deleteOne/deleteMany (P1.2)
//   2. LedgerPostingService is the only code that inserts (P1.4)
//   3. no role has edit or admin on the `ledger` module (P1.3, asserted by test)
//
// ─── RUNNING BALANCES UNDER PAGINATION ───────────────────────────────────────
// A row on page 3 must show the balance after every earlier row, not just the
// ones on its own page. Computing it in JS over the page would be wrong and
// wrong in a way nobody notices until they reconcile.
//
// So the running total is computed with $setWindowFields BEFORE $skip/$limit,
// over the whole matched set. The window is ['unbounded', 'current'], which is
// exactly "everything up to and including this row".
//
// The period's opening balance — everything before the from-date — is a
// separate aggregate, added on top.

const mongoose = require('mongoose');
const {
  FmsLedgerEntry, FmsAccount, FmsVoucher, FmsFinancialYear,
} = require('../../models/core');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Present a signed Dr−Cr amount the way an accountant reads it.
 *
 * The ledger stores everything as Σdebit − Σcredit, so an income account with
 * ₹5,000 of income holds −500000. Reporting that as "-5000.00" is technically
 * true and practically useless. Natural presentation flips the sign for
 * credit-normal accounts and labels the side.
 */
function present(signedPaise, normalBalance) {
  const natural = normalBalance === 'credit' ? -signedPaise : signedPaise;
  return {
    balance: signedPaise,                                  // raw Dr − Cr
    naturalBalance: natural,                               // positive = normal side
    drCr: signedPaise === 0 ? null : (signedPaise > 0 ? 'Dr' : 'Cr'),
  };
}

/** Shared filter builder. `school` always comes from the caller's scope. */
function buildFilter(school, q = {}) {
  const filter = { school: oid(school) };

  if (q.financialYear) filter.financialYear = oid(q.financialYear);
  if (q.account) filter.account = oid(q.account);
  if (q.voucher) filter.voucher = oid(q.voucher);
  if (q.voucherType) filter.voucherType = q.voucherType;
  if (q.party) filter.party = oid(q.party);
  if (q.partyType) filter.partyType = q.partyType;

  if (q.from || q.to) {
    filter.entryDate = {};
    if (q.from) {
      const d = new Date(q.from);
      if (Number.isNaN(d.getTime())) throw errors.badRequest("Invalid 'from' date");
      filter.entryDate.$gte = d;
    }
    if (q.to) {
      const d = new Date(q.to);
      if (Number.isNaN(d.getTime())) throw errors.badRequest("Invalid 'to' date");
      // Inclusive of the whole 'to' day — a user asking for entries "to 31 Mar"
      // means the 31st included, not up to midnight on the 31st.
      d.setUTCHours(23, 59, 59, 999);
      filter.entryDate.$lte = d;
    }
  }

  if (q.minAmount) {
    const n = Number(q.minAmount);
    if (!Number.isInteger(n)) throw errors.badRequest('minAmount must be integer paise');
    filter.$or = [{ debit: { $gte: n } }, { credit: { $gte: n } }];
  }

  return filter;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /ledger — the general journal, flat
// ─────────────────────────────────────────────────────────────────────────────

async function entries(school, q, { skip, limit, sort }) {
  const filter = buildFilter(school, q);

  const [items, total, totals] = await Promise.all([
    FmsLedgerEntry.find(filter)
      .select('_id entryDate voucher voucherNumber voucherType account accountCode accountName ' +
              'debit credit narration partyType party partyName isReversal status')
      .sort(sort).skip(skip).limit(limit).lean(),
    FmsLedgerEntry.countDocuments(filter),
    FmsLedgerEntry.aggregate([
      { $match: filter },
      { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ]),
  ]);

  const debit = totals[0]?.debit || 0;
  const credit = totals[0]?.credit || 0;

  return {
    items,
    total,
    // Totals for the WHOLE filtered set, not just this page — a page total
    // would be meaningless for reconciliation.
    summary: { totalDebit: debit, totalCredit: credit, difference: debit - credit, balanced: debit === credit },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /ledger/accounts/:id — one account's statement, with running balance
// ─────────────────────────────────────────────────────────────────────────────

async function accountLedger(school, accountId, q, { skip, limit }) {
  const account = await FmsAccount.findOne({ _id: accountId, school: oid(school) }).lean();
  if (!account) throw errors.notFound('Account');

  const filter = buildFilter(school, { ...q, account: accountId });

  // Opening balance: everything strictly before the period start.
  let openingBalance = 0;
  if (q.from) {
    const from = new Date(q.from);
    const [before] = await FmsLedgerEntry.aggregate([
      { $match: { school: oid(school), account: oid(accountId), entryDate: { $lt: from } } },
      { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ]);
    openingBalance = (before?.debit || 0) - (before?.credit || 0);
  }

  // $setWindowFields runs over the full matched set BEFORE $skip, so a row on
  // page 3 carries the balance after every earlier row — which is the whole
  // point and the thing a JS loop over the page would get wrong.
  const rows = await FmsLedgerEntry.aggregate([
    { $match: filter },
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
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        entryDate: 1, voucher: 1, voucherNumber: 1, voucherType: 1,
        debit: 1, credit: 1, narration: 1,
        partyType: 1, party: 1, partyName: 1, isReversal: 1,
        runningBalance: { $add: [openingBalance, '$movement'] },
      },
    },
  ]);

  const [totals] = await FmsLedgerEntry.aggregate([
    { $match: filter },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, n: { $sum: 1 } } },
  ]);

  const periodDebit = totals?.debit || 0;
  const periodCredit = totals?.credit || 0;
  const closing = openingBalance + periodDebit - periodCredit;

  return {
    account: {
      _id: account._id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
    },
    period: { from: q.from || null, to: q.to || null },
    opening: present(openingBalance, account.normalBalance),
    movement: { totalDebit: periodDebit, totalCredit: periodCredit },
    closing: present(closing, account.normalBalance),
    entries: rows.map((r) => ({
      ...r,
      ...present(r.runningBalance, account.normalBalance),
    })),
    total: totals?.n || 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /ledger/trial-balance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-account totals plus the system-wide check.
 *
 * `balanced` must be true. If it is ever false the ledger is corrupt, and the
 * only way that can happen is a write that bypassed LedgerPostingService.
 */
async function trialBalance(school, q = {}) {
  const filter = buildFilter(school, q);

  const rows = await FmsLedgerEntry.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$account',
        accountCode: { $first: '$accountCode' },
        accountName: { $first: '$accountName' },
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
        entries: { $sum: 1 },
      },
    },
    { $sort: { accountCode: 1 } },
  ]);

  // Account type/normalBalance come from the account, not the entry snapshot —
  // the snapshot deliberately preserves the historical code and name, but
  // classification for a report should reflect the chart as it stands.
  const accounts = await FmsAccount
    .find({ _id: { $in: rows.map((r) => r._id) } })
    .select('_id accountType normalBalance').lean();
  const meta = new Map(accounts.map((a) => [String(a._id), a]));

  let totalDebit = 0;
  let totalCredit = 0;

  const lines = rows.map((r) => {
    totalDebit += r.debit;
    totalCredit += r.credit;
    const m = meta.get(String(r._id));
    const signed = r.debit - r.credit;
    return {
      account: r._id,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountType: m?.accountType || null,
      normalBalance: m?.normalBalance || null,
      totalDebit: r.debit,
      totalCredit: r.credit,
      entries: r.entries,
      ...present(signed, m?.normalBalance),
    };
  });

  return {
    period: { from: q.from || null, to: q.to || null },
    lines,
    totals: {
      totalDebit,
      totalCredit,
      difference: totalDebit - totalCredit,
      balanced: totalDebit === totalCredit,
      accounts: lines.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /ledger/vouchers/:id — drill-down
// ─────────────────────────────────────────────────────────────────────────────

async function voucherDetail(school, voucherId) {
  const voucher = await FmsVoucher.findOne({ _id: voucherId, school: oid(school) }).lean();
  if (!voucher) throw errors.notFound('Voucher');

  // `school` is included so the { school, voucher } index can serve this. A
  // query on `voucher` alone cannot use a compound index whose leading key is
  // school — it COLLECTION-SCANNED the largest collection in the system on
  // every voucher view. The index audit found it; nothing else would have.
  const lines = await FmsLedgerEntry
    .find({ school: oid(school), voucher: voucher._id })
    .select('_id account accountCode accountName debit credit narration partyType party partyName isReversal')
    .sort({ debit: -1, _id: 1 })          // debits first, the conventional order
    .lean();

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

  const [fy, reversal, reversed] = await Promise.all([
    FmsFinancialYear.findById(voucher.financialYear).select('yearCode fyStatus').lean(),
    voucher.reversedBy
      ? FmsVoucher.findById(voucher.reversedBy).select('_id voucherNumber voucherDate').lean()
      : null,
    voucher.reversalOf
      ? FmsVoucher.findById(voucher.reversalOf).select('_id voucherNumber voucherDate').lean()
      : null,
  ]);

  return {
    voucher: {
      _id: voucher._id,
      voucherNumber: voucher.voucherNumber,
      voucherType: voucher.voucherType,
      voucherDate: voucher.voucherDate,
      narration: voucher.narration,
      totalAmount: voucher.totalAmount,
      voucherStatus: voucher.voucherStatus,
      source: voucher.source,
      sourceKey: voucher.sourceKey,
      postedBy: voucher.postedBy,
      postedAt: voucher.postedAt,
      financialYear: fy || null,
    },
    lines,
    totals: { totalDebit, totalCredit, balanced: totalDebit === totalCredit },
    // Both directions, so the UI can navigate a correction chain either way.
    reversedBy: reversal,
    reversalOf: reversed,
  };
}

module.exports = {
  entries,
  accountLedger,
  trialBalance,
  voucherDetail,
  buildFilter,
  present,
};