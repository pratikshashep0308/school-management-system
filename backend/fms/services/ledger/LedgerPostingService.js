// backend/fms/services/ledger/LedgerPostingService.js
//
// THE ONLY WRITER OF fms_ledgerentries.
//
// No controller, hook, script or ingest adapter writes ledger entries directly.
// The model layer enforces this too — fms_ledgerentries rejects updateOne,
// deleteOne and friends — but this service is the single door in.
//
// ─── INVARIANTS (DB Design §6.1) ─────────────────────────────────────────────
//  1. Balanced        Σ debit = Σ credit, in integer paise, checked BEFORE any write
//  2. Two legs        ≥ 2 lines; each line has exactly one of debit/credit
//  3. Append-only     entries are never updated or deleted — corrections reverse
//  4. Atomic          header + lines + number + balance cache + ingest state,
//                     all in one transaction, all or nothing
//  5. Idempotent      a source record posts exactly once, guaranteed by a unique
//                     index rather than by a read-then-write check
//  6. Period lock     rejected if the financial year is closed or locked
//
// ─── ONE DELIBERATE DEPARTURE FROM THE SPEC ──────────────────────────────────
// DB Design §6.3 guards idempotency with:
//     const existing = await Voucher.findOne({ source, sourceRef }).session(session);
//     if (existing) return;
//
// That is a read-then-write check. Two concurrent ingest runs can both read
// "not found" and both post — the exact double-posting this is meant to
// prevent (risk RR1). Serialisable transactions make it *unlikely*, not
// impossible, and MongoDB's snapshot isolation does not detect this conflict
// unless the documents overlap.
//
// Instead we INSERT into fms_ingeststate first, inside the transaction. The
// unique index on { school, source, sourceId } means the second writer gets
// E11000 and aborts. Idempotency becomes a database property, not a code
// promise.

const mongoose = require('mongoose');
const money = require('../../utils/money');
const {
  FmsVoucher,
  FmsLedgerEntry,
  FmsNumberSequence,
  FmsAccount,
  FmsFinancialYear,
  FmsIngestState,
} = require('../../models/core');

const VOUCHER_PREFIX = {
  income: 'INC',
  payment: 'PMT',
  receipt: 'RCT',
  journal: 'JV',
};

const LOCKED_FY = ['closed', 'locked'];

/** Thrown for anything the caller could have prevented. */
class PostingError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PostingError';
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure validation — no database access. Exported so it can be unit-tested
// without a replica set.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Array<{account, debit?, credit?}>} lines
 * @returns {{totalDebit:number, totalCredit:number}}
 * @throws {PostingError}
 */
function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new PostingError('A voucher needs at least two legs', 'TOO_FEW_LEGS');
  }

  for (const [i, l] of lines.entries()) {
    const dr = l.debit || 0;
    const cr = l.credit || 0;

    if (!Number.isInteger(dr) || !Number.isInteger(cr)) {
      throw new PostingError(
        `Line ${i}: amounts must be integer paise, got debit=${l.debit} credit=${l.credit}`,
        'NOT_INTEGER_PAISE'
      );
    }
    if (dr < 0 || cr < 0) {
      throw new PostingError(`Line ${i}: amounts must be non-negative`, 'NEGATIVE_AMOUNT');
    }
    if ((dr > 0 && cr > 0) || (dr === 0 && cr === 0)) {
      throw new PostingError(
        `Line ${i}: exactly one of debit/credit must be non-zero`,
        'BAD_LINE_DIRECTION'
      );
    }
    if (!l.account) {
      throw new PostingError(`Line ${i}: account is required`, 'MISSING_ACCOUNT');
    }
  }

  const totalDebit = money.sum(lines, (l) => l.debit || 0);
  const totalCredit = money.sum(lines, (l) => l.credit || 0);

  if (totalDebit !== totalCredit) {
    throw new PostingError(
      `Unbalanced voucher: Dr ${totalDebit} != Cr ${totalCredit} (paise)`,
      'UNBALANCED'
    );
  }
  if (totalDebit === 0) {
    throw new PostingError('Voucher total cannot be zero', 'ZERO_TOTAL');
  }

  return { totalDebit, totalCredit };
}

// ─────────────────────────────────────────────────────────────────────────────
// post()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Post one balanced voucher and its ledger lines, atomically.
 *
 * @param {Object}   p
 * @param {ObjectId} p.school
 * @param {ObjectId} p.financialYear
 * @param {String}   p.voucherType    income | payment | receipt | journal
 * @param {Date}     p.voucherDate
 * @param {String}   [p.narration]
 * @param {Array}    p.lines          [{ account, debit, credit, narration, party, partyType, partyName, department }]
 * @param {String}   [p.source]       manual | fee | payroll | expense | purchase | bank
 * @param {String}   [p.sourceId]     idempotency key — receiptNumber, slip _id, etc.
 * @param {ObjectId} [p.sourceRef]    the source document's _id, stored for traceability
 * @param {Number}   [p.sourceAmount] ORIGINAL float rupees from the SMS, for audit
 * @param {Object}   [p.sourceSnapshot]
 * @param {ObjectId} p.postedBy
 *
 * @returns {Promise<{voucher, entries, alreadyPosted:boolean}>}
 */
async function post(p) {
  // ── 1. Validate in memory. Fail before touching the database. ──────────────
  const { totalDebit } = validateLines(p.lines);

  if (!p.school) throw new PostingError('school is required', 'MISSING_SCHOOL');
  if (!p.financialYear) throw new PostingError('financialYear is required', 'MISSING_FY');
  if (!p.postedBy) throw new PostingError('postedBy is required', 'MISSING_POSTED_BY');
  if (!VOUCHER_PREFIX[p.voucherType]) {
    throw new PostingError(`Unknown voucherType '${p.voucherType}'`, 'BAD_VOUCHER_TYPE');
  }

  const source = p.source || 'manual';
  const isIngest = source !== 'manual';

  if (isIngest && !p.sourceId) {
    throw new PostingError(
      `source '${source}' requires a sourceId for idempotency`,
      'MISSING_SOURCE_ID'
    );
  }

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      // ── 2. Period lock ────────────────────────────────────────────────────
      const fy = await FmsFinancialYear
        .findOne({ _id: p.financialYear, school: p.school })
        .session(session);

      if (!fy) throw new PostingError('Financial year not found for this school', 'FY_NOT_FOUND');
      if (LOCKED_FY.includes(fy.fyStatus)) {
        throw new PostingError(
          `Financial year ${fy.yearCode} is ${fy.fyStatus}; posting is not allowed`,
          'FY_LOCKED'
        );
      }
      if (p.voucherDate < fy.startDate || p.voucherDate > fy.endDate) {
        throw new PostingError(
          `voucherDate ${p.voucherDate.toISOString().slice(0, 10)} is outside ${fy.yearCode}`,
          'DATE_OUTSIDE_FY'
        );
      }

      // ── 3. Idempotency — claim the key FIRST ──────────────────────────────
      // The unique index on { school, source, sourceId } is the guard. A
      // concurrent second writer gets E11000 here and its whole transaction
      // aborts, so it cannot proceed to write a duplicate voucher.
      let ingestDoc = null;
      if (isIngest) {
        const existing = await FmsIngestState
          .findOne({ school: p.school, source, sourceId: p.sourceId })
          .session(session);

        if (existing && existing.ingestStatus === 'posted') {
          const v = await FmsVoucher.findById(existing.voucher).session(session);
          result = { voucher: v, entries: [], alreadyPosted: true };
          return;                                   // no-op, transaction commits empty
        }

        if (existing) {
          // A previous attempt failed or was reversed. Reuse the row.
          ingestDoc = existing;
        } else {
          [ingestDoc] = await FmsIngestState.create([{
            school: p.school,
            source,
            sourceId: p.sourceId,
            ingestStatus: 'pending',
            sourceAmount: p.sourceAmount,
            postedAmount: totalDebit,
            sourceSnapshot: p.sourceSnapshot,
            attempts: 1,
            lastAttemptAt: new Date(),
          }], { session });
        }
      }

      // ── 4. Validate accounts ──────────────────────────────────────────────
      const ids = [...new Set(p.lines.map((l) => String(l.account)))];
      const accounts = await FmsAccount
        .find({ _id: { $in: ids }, school: p.school })
        .session(session);

      const byId = Object.fromEntries(accounts.map((a) => [String(a._id), a]));

      // A reconciled bank period is closed. Without this check, a journal
      // voucher could post into a month someone has already signed off — and a
      // reconciliation that can be altered afterwards has not reconciled
      // anything. Only bank accounts carry the restriction, so the lookup is
      // skipped entirely for everything else.
      const bankIds = accounts.filter((a) => a.isBankAccount).map((a) => a._id);
      if (bankIds.length) {
        const { FmsBankAccount } = require('../../models/banking');
        const locked = await FmsBankAccount.find({
          school: p.school,
          ledgerAccount: { $in: bankIds },
          reconciledUpTo: { $gte: p.voucherDate },
        }).select('accountName ledgerAccount reconciledUpTo').session(session).lean();

        if (locked.length) {
          const b = locked[0];
          throw new PostingError(
            `${b.accountName} is reconciled up to ` +
            `${b.reconciledUpTo.toISOString().slice(0, 10)}; a posting dated ` +
            `${p.voucherDate.toISOString().slice(0, 10)} would change a closed period`,
            'BANK_PERIOD_RECONCILED'
          );
        }
      }

      for (const id of ids) {
        const a = byId[id];
        if (!a) {
          throw new PostingError(`Account ${id} not found in this school`, 'ACCOUNT_NOT_FOUND');
        }
        if (!a.isPostable) {
          throw new PostingError(
            `Account ${a.accountCode} (${a.accountName}) is a grouping head, not postable`,
            'ACCOUNT_NOT_POSTABLE'
          );
        }
        if (a.status !== 'active') {
          throw new PostingError(
            `Account ${a.accountCode} is ${a.status}`,
            'ACCOUNT_INACTIVE'
          );
        }
      }

      // ── 5. Voucher number — atomic $inc within this transaction ───────────
      const prefix = VOUCHER_PREFIX[p.voucherType];
      const voucherNumber = await FmsNumberSequence.next(
        p.school, p.financialYear, prefix, prefix, fy.yearCode, session
      );

      // ── 6. Voucher header ─────────────────────────────────────────────────
      const [voucher] = await FmsVoucher.create([{
        school: p.school,
        financialYear: p.financialYear,
        voucherNumber,
        voucherType: p.voucherType,
        voucherDate: p.voucherDate,
        narration: p.narration || '',
        totalAmount: totalDebit,
        voucherStatus: 'posted',
        referenceNumber: p.referenceNumber,
        source,
        sourceRef: p.sourceRef,
        sourceKey: p.sourceId,
        sourceModel: p.sourceModel,
        postedBy: p.postedBy,
        postedAt: new Date(),
        status: 'active',
        createdBy: p.postedBy,
      }], { session });

      // ── 7. Ledger lines, with denormalised account snapshots ──────────────
      const docs = p.lines.map((l) => {
        const a = byId[String(l.account)];
        return {
          school: p.school,
          financialYear: p.financialYear,
          voucher: voucher._id,
          voucherNumber,
          voucherType: p.voucherType,
          account: a._id,
          accountCode: a.accountCode,      // snapshot — survives a later rename
          accountName: a.accountName,
          debit: l.debit || 0,
          credit: l.credit || 0,
          entryDate: p.voucherDate,
          narration: l.narration || p.narration || '',
          partyType: l.partyType || null,
          party: l.party || null,
          partyName: l.partyName,          // denormalised — survives SMS deletion
          department: l.department || null,
          costCenter: l.costCenter,
          isReversal: !!p.isReversal,
          reversalOf: l.reversalOf || null,
          postedBy: p.postedBy,
          status: 'posted',
        };
      });

      const entries = await FmsLedgerEntry.create(docs, { session, ordered: true });

      // ── 8. Balance cache. Authoritative balance is always the aggregate over
      //      ledger entries; this is a cache, maintained inside the same
      //      transaction so it cannot silently diverge.
      for (const l of p.lines) {
        await FmsAccount.updateOne(
          { _id: l.account },
          { $inc: { currentBalance: (l.debit || 0) - (l.credit || 0) } },
          { session }
        );
      }

      // ── 9. Close out the ingest state ─────────────────────────────────────
      if (ingestDoc) {
        await FmsIngestState.updateOne(
          { _id: ingestDoc._id },
          {
            $set: {
              ingestStatus: 'posted',
              voucher: voucher._id,
              postedAmount: totalDebit,
              postedAt: new Date(),
              lastError: null,
            },
          },
          { session }
        );
      }

      result = { voucher, entries, alreadyPosted: false };
    });
  } finally {
    await session.endSession();
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// reverse()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reverse a posted voucher by posting an equal-and-opposite one.
 * The original is never modified beyond its status flag.
 *
 * @param {ObjectId} voucherId
 * @param {ObjectId} postedBy
 * @param {String}   [reason]
 */
async function reverse(voucherId, postedBy, reason) {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const original = await FmsVoucher.findById(voucherId).session(session);
      if (!original) throw new PostingError('Voucher not found', 'VOUCHER_NOT_FOUND');
      if (original.voucherStatus === 'reversed') {
        throw new PostingError('Voucher is already reversed', 'ALREADY_REVERSED');
      }
      if (original.voucherStatus !== 'posted') {
        throw new PostingError(
          `Only posted vouchers can be reversed (this one is ${original.voucherStatus})`,
          'NOT_POSTED'
        );
      }

      const fy = await FmsFinancialYear.findById(original.financialYear).session(session);
      if (!fy || LOCKED_FY.includes(fy.fyStatus)) {
        throw new PostingError(
          `Financial year is ${fy ? fy.fyStatus : 'missing'}; reversal not allowed`,
          'FY_LOCKED'
        );
      }

      const originalLines = await FmsLedgerEntry
        .find({ voucher: original._id }).session(session);
      if (!originalLines.length) {
        throw new PostingError('Voucher has no ledger lines', 'NO_LINES');
      }

      const prefix = VOUCHER_PREFIX[original.voucherType];
      const voucherNumber = await FmsNumberSequence.next(
        original.school, original.financialYear, prefix, prefix, fy.yearCode, session
      );

      const [rev] = await FmsVoucher.create([{
        school: original.school,
        financialYear: original.financialYear,
        voucherNumber,
        voucherType: original.voucherType,
        voucherDate: new Date(),
        narration: `Reversal of ${original.voucherNumber}${reason ? ': ' + reason : ''}`,
        totalAmount: original.totalAmount,
        voucherStatus: 'posted',
        source: original.source,
        sourceRef: original.sourceRef,
        sourceKey: original.sourceKey,
        reversalOf: original._id,
        postedBy,
        postedAt: new Date(),
        status: 'active',
        createdBy: postedBy,
      }], { session });

      // Swap debit and credit.
      const docs = originalLines.map((l) => ({
        school: l.school,
        financialYear: l.financialYear,
        voucher: rev._id,
        voucherNumber,
        voucherType: l.voucherType,
        account: l.account,
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: l.credit,
        credit: l.debit,
        entryDate: rev.voucherDate,
        narration: `Reversal: ${l.narration || ''}`.trim(),
        partyType: l.partyType,
        party: l.party,
        partyName: l.partyName,
        department: l.department,
        isReversal: true,
        reversalOf: l._id,
        postedBy,
        status: 'posted',
      }));

      const entries = await FmsLedgerEntry.create(docs, { session, ordered: true });

      for (const l of originalLines) {
        await FmsAccount.updateOne(
          { _id: l.account },
          { $inc: { currentBalance: (l.credit || 0) - (l.debit || 0) } },
          { session }
        );
      }

      // The original voucher is marked, not modified. Its ledger lines are
      // untouched — append-only means the history stays readable.
      await FmsVoucher.updateOne(
        { _id: original._id },
        { $set: { voucherStatus: 'reversed', reversedBy: rev._id, updatedBy: postedBy } },
        { session }
      );

      // A reversal is terminal for that ingest key. If the source record
      // reappears it posts as a NEW voucher — reversals are never undone,
      // otherwise the audit trail stops being linear.
      if (original.source !== 'manual' && original.sourceKey) {
        await FmsIngestState.updateOne(
          { school: original.school, source: original.source, sourceId: original.sourceKey },
          { $set: { ingestStatus: 'reversed' } },
          { session }
        );
      }

      result = { reversal: rev, entries };
    });
  } finally {
    await session.endSession();
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Trial balance across all postings. Σ debit − Σ credit must be exactly 0. */
async function trialBalance(school, financialYear) {
  const match = { school: new mongoose.Types.ObjectId(String(school)) };
  if (financialYear) {
    match.financialYear = new mongoose.Types.ObjectId(String(financialYear));
  }

  const [totals] = await FmsLedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, lines: { $sum: 1 } } },
  ]);

  const debit = totals?.debit || 0;
  const credit = totals?.credit || 0;

  return { debit, credit, difference: debit - credit, balanced: debit === credit, lines: totals?.lines || 0 };
}

/** Recompute an account's balance from the ledger and compare with its cache. */
async function verifyAccountBalance(accountId) {
  const [agg] = await FmsLedgerEntry.aggregate([
    { $match: { account: new mongoose.Types.ObjectId(String(accountId)) } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);

  const computed = (agg?.debit || 0) - (agg?.credit || 0);
  const account = await FmsAccount.findById(accountId).lean();

  return {
    accountCode: account?.accountCode,
    cached: account?.currentBalance ?? null,
    computed,
    drift: (account?.currentBalance ?? 0) - computed,
  };
}

module.exports = {
  post,
  reverse,
  validateLines,
  trialBalance,
  verifyAccountBalance,
  PostingError,
  VOUCHER_PREFIX,
};