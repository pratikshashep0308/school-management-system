// backend/fms/services/settlement/settlementService.js
//
// Settling the online-collections clearing head.
// Per docs/discovery/04_integration_plan.md §5 and §6.
//
// ─── WHAT IS AND IS NOT BUILT HERE ───────────────────────────────────────────
// §5: **no payment gateway is installed.** No SDK, no webhook route, no
// settlement model, no credentials. The webhook design is documented and the
// endpoint returns "not configured" rather than pretending otherwise.
//
// §6: bank statement import IS built — that is P4.4, and this does not
// duplicate it.
//
// What sits between them is the thing that actually happens every week:
//
//   a parent pays online   →  Dr 1202 Bank — Online Collections
//                             Cr 4101 Fee Income
//   the money reaches the bank, days later, usually netted with other payments
//
// Until somebody posts that second step, 1202 keeps growing and the bank
// balance understates. §5 names this as a real ongoing manual task. This module
// does not remove it — no gateway means no automation is possible — but it
// makes it tractable: here is what is outstanding, here is how old it is, and
// here is one call to settle a batch against a bank credit.
//
// ─── WHY NOT JUST LET BANK RECONCILIATION HANDLE IT ──────────────────────────
// Because the bank statement shows ONE credit for a day's online collections
// while the clearing head holds a dozen individual receipts. Reconciliation
// matches one line to one entry. Settlement is the step that turns many into
// one, and it has to happen first.

const mongoose = require('mongoose');
const {
  FmsAccount, FmsLedgerEntry, FmsFinancialYear, FmsAuditTrail,
} = require('../../models/core');
const { FmsSettlement } = require('../../models/settlement');
const posting = require('../ledger/LedgerPostingService');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** §8.2 — where online and UPI collections land before settlement. */
const CLEARING_CODE = '1202';

/** Find the clearing account, or say clearly why settlement cannot run. */
async function clearingAccount(school) {
  const a = await FmsAccount.findOne({
    school: oid(school), accountCode: CLEARING_CODE, status: 'active',
  }).lean();

  if (!a) {
    throw errors.conflict(
      `No '${CLEARING_CODE} Bank — Online Collections' account exists`,
      {
        hint:
          'Online and UPI receipts post to this clearing head so the bank balance ' +
          'is not overstated before settlement. Create it in the Chart of Accounts.',
      }
    );
  }
  return a;
}

/**
 * What is sitting in the clearing head, unsettled.
 *
 * An entry is unsettled if it is a DEBIT to the clearing account that no
 * settlement has yet claimed. Credits to that account ARE the settlements.
 */
async function pending(school, { from, to, olderThanDays } = {}) {
  const clearing = await clearingAccount(school);

  const claimed = new Set(
    (await FmsSettlement.find({ school: oid(school), settlementStatus: 'settled' })
      .select('clearedEntries').lean())
      .flatMap((s) => (s.clearedEntries || []).map((e) => String(e)))
  );

  const match = {
    school: oid(school),
    account: clearing._id,
    debit: { $gt: 0 },
    isReversal: { $ne: true },
  };
  if (from || to) {
    match.entryDate = {};
    if (from) match.entryDate.$gte = new Date(from);
    if (to) {
      const d = new Date(to); d.setUTCHours(23, 59, 59, 999);
      match.entryDate.$lte = d;
    }
  }

  const all = await FmsLedgerEntry.find(match)
    .select('_id entryDate voucher voucherNumber debit narration partyName referenceNumber')
    .sort({ entryDate: 1 }).lean();

  const now = Date.now();
  const unsettled = all
    .filter((e) => !claimed.has(String(e._id)))
    .map((e) => ({
      ...e,
      ageDays: Math.floor((now - new Date(e.entryDate).getTime()) / 86400000),
    }))
    .filter((e) => (olderThanDays ? e.ageDays >= olderThanDays : true));

  const total = unsettled.reduce((s, e) => s + e.debit, 0);

  // Age buckets, because a receipt sitting in clearing for three weeks means
  // either the money never arrived or nobody has settled it — and those are
  // very different problems.
  const buckets = { '0-3': 0, '4-7': 0, '8-14': 0, '15+': 0 };
  for (const e of unsettled) {
    const k = e.ageDays <= 3 ? '0-3' : e.ageDays <= 7 ? '4-7' : e.ageDays <= 14 ? '8-14' : '15+';
    buckets[k] += e.debit;
  }

  return {
    clearingAccount: { _id: clearing._id, code: clearing.accountCode, name: clearing.accountName },
    count: unsettled.length,
    totalAmount: total,
    ageBuckets: buckets,
    oldestAgeDays: unsettled.length ? Math.max(...unsettled.map((e) => e.ageDays)) : 0,
    entries: unsettled,
    note: unsettled.some((e) => e.ageDays >= 15)
      ? 'Some receipts have been in clearing for over a fortnight — check whether the money actually arrived'
      : undefined,
  };
}

/**
 * Settle a batch: the money has reached the bank.
 *
 *     Dr 1201 Bank            settlementAmount
 *         Cr 1202 Clearing                grossAmount
 *         Dr <fee head>                   fees withheld (if any)
 *
 * A gateway usually credits the NET of its charges. Where that happens, the
 * difference is a real expense and must be posted — netting it silently against
 * income would understate both.
 */
async function settle(school, payload, req) {
  const { entryIds, bankAccount, settlementReference, settlementDate,
    settledAmount, feeAccount, narration } = payload;

  if (!Array.isArray(entryIds) || entryIds.length === 0) {
    throw errors.validation('Validation failed', { entryIds: 'at least one entry is required' });
  }
  if (!settlementReference || !String(settlementReference).trim()) {
    throw errors.validation('Validation failed', {
      settlementReference: 'is required — it is the idempotency key for this settlement',
    });
  }

  const existing = await FmsSettlement.findOne({
    school: oid(school), settlementReference: String(settlementReference).trim(),
  }).lean();
  if (existing) {
    throw errors.conflict(
      `Settlement '${settlementReference}' has already been recorded`,
      { settlementId: existing._id, settledAt: existing.settledAt, hint: 'A replay changes nothing.' }
    );
  }

  const clearing = await clearingAccount(school);

  const bank = await FmsAccount.findOne({ _id: bankAccount, school: oid(school) }).lean();
  if (!bank) throw errors.validation('Validation failed', { bankAccount: 'account not found' });
  if (!bank.isBankAccount) {
    throw errors.validation('Validation failed', {
      bankAccount: `${bank.accountCode} is not a bank account — settlement lands in a bank`,
    });
  }

  const entries = await FmsLedgerEntry.find({
    _id: { $in: entryIds.map(oid) }, school: oid(school), account: clearing._id,
  }).lean();

  if (entries.length !== entryIds.length) {
    throw errors.validation('Validation failed', {
      entryIds:
        `${entryIds.length - entries.length} of these are not clearing-account entries ` +
        'for this school',
    });
  }

  // An entry already settled must not be settled again — that would credit the
  // clearing head twice for money that arrived once.
  const already = await FmsSettlement.findOne({
    school: oid(school), settlementStatus: 'settled',
    clearedEntries: { $in: entries.map((e) => e._id) },
  }).lean();
  if (already) {
    throw errors.conflict(
      'One or more of these entries is already settled',
      { settlementReference: already.settlementReference, settlementId: already._id }
    );
  }

  const gross = entries.reduce((s, e) => s + (e.debit || 0), 0);
  if (gross === 0) {
    throw errors.validation('Validation failed', { entryIds: 'these entries total zero' });
  }

  const net = Number.isInteger(settledAmount) ? settledAmount : gross;
  const charges = gross - net;

  if (charges < 0) {
    throw errors.validation('Validation failed', {
      settledAmount: `${net} exceeds the ${gross} being cleared — a settlement cannot exceed its receipts`,
    });
  }

  let feeAcct = null;
  if (charges > 0) {
    if (!feeAccount) {
      throw errors.validation('Validation failed', {
        feeAccount:
          `the settlement is ${charges} paise short of the ${gross} cleared — ` +
          'name an expense account for the charges',
        gross, settled: net, charges,
      });
    }
    feeAcct = await FmsAccount.findOne({ _id: feeAccount, school: oid(school) }).lean();
    if (!feeAcct) throw errors.validation('Validation failed', { feeAccount: 'account not found' });
    if (feeAcct.accountType !== 'expense') {
      throw errors.validation('Validation failed', {
        feeAccount: `${feeAcct.accountCode} is ${feeAcct.accountType} — charges are an expense`,
      });
    }
  }

  const when = new Date(settlementDate || Date.now());
  if (Number.isNaN(when.getTime())) {
    throw errors.validation('Validation failed', { settlementDate: 'must be a valid date' });
  }

  const fy = await FmsFinancialYear.findOne({
    school: oid(school), startDate: { $lte: when }, endDate: { $gte: when },
  }).lean();
  if (!fy) {
    throw errors.validation('Validation failed', {
      settlementDate: `no financial year covers ${when.toISOString().slice(0, 10)}`,
    });
  }
  if (['closed', 'locked'].includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year ${fy.yearCode} is ${fy.fyStatus}`);
  }

  const lines = [
    {
      account: bank._id, debit: net, credit: 0,
      narration: narration || `Settlement ${settlementReference}`,
    },
  ];
  if (charges > 0) {
    lines.push({
      account: feeAcct._id, debit: charges, credit: 0,
      narration: `Gateway charges on ${settlementReference}`,
    });
  }
  lines.push({
    account: clearing._id, debit: 0, credit: gross,
    narration: `${entries.length} online receipt(s) settled`,
  });

  const result = await posting.post({
    school: oid(school),
    financialYear: fy._id,
    voucherType: 'journal',
    voucherDate: when,
    narration: narration || `Online collections settled — ${settlementReference}`,
    referenceNumber: String(settlementReference).trim(),
    source: 'gateway',
    sourceId: String(settlementReference).trim(),
    postedBy: req?.user?._id,
    lines,
  });

  const doc = await FmsSettlement.create({
    school: oid(school),
    financialYear: fy._id,
    settlementReference: String(settlementReference).trim(),
    settlementDate: when,
    clearingAccount: clearing._id,
    bankAccount: bank._id,
    grossAmount: gross,
    settledAmount: net,
    charges,
    chargeAccount: feeAcct?._id || null,
    clearedEntries: entries.map((e) => e._id),
    entryCount: entries.length,
    settlementStatus: 'settled',
    voucher: result.voucher._id,
    voucherNumber: result.voucher.voucherNumber,
    settledBy: req?.user?._id,
    settledAt: new Date(),
    createdBy: req?.user?._id,
  });

  await FmsAuditTrail.create({
    school: oid(school), entity: 'fms_settlements', entityId: doc._id,
    action: 'post', after: doc.toObject(),
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip,
  });

  return { settlement: doc, voucher: result.voucher, entries: result.entries };
}

/** Reverse a settlement — the credit bounced, or it was matched wrongly. */
async function reverse(school, settlementId, req, reason) {
  const s = await FmsSettlement.findOne({ _id: settlementId, school: oid(school) });
  if (!s) throw errors.notFound('Settlement');

  if (s.settlementStatus === 'reversed') {
    throw errors.conflict('This settlement is already reversed');
  }
  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', { reason: 'is required' });
  }

  const before = s.toObject();
  const result = await posting.reverse(s.voucher, req?.user?._id, `Settlement reversed: ${reason}`);

  s.settlementStatus = 'reversed';
  s.reversalVoucher = result.reversal._id;
  s.reversedAt = new Date();
  s.reversedBy = req?.user?._id;
  s.reversalReason = reason;
  await s.save();

  await FmsAuditTrail.create({
    school: oid(school), entity: 'fms_settlements', entityId: s._id,
    action: 'reverse', before, after: s.toObject(),
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip,
  });

  // The entries return to pending: `pending()` only excludes entries claimed by
  // a SETTLED settlement, so a reversal releases them automatically.
  return { settlement: s, reversal: result.reversal, releasedEntries: s.entryCount };
}

/**
 * A suggestion for what a given bank credit probably settles.
 *
 * Deliberately a SUGGESTION. It proposes the oldest run of clearing entries
 * that sums to the credit, and refuses to guess when nothing fits — settling
 * the wrong receipts would leave both the clearing head and the fee records
 * wrong in ways that are painful to unpick.
 */
async function suggest(school, { amount, upToDate, tolerance = 0 }) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw errors.badRequest('amount must be a positive integer in paise');
  }

  const p = await pending(school, { to: upToDate });
  const entries = p.entries;

  // Exact run from the oldest — how a day's collections usually settle.
  let running = 0;
  const run = [];
  for (const e of entries) {
    run.push(e);
    running += e.debit;
    if (Math.abs(running - amount) <= tolerance) {
      return {
        matched: true, strategy: 'oldestRun',
        entries: run, gross: running,
        difference: running - amount,
        note: running === amount ? undefined : `${running - amount} paise of charges implied`,
      };
    }
    if (running > amount + tolerance) break;
  }

  // A single entry that fits exactly.
  const single = entries.find((e) => Math.abs(e.debit - amount) <= tolerance);
  if (single) {
    return { matched: true, strategy: 'singleEntry', entries: [single], gross: single.debit,
      difference: single.debit - amount };
  }

  return {
    matched: false,
    reason: 'No combination of the oldest clearing entries sums to this credit',
    pendingTotal: p.totalAmount,
    pendingCount: p.count,
    hint:
      'Settle by selecting entries explicitly. Guessing which receipts a credit ' +
      'covers would leave both the clearing head and the fee records wrong.',
  };
}

/** What settlement looks like right now. */
async function status(school) {
  let clearing;
  try {
    clearing = await clearingAccount(school);
  } catch (err) {
    return {
      gatewayConfigured: false,
      clearingAccountPresent: false,
      note: err.message,
    };
  }

  const p = await pending(school);
  const [settled, reversed] = await Promise.all([
    FmsSettlement.countDocuments({ school: oid(school), settlementStatus: 'settled' }),
    FmsSettlement.countDocuments({ school: oid(school), settlementStatus: 'reversed' }),
  ]);

  return {
    // §5: no gateway is installed. Stated rather than implied.
    gatewayConfigured: false,
    gatewayNote:
      'No payment gateway is installed — no SDK, no webhook route, no credentials. ' +
      'Online and UPI receipts accumulate in the clearing head and are settled ' +
      'manually here. This is expected, not a fault.',
    clearingAccountPresent: true,
    clearingAccount: { code: clearing.accountCode, name: clearing.accountName },
    pendingCount: p.count,
    pendingAmount: p.totalAmount,
    oldestAgeDays: p.oldestAgeDays,
    ageBuckets: p.ageBuckets,
    settlementsRecorded: settled,
    settlementsReversed: reversed,
    warning: p.oldestAgeDays >= 15
      ? `The oldest unsettled receipt is ${p.oldestAgeDays} days old — check whether the money arrived`
      : undefined,
  };
}

module.exports = {
  pending, settle, reverse, suggest, status, clearingAccount, CLEARING_CODE,
};