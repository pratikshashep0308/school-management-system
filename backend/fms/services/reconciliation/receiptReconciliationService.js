// backend/fms/services/reconciliation/receiptReconciliationService.js
//
// D1 — detection of fee receipts the SMS has deleted out from under a posting.
//
// ─── THE PROBLEM THIS EXISTS FOR ─────────────────────────────────────────────
// DELETE /api/fees/payment/:receiptNumber (feeController.js:251) pulls a payment
// out of StudentFee.paymentHistory, FeePayment and FeeAssignment.payments. No
// audit record is written and nothing tells the FMS.
//
// By then the FMS has posted an income voucher and claimed the receipt in
// fms_ingeststate. After the delete:
//
//   · the voucher and its ledger entries remain — correctly, the FMS never hard
//     deletes a financial document;
//   · the SMS shows no such payment;
//   · the ingest-state row still says "posted", so no future sync re-examines it;
//   · nothing compares the two. The books and the fee dashboard drift apart with
//     no error raised anywhere.
//
// This service is that comparison. It is READ-ONLY on both sides: it never
// writes to the SMS (it cannot — smsClient is GET-only), and it never touches a
// voucher, a ledger entry or an ingest-state row. It produces a list of
// exceptions for a human. Reversal stays a decision made by an accountant
// through the existing approval workflow.
//
// ─── WHY THE GUARDS BELOW MATTER MORE THAN THE COMPARISON ────────────────────
// The naive version of this — "every claim whose receipt is missing from the
// SMS response is an orphan" — is dangerous. If the SMS is reachable but returns
// a filtered, partial or empty list (a permissions change on the service user, a
// date filter, a controller regression), every posted receipt looks deleted. A
// report claiming 500 deleted receipts would either cause 500 wrong reversals or
// destroy trust in the tool the first time it fires.
//
// So: the full set is always fetched with no date window, an empty response with
// live claims aborts rather than reports, and anything above SUSPECT_RATIO is
// returned flagged as unsafe to act on. A reconciliation that cannot tell
// "deleted" from "not fetched" is worse than no reconciliation.

const mongoose = require('mongoose');

const smsClient = require('../../client/smsClient');
const feeIngest = require('../ingest/feeIngestService');
const { FmsIngestState, FmsVoucher } = require('../../models/core');
const { FmsIncomeVoucher } = require('../../models/income');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Above this proportion of claims missing, the result is almost certainly a
 * fetch problem rather than that many deletions. Reported, but flagged.
 */
const SUSPECT_RATIO = 0.25;

/** Claims in these states asserted a posting happened. Only these can orphan. */
const LIVE_CLAIM_STATES = ['posted'];

/**
 * Pull the CURRENT receipt set from the SMS.
 *
 * Deliberately takes no date window. A windowed fetch would make every receipt
 * outside the window indistinguishable from a deleted one, which is exactly the
 * failure this service must not have.
 *
 * @returns {Promise<{ receipts: Set<string>, fetched: number, anomalies: Array }>}
 */
async function fetchLiveReceipts() {
  let studentFees = [];
  let assignments = [];

  try {
    const [sf, fa] = await Promise.all([
      // getAll is load-bearing here beyond mere completeness: with only the
      // first 50 receipts visible, every posted receipt beyond page one would
      // be reported as deleted. The suspect-ratio guard would flag it, but a
      // reconciliation that cries wolf on its first run is one nobody trusts
      // afterwards.
      smsClient.getAll('/fees/students').then((r) => r.rows),
      smsClient.get('/fees/assignments'),
    ]);
    studentFees = Array.isArray(sf) ? sf : (sf?.data || []);
    assignments = Array.isArray(fa) ? fa : (fa?.data || []);
  } catch (err) {
    // Abort. Reporting orphans off a failed fetch is the one outcome worse
    // than not running at all.
    throw errors.conflict(
      `The school system could not be reached: ${err.message}`,
      { hint: 'No comparison was made. Nothing was reported and nothing was changed.' }
    );
  }

  // Same union the ingest itself keys on, so the two sides are compared on
  // identical terms. Reimplementing it here would let the two drift.
  const { payments, anomalies } = feeIngest.unionPayments({ studentFees, assignments });

  const receipts = new Set();
  for (const p of payments) {
    const r = (p.receiptNumber || '').trim();
    if (r) receipts.add(r);
  }

  return { receipts, fetched: payments.length, anomalies };
}

/**
 * Attach what an accountant needs to judge an orphan without opening four
 * screens: what was posted, for whom, how much, and whether it is still live.
 */
async function describeClaims(school, claims) {
  const voucherIds = claims.map((c) => c.voucher).filter(Boolean);
  const receiptNumbers = claims.map((c) => String(c.sourceId).trim());

  const [vouchers, incomes] = await Promise.all([
    FmsVoucher.find({ _id: { $in: voucherIds }, school: oid(school) })
      .select('_id voucherNumber voucherDate voucherStatus totalAmount narration')
      .lean(),
    // Keyed on receiptNumber rather than the voucher link: it is the natural
    // key on both sides, and it still resolves if the link is missing.
    FmsIncomeVoucher.find({ receiptNumber: { $in: receiptNumbers }, school: oid(school) })
      .select('receiptNumber receiptDate payerName className amount paymentMode incomeStatus voucher')
      .lean(),
  ]);

  const voucherById = new Map(vouchers.map((v) => [String(v._id), v]));
  const incomeByReceipt = new Map(incomes.map((i) => [String(i.receiptNumber).trim(), i]));

  return claims.map((c) => {
    const receipt = String(c.sourceId).trim();
    const v = c.voucher ? voucherById.get(String(c.voucher)) : null;
    const inc = incomeByReceipt.get(receipt) || null;

    // NOTE — fms_ingeststate.sourceSnapshot and .sourceAmount are empty for fee
    // claims: feeIngestService does not pass either to the posting service, so
    // the columns exist but were never filled. The income voucher is therefore
    // the ONLY surviving record of a payment the SMS has deleted, which is why
    // the description below is built from it rather than from the snapshot.
    // Populating the snapshot on future ingests is a worthwhile, additive
    // change — but it is a change to posting behaviour, so it is proposed
    // rather than made here.
    const snap = c.sourceSnapshot || {};

    return {
      receiptNumber: receipt,
      claimedAt: c.postedAt || c.createdAt,
      evidence: {
        payerName: inc?.payerName || snap.studentName || null,
        className: inc?.className || snap.className || null,
        amountPaise: inc?.amount != null ? inc.amount : null,
        receiptDate: inc?.receiptDate || snap.paidOn || null,
        paymentMode: inc?.paymentMode || snap.method || null,
        // True when the income voucher is gone too — then there is nothing left
        // anywhere describing what was received, and the claim alone is the
        // trace. Rare, and worth seeing.
        evidenceMissing: !inc,
      },
      posting: v ? {
        voucherId: v._id,
        voucherNumber: v.voucherNumber,
        voucherDate: v.voucherDate,
        voucherStatus: v.voucherStatus,
        amountPaise: v.totalAmount,
        narration: v.narration,
        // Already dealt with by someone — surfaced, but not an open item.
        alreadyReversed: v.voucherStatus === 'reversed' || v.voucherStatus === 'cancelled',
      } : null,
      incomeStatus: inc?.incomeStatus || null,
      recommendedAction: v && v.voucherStatus === 'posted'
        ? 'Ask whoever deleted the receipt why. If the payment did not happen, reverse '
          + 'the voucher through the approval workflow. Do not delete it.'
        : 'No live posting — nothing to reverse.',
    };
  });
}

/**
 * Compare SMS receipts against FMS ingest claims.
 *
 * Writes nothing, anywhere.
 *
 * @param {string|ObjectId} school
 * @param {object} [opts]
 * @param {number} [opts.limit] cap on exceptions returned (the counts are always complete)
 * @returns {Promise<object>} the reconciliation report
 */
async function reconcileFees(school, opts = {}) {
  const startedAt = new Date();
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(500, opts.limit)) : 100;

  const { receipts: live, fetched, anomalies } = await fetchLiveReceipts();

  const claims = await FmsIngestState.find({
    school: oid(school),
    source: 'fee',
    ingestStatus: { $in: LIVE_CLAIM_STATES },
  })
    .select('sourceId ingestStatus voucher sourceAmount sourceSnapshot postedAt createdAt')
    .lean();

  // ── Guard 1: nothing came back but claims exist ────────────────────────────
  // 100% of receipts deleted is not a thing that happens. A filtered response,
  // a permissions change on the service user, or a controller regression is.
  if (claims.length > 0 && fetched === 0) {
    throw errors.conflict(
      'The school system returned no fee payments at all, while the books hold '
      + `${claims.length} posted receipt(s).`,
      {
        hint: 'Refusing to report these as deleted. Check that the FMS service user can '
          + 'still read /api/fees/students and /api/fees/assignments, then run this again.',
      }
    );
  }

  const orphanClaims = claims.filter((c) => !live.has(String(c.sourceId).trim()));
  const ratio = claims.length ? orphanClaims.length / claims.length : 0;

  const described = await describeClaims(school, orphanClaims.slice(0, limit));

  // A claim whose voucher is already reversed is history, not an open item.
  const outstanding = described.filter((d) => d.posting && !d.posting.alreadyReversed);
  const settled = described.filter((d) => d.posting && d.posting.alreadyReversed);
  // A claim with no voucher at all: the row asserts a posting that cannot be
  // found. Not a deleted-receipt problem — a broken claim, and a different
  // conversation. Counted rather than silently dropped from both buckets.
  const danglingClaims = described.filter((d) => !d.posting);

  const outstandingPaise = outstanding.reduce(
    (sum, d) => sum + (d.posting?.amountPaise || 0), 0
  );

  // The inverse direction: receipts the SMS has that the books do not. Not a
  // divergence — just work the next sync will do. Reported so that the two
  // numbers on the screen add up and nobody has to wonder about the difference.
  let unclaimed = 0;
  if (live.size) {
    const claimed = new Set(claims.map((c) => String(c.sourceId).trim()));
    for (const r of live) if (!claimed.has(r)) unclaimed += 1;
  }

  return {
    ranAt: startedAt,
    durationMs: Date.now() - startedAt.getTime(),
    readOnly: true,

    smsReceipts: fetched,
    postedClaims: claims.length,

    orphanCount: orphanClaims.length,
    outstandingCount: outstanding.length,
    alreadyReversedCount: settled.length,
    danglingClaimCount: danglingClaims.length,
    outstandingPaise,

    pendingIngest: unclaimed,

    // ── Guard 2 ──────────────────────────────────────────────────────────────
    // Above the threshold the number is reported but must not be acted on. The
    // caller renders this as a warning instead of a work list.
    suspect: ratio > SUSPECT_RATIO && orphanClaims.length > 1,
    suspectReason: ratio > SUSPECT_RATIO && orphanClaims.length > 1
      ? `${Math.round(ratio * 100)}% of posted receipts are missing from the school system. `
        + 'That is far more likely to be an incomplete fetch than that many deletions. '
        + 'Verify the school system is returning its full fee history before reversing anything.'
      : null,

    truncated: orphanClaims.length > described.length,
    exceptions: described,

    // Carried through from the union so a blank receipt number — which cannot be
    // keyed on and so can never be reconciled either — stays visible.
    sourceAnomalies: anomalies.length,
  };
}

/** Cheap header figures for the console, without the full comparison. */
async function summary(school) {
  const [posted, failed] = await Promise.all([
    FmsIngestState.countDocuments({ school: oid(school), source: 'fee', ingestStatus: 'posted' }),
    FmsIngestState.countDocuments({ school: oid(school), source: 'fee', ingestStatus: 'failed' }),
  ]);
  return { postedClaims: posted, failedClaims: failed };
}

module.exports = { reconcileFees, summary, fetchLiveReceipts, SUSPECT_RATIO };
