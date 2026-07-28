// backend/fms/services/banking/bankingService.js
//
// Banking & Reconciliation. SRS M9 / FR-M9, BPMN WF7, screens SCR-36..42.
//
// Bank movements post to the GL like anything else:
//   deposit   Dr <bank>        Cr <source, usually cash>
//   withdraw  Dr <destination> Cr <bank>
//   transfer  Dr <bank B>      Cr <bank A>
//
// Reconciliation itself posts NOTHING. It records which statement lines
// correspond to which postings. A reconciliation that changed the ledger would
// be adjusting the books to fit the bank, which is the opposite of the point.

const mongoose = require('mongoose');
const {
  FmsAccount, FmsFinancialYear, FmsLedgerEntry, FmsAuditTrail,
} = require('../../models/core');
const {
  FmsBankAccount, FmsBankTransaction, FmsBankReconciliation,
} = require('../../models/banking');
const posting = require('../ledger/LedgerPostingService');
const matcher = require('./statementMatcher');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const LOCKED_FY = ['closed', 'locked'];

async function audit({ school, entity, doc, action, before, after, req }) {
  await FmsAuditTrail.create({
    school, entity, entityId: doc?._id, action, before, after,
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bank accounts
// ─────────────────────────────────────────────────────────────────────────────

async function createAccount(school, payload, req) {
  const ledger = await FmsAccount.findOne({ _id: payload.ledgerAccount, school }).lean();
  if (!ledger) throw errors.validation('Validation failed', { ledgerAccount: 'account not found' });
  if (!ledger.isBankAccount) {
    throw errors.validation('Validation failed', {
      ledgerAccount: `${ledger.accountCode} is not flagged as a bank account`,
    });
  }

  const clashNumber = await FmsBankAccount.findOne({ school, accountNumber: payload.accountNumber }).lean();
  if (clashNumber) throw errors.conflict(`Account number ${payload.accountNumber} already exists`);

  const clashLedger = await FmsBankAccount.findOne({ school, ledgerAccount: ledger._id }).lean();
  if (clashLedger) {
    throw errors.conflict(
      `${ledger.accountCode} is already used by ${clashLedger.accountName}`,
      { hint: 'Each bank account needs its own GL head, or their balances cannot be told apart.' }
    );
  }

  const doc = await FmsBankAccount.create({
    school,
    accountName: payload.accountName,
    accountNumber: payload.accountNumber,
    ifsc: payload.ifsc,
    bankName: payload.bankName,
    branch: payload.branch,
    accountType: payload.accountType || 'current',
    ledgerAccount: ledger._id,
    ledgerAccountCode: ledger.accountCode,
    openingBalance: payload.openingBalance || 0,
    openingDate: payload.openingDate ? new Date(payload.openingDate) : undefined,
    overdraftLimit: payload.overdraftLimit || 0,
    chequeSeriesFrom: payload.chequeSeriesFrom,
    chequeSeriesTo: payload.chequeSeriesTo,
    isPrimary: !!payload.isPrimary,
    notes: payload.notes,
    createdBy: req?.user?._id,
  });

  await audit({ school, entity: 'fms_bankaccounts', doc, action: 'create', after: doc.toObject(), req });
  return doc;
}

/** Balance from the ledger, plus the opening balance the bank started from. */
async function accountBalance(school, bankAccountId) {
  const acct = await FmsBankAccount.findOne({ _id: bankAccountId, school }).lean();
  if (!acct) throw errors.notFound('Bank account');

  const [agg] = await FmsLedgerEntry.aggregate([
    { $match: { school: oid(school), account: oid(acct.ledgerAccount) } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, n: { $sum: 1 } } },
  ]);

  const posted = (agg?.debit || 0) - (agg?.credit || 0);
  return {
    accountName: acct.accountName,
    accountNumber: acct.accountNumber,
    openingBalance: acct.openingBalance,
    postedMovement: posted,
    bookBalance: acct.openingBalance + posted,
    entries: agg?.n || 0,
    overdraftLimit: acct.overdraftLimit,
    isOverdrawn: acct.openingBalance + posted < 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Movements
// ─────────────────────────────────────────────────────────────────────────────

/** Money into or out of a bank account, posted to the GL. */
async function recordMovement(school, payload, req) {
  const { bankAccount, movementType, amount, counterAccount, valueDate, narration, reference } = payload;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw errors.validation('Validation failed', { amount: 'must be a positive integer in paise' });
  }
  if (!['deposit', 'withdrawal'].includes(movementType)) {
    throw errors.validation('Validation failed', { movementType: "must be 'deposit' or 'withdrawal'" });
  }

  const bank = await FmsBankAccount.findOne({ _id: bankAccount, school }).lean();
  if (!bank) throw errors.notFound('Bank account');
  if (!bank.isActive) throw errors.conflict(`${bank.accountName} is not active`);

  const counter = await FmsAccount.findOne({ _id: counterAccount, school }).lean();
  if (!counter) throw errors.validation('Validation failed', { counterAccount: 'account not found' });
  if (!counter.isPostable || counter.status !== 'active') {
    throw errors.validation('Validation failed', {
      counterAccount: `${counter.accountCode} is ${!counter.isPostable ? 'not postable' : counter.status}`,
    });
  }

  const date = new Date(valueDate || Date.now());
  const fy = await FmsFinancialYear.findOne({
    school, startDate: { $lte: date }, endDate: { $gte: date },
  }).lean();
  if (!fy) throw errors.validation('Validation failed', { valueDate: 'no financial year covers this date' });
  if (LOCKED_FY.includes(fy.fyStatus)) throw errors.conflict(`Financial year ${fy.yearCode} is ${fy.fyStatus}`);

  await assertPeriodOpen(school, bank._id, date);

  const bankLine = { account: bank.ledgerAccount, narration: narration || movementType };
  const counterLine = { account: counter._id, narration: narration || movementType };

  if (movementType === 'deposit') {
    bankLine.debit = amount; bankLine.credit = 0;
    counterLine.debit = 0; counterLine.credit = amount;
  } else {
    bankLine.debit = 0; bankLine.credit = amount;
    counterLine.debit = amount; counterLine.credit = 0;
  }

  const result = await posting.post({
    school, financialYear: fy._id,
    voucherType: movementType === 'deposit' ? 'receipt' : 'payment',
    voucherDate: date,
    narration: narration || `${movementType} — ${bank.accountName}`,
    referenceNumber: reference,
    source: 'bank', sourceId: undefined,
    postedBy: req?.user?._id,
    lines: [bankLine, counterLine],
  });

  return { voucher: result.voucher, entries: result.entries, bankAccount: bank };
}

/** Move money between two of the school's own accounts. */
async function transfer(school, payload, req) {
  const { fromBankAccount, toBankAccount, amount, valueDate, narration, reference } = payload;

  if (String(fromBankAccount) === String(toBankAccount)) {
    throw errors.validation('Validation failed', {
      toBankAccount: 'a transfer needs two different accounts',
    });
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw errors.validation('Validation failed', { amount: 'must be a positive integer in paise' });
  }

  const [from, to] = await Promise.all([
    FmsBankAccount.findOne({ _id: fromBankAccount, school }).lean(),
    FmsBankAccount.findOne({ _id: toBankAccount, school }).lean(),
  ]);
  if (!from) throw errors.notFound('Source bank account');
  if (!to) throw errors.notFound('Destination bank account');

  const date = new Date(valueDate || Date.now());
  const fy = await FmsFinancialYear.findOne({
    school, startDate: { $lte: date }, endDate: { $gte: date },
  }).lean();
  if (!fy) throw errors.validation('Validation failed', { valueDate: 'no financial year covers this date' });
  if (LOCKED_FY.includes(fy.fyStatus)) throw errors.conflict(`Financial year ${fy.yearCode} is ${fy.fyStatus}`);

  await assertPeriodOpen(school, from._id, date);
  await assertPeriodOpen(school, to._id, date);

  const result = await posting.post({
    school, financialYear: fy._id, voucherType: 'payment', voucherDate: date,
    narration: narration || `Transfer ${from.accountName} → ${to.accountName}`,
    referenceNumber: reference, source: 'bank',
    postedBy: req?.user?._id,
    lines: [
      { account: to.ledgerAccount, debit: amount, credit: 0, narration: `From ${from.accountName}` },
      { account: from.ledgerAccount, debit: 0, credit: amount, narration: `To ${to.accountName}` },
    ],
  });

  return { voucher: result.voucher, entries: result.entries };
}

// ─────────────────────────────────────────────────────────────────────────────
// Statement import
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Import a CSV statement.
 *
 * Rows that fail to parse are REPORTED, never skipped quietly. A statement
 * import that silently drops three lines produces a reconciliation that will
 * never balance, and nothing says why.
 */
async function importStatement(school, bankAccountId, { csv, mapping }, req) {
  const bank = await FmsBankAccount.findOne({ _id: bankAccountId, school }).lean();
  if (!bank) throw errors.notFound('Bank account');

  const parsed = matcher.parseStatement(csv, mapping || {});
  if (!parsed.rows.length) {
    throw errors.validation('Nothing could be imported', {
      errors: parsed.errors,
      headers: parsed.headers,
      hint: 'Check the column mapping against the headers listed here.',
    });
  }

  const importBatch = `IMP-${Date.now()}`;
  const inserted = [];
  const duplicates = [];

  for (const row of parsed.rows) {
    try {
      const doc = await FmsBankTransaction.create({
        school, bankAccount: bank._id,
        valueDate: row.valueDate,
        narration: row.narration,
        reference: row.reference,
        statementDirection: row.statementDirection,
        amount: row.amount,
        runningBalance: row.runningBalance,
        reconciliationStatus: 'unreconciled',
        importBatch,
        sourceLine: row.lineNumber,
        rawLine: row.raw,
        createdBy: req?.user?._id,
      });
      inserted.push(doc);
    } catch (err) {
      if (err.code === 11000) {
        // Re-importing an overlapping range is normal and harmless — the index
        // absorbs it rather than doubling the transaction.
        duplicates.push({ line: row.lineNumber, narration: row.narration, amount: row.amount });
      } else {
        throw err;
      }
    }
  }

  await FmsAuditTrail.create({
    school, entity: 'fms_banktransactions', entityId: bank._id,
    action: 'create',
    after: { importBatch, inserted: inserted.length, duplicates: duplicates.length, errors: parsed.errors.length },
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
  });

  return {
    importBatch,
    imported: inserted.length,
    duplicatesSkipped: duplicates.length,
    duplicates,
    parseErrors: parsed.errors,
    headers: parsed.headers,
    summary:
      `${inserted.length} imported` +
      (duplicates.length ? `, ${duplicates.length} already present` : '') +
      (parsed.errors.length ? `, ${parsed.errors.length} row(s) could not be read` : ''),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching and reconciliation
// ─────────────────────────────────────────────────────────────────────────────

/** Ledger entries on this bank account, in period, not yet matched. */
async function unmatchedEntries(school, bank, from, to) {
  const matched = await FmsBankTransaction
    .find({ school, bankAccount: bank._id, matchedEntry: { $ne: null } })
    .distinct('matchedEntry');

  return FmsLedgerEntry.find({
    school: oid(school),
    account: oid(bank.ledgerAccount),
    entryDate: { $gte: from, $lte: to },
    _id: { $nin: matched },
  }).select('_id entryDate debit credit narration voucher voucherNumber').lean();
}

/** Run auto-matching. Applies confident matches; returns the rest for review. */
async function autoMatch(school, bankAccountId, { from, to, apply = true }, req) {
  const bank = await FmsBankAccount.findOne({ _id: bankAccountId, school }).lean();
  if (!bank) throw errors.notFound('Bank account');

  const start = new Date(from);
  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);

  const lines = await FmsBankTransaction.find({
    school, bankAccount: bank._id,
    valueDate: { $gte: start, $lte: end },
    reconciliationStatus: 'unreconciled',
  }).lean();

  // Widen the ledger window by the date tolerance: a cheque written in June
  // and cleared in July belongs to July's statement.
  const tol = matcher.DEFAULTS.dateToleranceDays;
  const entries = await unmatchedEntries(
    school, bank,
    new Date(start.getTime() - tol * 86400000),
    new Date(end.getTime() + tol * 86400000)
  );

  const result = matcher.matchStatement(
    lines.map((l) => ({ ...l, lineNumber: String(l._id) })),
    entries
  );

  let applied = 0;
  if (apply) {
    for (const r of result.results) {
      if (!r.autoMatched) continue;
      await FmsBankTransaction.updateOne(
        { _id: r.line._id },
        {
          $set: {
            reconciliationStatus: 'matched',
            matchedEntry: r.entry._id,
            matchedVoucher: r.entry.voucher,
            matchConfidence: r.confidence,
            matchedBy: req?.user?._id,
            matchedAt: new Date(),
            matchNote: `Auto: ${r.reason}`,
          },
        }
      );
      applied += 1;
    }
  }

  return {
    ...result,
    applied,
    suggestions: result.results.filter((r) => r.matched && !r.autoMatched).map((r) => ({
      transactionId: r.line._id,
      narration: r.line.narration,
      amount: r.line.amount,
      suggestedEntry: r.entry._id,
      confidence: r.confidence,
      reason: r.reason,
    })),
  };
}

/** Match one statement line to one ledger entry by hand. */
async function manualMatch(school, transactionId, entryId, req, note) {
  const txn = await FmsBankTransaction.findOne({ _id: transactionId, school });
  if (!txn) throw errors.notFound('Bank transaction');
  if (txn.reconciliationStatus === 'reconciled') {
    throw errors.conflict('This line belongs to a completed reconciliation');
  }

  const entry = await FmsLedgerEntry.findOne({ _id: entryId, school }).lean();
  if (!entry) throw errors.notFound('Ledger entry');

  const taken = await FmsBankTransaction.findOne({
    school, matchedEntry: entry._id, _id: { $ne: txn._id },
  }).lean();
  if (taken) {
    throw errors.conflict(
      'That ledger entry is already matched to another statement line',
      {
        hint: 'One posting is one movement of money. Matching it twice would ' +
              'reconcile the same payment against two statement lines.',
        otherTransaction: taken._id,
      }
    );
  }

  // A human may override the direction check, but should be told they are
  // doing it rather than discovering it later.
  const want = matcher.ledgerDirectionOf(txn.statementDirection);
  const got = (entry.debit || 0) > 0 ? 'debit' : 'credit';
  const directionMismatch = want !== got;
  const entryAmount = (entry.debit || 0) + (entry.credit || 0);
  const amountMismatch = entryAmount !== txn.amount;

  const before = txn.toObject();
  txn.reconciliationStatus = 'matched';
  txn.matchedEntry = entry._id;
  txn.matchedVoucher = entry.voucher;
  txn.matchConfidence = 'manual';
  txn.matchedBy = req?.user?._id;
  txn.matchedAt = new Date();
  txn.matchNote = [
    note,
    directionMismatch ? 'WARNING: direction differs' : null,
    amountMismatch ? `WARNING: amount differs by ${entryAmount - txn.amount} paise` : null,
  ].filter(Boolean).join(' — ');
  await txn.save();

  await audit({ school, entity: 'fms_banktransactions', doc: txn, action: 'update', before, after: txn.toObject(), req });

  return { transaction: txn, warnings: { directionMismatch, amountMismatch } };
}

async function unmatch(school, transactionId, req) {
  const txn = await FmsBankTransaction.findOne({ _id: transactionId, school });
  if (!txn) throw errors.notFound('Bank transaction');
  if (txn.reconciliationStatus === 'reconciled') {
    throw errors.conflict(
      'This line belongs to a completed reconciliation and cannot be unmatched',
      { hint: 'Reopen the reconciliation first.' }
    );
  }

  const before = txn.toObject();
  txn.reconciliationStatus = 'unreconciled';
  txn.matchedEntry = null;
  txn.matchedVoucher = null;
  txn.matchConfidence = undefined;
  txn.matchNote = undefined;
  await txn.save();

  await audit({ school, entity: 'fms_banktransactions', doc: txn, action: 'update', before, after: txn.toObject(), req });
  return txn;
}

/** Refuse to post into a period already reconciled. */
async function assertPeriodOpen(school, bankAccountId, date) {
  const locked = await FmsBankReconciliation.findOne({
    school, bankAccount: bankAccountId,
    periodStatus: { $in: ['reconciled', 'locked'] },
    periodFrom: { $lte: date }, periodTo: { $gte: date },
  }).lean();

  if (locked) {
    throw errors.conflict(
      `This period is reconciled to ${locked.periodTo.toISOString().slice(0, 10)} and is closed to new postings`,
      {
        hint: 'Post to a later date, or reopen the reconciliation if it was completed in error.',
        reconciliationId: locked._id,
      }
    );
  }
}

/** The reconciliation position for a period. */
async function reconciliationPosition(school, bankAccountId, { from, to, bankClosingBalance }) {
  const bank = await FmsBankAccount.findOne({ _id: bankAccountId, school }).lean();
  if (!bank) throw errors.notFound('Bank account');

  const start = new Date(from);
  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);

  const [agg] = await FmsLedgerEntry.aggregate([
    { $match: { school: oid(school), account: oid(bank.ledgerAccount), entryDate: { $lte: end } } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);
  const bookBalance = bank.openingBalance + (agg?.debit || 0) - (agg?.credit || 0);

  const outstanding = await unmatchedEntries(school, bank, new Date(0), end);
  const unmatchedLines = await FmsBankTransaction.countDocuments({
    school, bankAccount: bank._id,
    valueDate: { $gte: start, $lte: end },
    reconciliationStatus: 'unreconciled',
  });
  const matchedLines = await FmsBankTransaction.countDocuments({
    school, bankAccount: bank._id,
    valueDate: { $gte: start, $lte: end },
    reconciliationStatus: { $in: ['matched', 'reconciled'] },
  });

  const stmt = matcher.reconciliationStatement({
    bankClosingBalance, bookBalance, unmatchedEntries: outstanding,
  });

  return {
    ...stmt,
    bankAccount: { _id: bank._id, accountName: bank.accountName, accountNumber: bank.accountNumber },
    period: { from: start, to: end },
    matchedCount: matchedLines,
    unmatchedStatementCount: unmatchedLines,
    unmatchedLedgerCount: outstanding.length,
    outstandingEntries: outstanding,
  };
}

/** Complete a reconciliation and close the period. */
async function reconcile(school, bankAccountId, payload, req) {
  const { from, to, bankClosingBalance, differenceExplanation, notes } = payload;

  const bank = await FmsBankAccount.findOne({ _id: bankAccountId, school }).lean();
  if (!bank) throw errors.notFound('Bank account');

  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);

  const exists = await FmsBankReconciliation.findOne({ school, bankAccount: bank._id, periodTo: end }).lean();
  if (exists) {
    throw errors.conflict(
      `This period is already reconciled`,
      { reconciliationId: exists._id, periodStatus: exists.periodStatus }
    );
  }

  const pos = await reconciliationPosition(school, bankAccountId, { from, to, bankClosingBalance });

  if (pos.unmatchedStatementCount > 0) {
    throw errors.conflict(
      `${pos.unmatchedStatementCount} statement line(s) are still unmatched`,
      {
        hint: 'Every line on the statement must be accounted for — match it, or ' +
              'post the movement it represents (bank charges, interest).',
        unmatchedStatementCount: pos.unmatchedStatementCount,
      }
    );
  }

  if (!pos.reconciled && (!differenceExplanation || !String(differenceExplanation).trim())) {
    throw errors.validation('Validation failed', {
      differenceExplanation:
        `is required — an unexplained difference of ${pos.difference} paise remains`,
      difference: pos.difference,
    });
  }

  const fy = await FmsFinancialYear.findOne({
    school, startDate: { $lte: end }, endDate: { $gte: end },
  }).lean();

  const doc = await FmsBankReconciliation.create({
    school, bankAccount: bank._id, financialYear: fy?._id,
    periodFrom: new Date(from), periodTo: end,
    bankClosingBalance,
    bookBalance: pos.bookBalance,
    unpresentedCheques: pos.unpresentedCheques,
    depositsInTransit: pos.depositsInTransit,
    adjustedBankBalance: pos.adjustedBankBalance,
    difference: pos.difference,
    matchedCount: pos.matchedCount,
    unmatchedStatementCount: pos.unmatchedStatementCount,
    unmatchedLedgerCount: pos.unmatchedLedgerCount,
    periodStatus: 'reconciled',
    reconciledBy: req?.user?._id,
    reconciledAt: new Date(),
    differenceExplanation,
    notes,
    createdBy: req?.user?._id,
  });

  // Freeze the matched lines against further change.
  await FmsBankTransaction.updateMany(
    { school, bankAccount: bank._id, valueDate: { $gte: new Date(from), $lte: end }, reconciliationStatus: 'matched' },
    { $set: { reconciliationStatus: 'reconciled', reconciliation: doc._id } }
  );

  await audit({ school, entity: 'fms_bankreconciliations', doc, action: 'approve', after: doc.toObject(), req });
  return { reconciliation: doc, position: pos };
}

/** Reopen a reconciliation completed in error. Always with a reason. */
async function reopen(school, reconciliationId, req, reason) {
  const rec = await FmsBankReconciliation.findOne({ _id: reconciliationId, school });
  if (!rec) throw errors.notFound('Reconciliation');
  if (rec.periodStatus === 'locked') {
    throw errors.conflict('This reconciliation is locked and cannot be reopened');
  }
  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', { reason: 'is required to reopen a reconciliation' });
  }

  const before = rec.toObject();
  rec.periodStatus = 'inProgress';
  rec.notes = `${rec.notes || ''}\nReopened: ${reason}`.trim();
  rec.updatedBy = req?.user?._id;
  await rec.save();

  await FmsBankTransaction.updateMany(
    { school, reconciliation: rec._id },
    { $set: { reconciliationStatus: 'matched' } }
  );

  await audit({ school, entity: 'fms_bankreconciliations', doc: rec, action: 'reopen', before, after: rec.toObject(), req });
  return rec;
}

module.exports = {
  createAccount, accountBalance, recordMovement, transfer,
  importStatement, autoMatch, manualMatch, unmatch,
  reconciliationPosition, reconcile, reopen,
  assertPeriodOpen, unmatchedEntries,
};