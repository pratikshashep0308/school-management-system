// backend/fms/services/journal/journalService.js
//
// Journal Voucher workflow. SRS M12 / FR-M12, screens SCR-47/48/49.
//
//   draft ──submit──▶ submitted ──approve──▶ posted ──reverse──▶ reversed
//     ▲                   │
//     └──────reject───────┘
//     │
//     └──cancel──▶ cancelled          (terminal; never deleted)
//
// ─── WHAT THIS SERVICE DOES NOT DO ───────────────────────────────────────────
// It never writes a ledger entry. Approval calls LedgerPostingService.post(),
// which owns the transaction, the balance assertion, the voucher number and the
// account checks. So a manual JV is subject to exactly the same invariants as an
// automated fee posting — there is no second path into the ledger with weaker
// rules.

const {
  FmsFinancialYear, FmsAccount, FmsAuditTrail,
} = require('../../models/core');
const { FmsJournalVoucher } = require('../../models/journal');
const posting = require('../ledger/LedgerPostingService');
const { errors } = require('../../utils/apiResponse');

const EDITABLE = ['draft', 'rejected'];
const LOCKED_FY = ['closed', 'locked'];

// ─────────────────────────────────────────────────────────────────────────────

async function audit({ school, jv, action, before, after, req }) {
  await FmsAuditTrail.create({
    school,
    entity: 'fms_journalvouchers',
    entityId: jv?._id,
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

/**
 * Validate lines and enrich them with account snapshots.
 *
 * Balance is checked HERE as well as inside LedgerPostingService. That is
 * deliberate duplication: the prompt requires that an unbalanced JV cannot even
 * be saved, so it must fail long before anything tries to post it.
 */
async function prepareLines(school, lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw errors.validation('Validation failed', {
      lines: 'a journal voucher needs at least two lines',
    });
  }

  const fields = {};
  lines.forEach((l, i) => {
    const dr = l.debit || 0;
    const cr = l.credit || 0;
    if (!l.account) fields[`lines[${i}].account`] = 'is required';
    else if (!/^[0-9a-fA-F]{24}$/.test(String(l.account))) {
      fields[`lines[${i}].account`] = 'must be a 24-character ObjectId';
    }
    if (!Number.isInteger(dr) || !Number.isInteger(cr)) {
      fields[`lines[${i}]`] = 'debit and credit must be integer paise, not float rupees';
    } else if (dr < 0 || cr < 0) {
      fields[`lines[${i}]`] = 'amounts must be non-negative';
    } else if ((dr > 0 && cr > 0) || (dr === 0 && cr === 0)) {
      fields[`lines[${i}]`] = 'exactly one of debit/credit must be non-zero';
    }
  });
  if (Object.keys(fields).length) throw errors.validation('Validation failed', fields);

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

  if (totalDebit !== totalCredit) {
    throw errors.validation(
      `Journal voucher does not balance: Dr ${totalDebit} ≠ Cr ${totalCredit} (paise)`,
      { totalDebit, totalCredit, difference: totalDebit - totalCredit }
    );
  }
  if (totalDebit === 0) {
    throw errors.validation('Journal voucher total cannot be zero', { totalDebit: 0 });
  }

  // Resolve accounts once, so a bad reference fails at save rather than at post.
  const ids = [...new Set(lines.map((l) => String(l.account)))];
  const accounts = await FmsAccount.find({ _id: { $in: ids }, school }).lean();
  const byId = Object.fromEntries(accounts.map((a) => [String(a._id), a]));

  const problems = {};
  for (const id of ids) {
    const a = byId[id];
    if (!a) problems[id] = 'account not found in this school';
    else if (!a.isPostable) problems[id] = `${a.accountCode} is a grouping head, not postable`;
    else if (a.status !== 'active') problems[id] = `${a.accountCode} is ${a.status}`;
  }
  if (Object.keys(problems).length) {
    throw errors.validation('One or more accounts cannot be posted to', problems);
  }

  return lines.map((l) => {
    const a = byId[String(l.account)];
    return {
      account: a._id,
      accountCode: a.accountCode,
      accountName: a.accountName,
      debit: l.debit || 0,
      credit: l.credit || 0,
      narration: l.narration || '',
      partyType: l.partyType || null,
      party: l.party || null,
      partyName: l.partyName,
      department: l.department || null,
      costCenter: l.costCenter,
    };
  });
}

async function assertFyOpen(school, financialYearId) {
  const fy = await FmsFinancialYear.findOne({ _id: financialYearId, school }).lean();
  if (!fy) throw errors.validation('Validation failed', { financialYear: 'not found' });
  if (LOCKED_FY.includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year ${fy.yearCode} is ${fy.fyStatus}`);
  }
  return fy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create / update
// ─────────────────────────────────────────────────────────────────────────────

async function create(school, payload, req) {
  const fy = await assertFyOpen(school, payload.financialYear);
  const jvDate = new Date(payload.jvDate);

  if (Number.isNaN(jvDate.getTime())) {
    throw errors.validation('Validation failed', { jvDate: 'must be a valid date' });
  }
  if (jvDate < fy.startDate || jvDate > fy.endDate) {
    throw errors.validation('Validation failed', {
      jvDate: `must fall within ${fy.yearCode} (${fy.startDate.toISOString().slice(0, 10)} to ${fy.endDate.toISOString().slice(0, 10)})`,
    });
  }

  const lines = await prepareLines(school, payload.lines);

  const jv = await FmsJournalVoucher.create({
    school,
    financialYear: fy._id,
    jvDate,
    narration: payload.narration,
    reference: payload.reference,
    lines,
    jvStatus: 'draft',
    attachments: payload.attachments || [],
    workflow: [step(req, 'create', null, 'draft')],
    createdBy: req?.user?._id,
  });

  await audit({ school, jv, action: 'create', after: jv.toObject(), req });
  return jv;
}

async function update(school, id, payload, req) {
  const jv = await FmsJournalVoucher.findOne({ _id: id, school });
  if (!jv) throw errors.notFound('Journal voucher');

  if (!EDITABLE.includes(jv.jvStatus)) {
    throw errors.conflict(
      `A ${jv.jvStatus} journal voucher cannot be edited`,
      {
        jvStatus: jv.jvStatus,
        hint: jv.jvStatus === 'posted'
          ? 'Reverse it and create a new one — posted entries are permanent.'
          : 'Only draft and rejected vouchers are editable.',
      }
    );
  }

  const before = jv.toObject();
  await assertFyOpen(school, jv.financialYear);

  if (payload.lines) jv.lines = await prepareLines(school, payload.lines);
  if (payload.narration !== undefined) jv.narration = payload.narration;
  if (payload.reference !== undefined) jv.reference = payload.reference;
  if (payload.attachments !== undefined) jv.attachments = payload.attachments;

  if (payload.jvDate !== undefined) {
    const d = new Date(payload.jvDate);
    if (Number.isNaN(d.getTime())) {
      throw errors.validation('Validation failed', { jvDate: 'must be a valid date' });
    }
    jv.jvDate = d;
  }

  // Editing a rejected voucher returns it to draft — it needs re-approval, and
  // leaving it 'rejected' would let it be submitted without the change being seen.
  if (jv.jvStatus === 'rejected') {
    jv.workflow.push(step(req, 'update', 'rejected', 'draft', 'Corrected after rejection'));
    jv.jvStatus = 'draft';
  } else {
    jv.workflow.push(step(req, 'update', 'draft', 'draft'));
  }

  jv.updatedBy = req?.user?._id;
  await jv.save();

  await audit({ school, jv, action: 'update', before, after: jv.toObject(), req });
  return jv;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow
// ─────────────────────────────────────────────────────────────────────────────

async function submit(school, id, req, comment) {
  const jv = await FmsJournalVoucher.findOne({ _id: id, school });
  if (!jv) throw errors.notFound('Journal voucher');

  if (!EDITABLE.includes(jv.jvStatus)) {
    throw errors.conflict(`Cannot submit a ${jv.jvStatus} journal voucher`);
  }
  if (!jv.isBalanced()) {
    throw errors.validation('Journal voucher does not balance', {
      totalDebit: jv.totalDebit, totalCredit: jv.totalCredit,
    });
  }
  await assertFyOpen(school, jv.financialYear);

  const before = jv.toObject();
  jv.workflow.push(step(req, 'submit', jv.jvStatus, 'submitted', comment));
  jv.jvStatus = 'submitted';
  jv.submittedBy = req?.user?._id;
  jv.submittedAt = new Date();
  await jv.save();

  await audit({ school, jv, action: 'update', before, after: jv.toObject(), req });
  return jv;
}

/**
 * Approve and post.
 *
 * Separation of duties is enforced here: the approver must not be the creator
 * or the submitter. A control where one person can raise and approve their own
 * journal entry is not a control.
 */
async function approve(school, id, req, comment) {
  const jv = await FmsJournalVoucher.findOne({ _id: id, school });
  if (!jv) throw errors.notFound('Journal voucher');

  if (jv.jvStatus !== 'submitted') {
    throw errors.conflict(
      `Only a submitted journal voucher can be approved (this one is ${jv.jvStatus})`,
      { jvStatus: jv.jvStatus }
    );
  }

  const actor = String(req?.user?._id);
  if (String(jv.createdBy) === actor || String(jv.submittedBy) === actor) {
    throw errors.forbidden(
      'Separation of duties: you cannot approve a journal voucher you raised or submitted.',
      { hint: 'A different authorised user must approve this.' }
    );
  }

  await assertFyOpen(school, jv.financialYear);

  if (!jv.isBalanced()) {
    throw errors.validation('Journal voucher does not balance', {
      totalDebit: jv.totalDebit, totalCredit: jv.totalCredit,
    });
  }

  const before = jv.toObject();

  // Hand the lines straight to the posting service. It re-validates balance,
  // re-checks the accounts, allocates the voucher number and writes everything
  // in one transaction.
  const result = await posting.post({
    school,
    financialYear: jv.financialYear,
    voucherType: 'journal',
    voucherDate: jv.jvDate,
    narration: jv.narration,
    referenceNumber: jv.reference,
    source: 'manual',
    postedBy: req?.user?._id,
    lines: jv.lines.map((l) => ({
      account: l.account,
      debit: l.debit,
      credit: l.credit,
      narration: l.narration,
      partyType: l.partyType,
      party: l.party,
      partyName: l.partyName,
      department: l.department,
      costCenter: l.costCenter,
    })),
  });

  jv.workflow.push(step(req, 'approve', 'submitted', 'posted', comment));
  jv.jvStatus = 'posted';
  jv.voucher = result.voucher._id;
  jv.voucherNumber = result.voucher.voucherNumber;
  jv.postedBy = req?.user?._id;
  jv.postedAt = new Date();
  await jv.save();

  await audit({ school, jv, action: 'post', before, after: jv.toObject(), req });
  return { jv, voucher: result.voucher, entries: result.entries };
}

async function reject(school, id, req, reason) {
  const jv = await FmsJournalVoucher.findOne({ _id: id, school });
  if (!jv) throw errors.notFound('Journal voucher');

  if (jv.jvStatus !== 'submitted') {
    throw errors.conflict(`Only a submitted journal voucher can be rejected (this one is ${jv.jvStatus})`);
  }
  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', {
      reason: 'is required — a rejection without a reason cannot be acted on',
    });
  }

  const actor = String(req?.user?._id);
  if (String(jv.submittedBy) === actor) {
    throw errors.forbidden('Separation of duties: you cannot reject a voucher you submitted.');
  }

  const before = jv.toObject();
  jv.workflow.push(step(req, 'reject', 'submitted', 'rejected', reason));
  jv.jvStatus = 'rejected';
  jv.rejectedBy = req?.user?._id;
  jv.rejectedAt = new Date();
  jv.rejectionReason = reason;
  await jv.save();

  await audit({ school, jv, action: 'reject', before, after: jv.toObject(), req });
  return jv;
}

/** Abandon a pre-posting voucher. Never a delete — the attempt stays on record. */
async function cancel(school, id, req, reason) {
  const jv = await FmsJournalVoucher.findOne({ _id: id, school });
  if (!jv) throw errors.notFound('Journal voucher');

  if (jv.jvStatus === 'posted') {
    throw errors.conflict(
      'A posted journal voucher cannot be cancelled',
      { hint: 'Reverse it instead — the original posting stays in the ledger.' }
    );
  }
  if (['cancelled', 'reversed'].includes(jv.jvStatus)) {
    throw errors.conflict(`Journal voucher is already ${jv.jvStatus}`);
  }

  const before = jv.toObject();
  jv.workflow.push(step(req, 'cancel', jv.jvStatus, 'cancelled', reason));
  jv.jvStatus = 'cancelled';
  jv.updatedBy = req?.user?._id;
  await jv.save();

  await audit({ school, jv, action: 'cancel', before, after: jv.toObject(), req });
  return jv;
}

/**
 * Reverse a posted JV: an equal-and-opposite posting. The original ledger
 * entries are never touched.
 */
async function reverse(school, id, req, reason) {
  const jv = await FmsJournalVoucher.findOne({ _id: id, school });
  if (!jv) throw errors.notFound('Journal voucher');

  if (jv.jvStatus !== 'posted') {
    throw errors.conflict(
      `Only a posted journal voucher can be reversed (this one is ${jv.jvStatus})`,
      { jvStatus: jv.jvStatus }
    );
  }
  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', { reason: 'is required for a reversal' });
  }

  const before = jv.toObject();
  const result = await posting.reverse(jv.voucher, req?.user?._id, reason);

  jv.workflow.push(step(req, 'reverse', 'posted', 'reversed', reason));
  jv.jvStatus = 'reversed';
  jv.reversalVoucher = result.reversal._id;
  jv.reversedBy = req?.user?._id;
  jv.reversedAt = new Date();
  jv.reversalReason = reason;
  await jv.save();

  await audit({ school, jv, action: 'reverse', before, after: jv.toObject(), req });
  return { jv, reversal: result.reversal, entries: result.entries };
}

module.exports = {
  create, update, submit, approve, reject, cancel, reverse,
  prepareLines, EDITABLE,
};