// backend/fms/services/financialYear/financialYearService.js
//
// Financial year open / close / lock. SRS M22 / FR-M22, screen SCR-67.
//
// ─── THE ENFORCEMENT ALREADY EXISTS ──────────────────────────────────────────
// LedgerPostingService refuses to post into a year whose status is 'closed' or
// 'locked' — that check has been there since P1.4 and every posting path goes
// through it. This module adds the LIFECYCLE: how a year reaches those states,
// and who may take it back out.
//
// ─── CLOSED CAN BE REOPENED. LOCKED CANNOT. ──────────────────────────────────
// That distinction is the whole point of having two states.
//
//   closed   the year is finished and postings are refused, but a genuine
//            omission can still be corrected by reopening it — with a reason,
//            an author, and an audit record.
//
//   locked   the accounts have been signed off, filed, or audited. There is no
//            reopen. Correcting something now means posting into the CURRENT
//            year, which is what an auditor expects to see.
//
// If a locked year could be reopened, locking would be a suggestion.

const mongoose = require('mongoose');
const { FmsFinancialYear, FmsLedgerEntry, FmsAuditTrail } = require('../../models/core');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Roles that may reopen a closed year. Deliberately short. */
const MAY_REOPEN = ['chairman', 'trustee', 'principal'];

async function audit({ school, doc, action, before, after, req, notes }) {
  await FmsAuditTrail.create({
    school: oid(school),
    entity: 'fms_financialyears',
    entityId: doc?._id,
    action,
    before,
    after,
    actor: req?.user?._id,
    actorEmail: req?.user?.email,
    actorRole: req?.fmsRole,
    ipAddress: req?.ip,
    userAgent: req?.get?.('user-agent'),
    notes,
  });
}

/** What is in the year, and whether anything argues against closing it. */
async function readiness(school, id) {
  const fy = await FmsFinancialYear.findOne({ _id: id, school: oid(school) }).lean();
  if (!fy) throw errors.notFound('Financial year');

  const [agg] = await FmsLedgerEntry.aggregate([
    { $match: { school: oid(school), financialYear: oid(id) } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, n: { $sum: 1 } } },
  ]);

  const debit = agg?.debit || 0;
  const credit = agg?.credit || 0;
  const blockers = [];
  const warnings = [];

  // A year whose books do not balance must not be closed — closing it would
  // freeze the error in place and make it somebody else's problem.
  if (debit !== credit) {
    blockers.push({
      type: 'unbalanced',
      message: `The ledger for ${fy.yearCode} does not balance (${debit} vs ${credit})`,
      difference: debit - credit,
    });
  }

  if (new Date() < fy.endDate) {
    warnings.push({
      type: 'yearNotEnded',
      message: `${fy.yearCode} does not end until ${fy.endDate.toISOString().slice(0, 10)}`,
    });
  }

  // Unverified cash counts and unsettled online collections are worth knowing
  // about before closing, but neither is a reason to refuse.
  try {
    const { FmsDailyClosing } = require('../../models/cashBankBook');
    const disputed = await FmsDailyClosing.countDocuments({
      school: oid(school), closingStatus: 'disputed',
      closingDate: { $gte: fy.startDate, $lte: fy.endDate },
    });
    if (disputed > 0) {
      warnings.push({
        type: 'disputedClosings',
        message: `${disputed} cash count(s) in this year have an unverified variance`,
      });
    }
  } catch (_) { /* module may not be installed */ }

  return {
    financialYear: {
      _id: fy._id, yearCode: fy.yearCode, fyStatus: fy.fyStatus,
      startDate: fy.startDate, endDate: fy.endDate, isCurrent: fy.isCurrent,
    },
    entries: agg?.n || 0,
    totalDebit: debit,
    totalCredit: credit,
    balanced: debit === credit,
    blockers,
    warnings,
    canClose: ['open', 'reopened'].includes(fy.fyStatus) && blockers.length === 0,
    canLock: ['closed'].includes(fy.fyStatus),
    canReopen: fy.fyStatus === 'closed',
  };
}

/** open | reopened → closed. */
async function close(school, id, req, { reason, acknowledgeWarnings } = {}) {
  const fy = await FmsFinancialYear.findOne({ _id: id, school: oid(school) });
  if (!fy) throw errors.notFound('Financial year');

  if (!['open', 'reopened'].includes(fy.fyStatus)) {
    throw errors.conflict(
      `${fy.yearCode} is ${fy.fyStatus} and cannot be closed`,
      { currentStatus: fy.fyStatus }
    );
  }

  const state = await readiness(school, id);

  if (state.blockers.length) {
    throw errors.conflict(
      `${fy.yearCode} cannot be closed`,
      {
        blockers: state.blockers,
        hint: 'Closing an unbalanced year freezes the error in place.',
      }
    );
  }

  if (state.warnings.length && !acknowledgeWarnings) {
    throw errors.conflict(
      `${fy.yearCode} has ${state.warnings.length} warning(s)`,
      {
        warnings: state.warnings,
        hint: 'Resubmit with acknowledgeWarnings: true — the acknowledgement is recorded.',
      }
    );
  }

  const before = fy.toObject();
  fy.fyStatus = 'closed';
  fy.closedBy = req?.user?._id;
  fy.closedAt = new Date();
  fy.closeReason = reason;
  await fy.save();

  await audit({
    school, doc: fy, action: 'lock', before, after: fy.toObject(), req,
    notes: state.warnings.length
      ? `Closed with ${state.warnings.length} acknowledged warning(s)`
      : undefined,
  });

  return { financialYear: fy, acknowledgedWarnings: state.warnings };
}

/**
 * closed → locked. Irreversible.
 *
 * Requires the year code typed back, because there is no undo. An accidental
 * lock cannot be corrected — only worked around by posting into the current
 * year, which is a permanent visible artefact in the accounts.
 */
async function lock(school, id, req, { confirmYearCode } = {}) {
  const fy = await FmsFinancialYear.findOne({ _id: id, school: oid(school) });
  if (!fy) throw errors.notFound('Financial year');

  if (fy.fyStatus !== 'closed') {
    throw errors.conflict(
      `Only a closed year can be locked (${fy.yearCode} is ${fy.fyStatus})`,
      { hint: 'Close it first.' }
    );
  }

  if (confirmYearCode !== fy.yearCode) {
    throw errors.validation('Validation failed', {
      confirmYearCode:
        `type '${fy.yearCode}' to confirm — LOCKING CANNOT BE UNDONE. After this, ` +
        'a correction can only be made by posting into the current year.',
    });
  }

  const before = fy.toObject();
  fy.fyStatus = 'locked';
  fy.lockedBy = req?.user?._id;
  fy.lockedAt = new Date();
  await fy.save();

  await audit({
    school, doc: fy, action: 'lock', before, after: fy.toObject(), req,
    notes: 'Locked permanently — no reopen is possible',
  });

  return fy;
}

/**
 * closed → reopened.
 *
 * Restricted by role, requires a reason, and is audited. A locked year is NOT
 * reopenable — see the note at the top of this file.
 */
async function reopen(school, id, req, { reason } = {}) {
  const fy = await FmsFinancialYear.findOne({ _id: id, school: oid(school) });
  if (!fy) throw errors.notFound('Financial year');

  if (fy.fyStatus === 'locked') {
    throw errors.forbidden(
      `${fy.yearCode} is LOCKED and cannot be reopened`,
      {
        hint:
          'A locked year has been signed off. Correct it by posting into the ' +
          'current year, which leaves a visible record rather than altering ' +
          'accounts somebody has already relied on.',
      }
    );
  }

  if (fy.fyStatus !== 'closed') {
    throw errors.conflict(
      `Only a closed year can be reopened (${fy.yearCode} is ${fy.fyStatus})`
    );
  }

  if (!MAY_REOPEN.includes(req?.fmsRole)) {
    throw errors.forbidden(
      'Your role may not reopen a closed financial year',
      { role: req?.fmsRole || null, permitted: MAY_REOPEN }
    );
  }

  if (!reason || String(reason).trim().length < 10) {
    throw errors.validation('Validation failed', {
      reason:
        'is required and must be meaningful — reopening a closed year changes ' +
        'figures somebody may already have reported',
    });
  }

  const before = fy.toObject();
  fy.fyStatus = 'reopened';
  fy.reopenedBy = req?.user?._id;
  fy.reopenedAt = new Date();
  fy.reopenReason = reason;
  // Kept so "how many times has this year been reopened" is answerable.
  fy.reopenCount = (fy.reopenCount || 0) + 1;
  await fy.save();

  await audit({
    school, doc: fy, action: 'reopen', before, after: fy.toObject(), req,
    notes: `Reopened by ${req?.fmsRole}: ${reason}`,
  });

  return fy;
}

module.exports = { readiness, close, lock, reopen, MAY_REOPEN };