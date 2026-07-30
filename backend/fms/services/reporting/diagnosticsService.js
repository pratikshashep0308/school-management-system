// backend/fms/services/reporting/diagnosticsService.js
//
// Every integration check in one place, run on demand.
//
// ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// The Phase-3 gap analysis ended with five queries somebody had to paste into
// mongosh on the server, plus a sixth that had no way to run at all. Checks that
// live in a document get run once, at most, by whoever wrote them. Checks that
// live behind a button get run when somebody is worried, which is exactly when
// they are worth running.
//
// So this is that document, executed.
//
// ─── EVERY CHECK IS READ-ONLY ────────────────────────────────────────────────
// Nothing here writes to the FMS or the SMS. smsClient is GET-only by
// construction. A diagnostic that changes the thing it measures is not a
// diagnostic.
//
// ─── AND EVERY CHECK FAILS SOFT ──────────────────────────────────────────────
// One unreachable endpoint must not take the whole screen down. Each check is
// isolated: it returns its finding, or it returns why it could not. A dashboard
// that shows five results and one honest error is far more useful than one that
// shows a stack trace, and much safer than one that shows five results and
// silently omits the sixth.

const mongoose = require('mongoose');

const smsClient = require('../../client/smsClient');
const feeIngest = require('../ingest/feeIngestService');
const payrollMappingReport = require('../ingest/payrollMappingReport');
const receiptReconciliation = require('../reconciliation/receiptReconciliationService');
const chartCoverage = require('./chartCoverageReport');
const { FmsIngestState } = require('../../models/core');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

const SEVERITY = { none: 'none', info: 'info', warn: 'warn', critical: 'critical' };

/** Run a check without letting its failure reach the others. */
async function guard(id, title, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    return { id, title, ok: true, durationMs: Date.now() - startedAt, ...result };
  } catch (err) {
    return {
      id, title, ok: false, durationMs: Date.now() - startedAt,
      severity: SEVERITY.warn,
      headline: 'Could not be checked',
      detail: err.message,
      // Explicitly NOT severity.none. "We could not look" and "we looked and
      // found nothing" must never render the same.
      recommendation: 'Resolve the error and run again. Until then this check tells you nothing.',
    };
  }
}

const rupees = (paise) => Math.round(paise) / 100;

// ─── 7.1 — transport fees collected outside the fee module ───────────────────
async function transportUsage() {
  const raw = await smsClient.get('/transport/fees');
  const fees = Array.isArray(raw) ? raw : (raw?.data || []);
  const paid = fees.filter((f) => Number(f.paidAmount) > 0);
  const total = paid.reduce((s, f) => s + Number(f.paidAmount || 0), 0);

  return {
    severity: paid.length ? SEVERITY.warn : SEVERITY.none,
    count: paid.length,
    totalRupees: total,
    headline: paid.length
      ? `${paid.length} transport fee payment(s) totalling ₹${total.toLocaleString('en-IN')} `
        + 'were collected through the transport module'
      : 'No transport fees were ever collected through the transport module',
    detail: paid.length
      ? 'That money never reached the ledger. Transport fees are now billed through the fee '
        + 'module and the old collection endpoints are closed, so this figure is historic and '
        + 'will not grow.'
      : 'Transport fees are billed through the fee module and map to 4103 automatically.',
    recommendation: paid.length
      ? 'Decide with the accountant whether to bring this in as a single opening journal '
        + 'voucher dated to the start of the financial year, or to leave it out and let the '
        + 'books start from the fee-module era.'
      : null,
    affected: paid.slice(0, 50).map((f) => ({
      id: f._id, student: f.student?.name || f.student, month: f.month, year: f.year,
      paidRupees: Number(f.paidAmount), receiptNo: f.receiptNo,
    })),
  };
}

// ─── 7.2 — receipts in FeePayment and nowhere else ───────────────────────────
async function feePaymentOnly() {
  const [ledgerRaw, sf, fa] = await Promise.all([
    smsClient.get('/fees/payments-ledger'),
    smsClient.get('/fees/students'),
    smsClient.get('/fees/assignments'),
  ]);

  const ledger = Array.isArray(ledgerRaw) ? ledgerRaw : (ledgerRaw?.data || []);
  const studentFees = Array.isArray(sf) ? sf : (sf?.data || []);
  const assignments = Array.isArray(fa) ? fa : (fa?.data || []);

  // The same union the ingest keys on, so "known" here means exactly what it
  // means to the import.
  const { payments } = feeIngest.unionPayments({ studentFees, assignments });
  const known = new Set(payments.map((p) => String(p.receiptNumber).trim()));

  const only = ledger.filter((p) => {
    const r = String(p.receiptNumber || '').trim();
    return r && !known.has(r);
  });
  const total = only.reduce((s, p) => s + Number(p.amount || 0), 0);

  return {
    severity: only.length ? SEVERITY.critical : SEVERITY.none,
    count: only.length,
    totalRupees: total,
    headline: only.length
      ? `${only.length} receipt(s) exist only in the third fee store, worth `
        + `₹${total.toLocaleString('en-IN')}`
      : 'Every receipt in the third fee store also appears in the two the import reads',
    detail: only.length
      ? 'The finance import reads StudentFee and FeeAssignment. These receipts are in neither, '
        + 'so this money has never been posted and no fee report counts it.'
      : 'B2 closes with no work: the union the import reads covers everything.',
    recommendation: only.length
      ? 'Establish how these were created before importing anything — a receipt that reached '
        + 'only one of three stores usually means a write failed partway, and the amount may '
        + 'not be trustworthy.'
      : null,
    affected: only.slice(0, 50).map((p) => ({
      receiptNumber: p.receiptNumber, amountRupees: Number(p.amount), paidOn: p.paidOn,
      method: p.method,
    })),
  };
}

// ─── 7.3 — registration fees collected ───────────────────────────────────────
async function admissionFees(school) {
  const admissionIngest = require('../ingest/admissionIngestService');
  const { admissions } = await admissionIngest.fetchAdmissions();
  const { payments, anomalies } = admissionIngest.extractPaidFees(admissions);

  const claimed = await FmsIngestState.countDocuments({
    school: oid(school), source: 'admission', ingestStatus: 'posted',
  });
  const pending = payments.length - claimed;
  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  return {
    severity: pending > 0 ? SEVERITY.warn : SEVERITY.none,
    count: payments.length,
    totalRupees: total,
    headline: payments.length
      ? `${payments.length} registration fee(s) collected, ₹${total.toLocaleString('en-IN')} — `
        + `${claimed} posted, ${Math.max(0, pending)} awaiting import`
      : 'No registration fees have been collected',
    detail: anomalies.length
      ? `${anomalies.length} admission(s) are marked paid but cannot be imported — missing `
        + 'an amount or a payment date.'
      : null,
    recommendation: pending > 0
      ? 'Run the registration fee import from the integration console.'
      : null,
    affected: anomalies.slice(0, 50),
  };
}

// ─── 7.4 — library fines ─────────────────────────────────────────────────────
async function libraryFines() {
  const raw = await smsClient.get('/library/issues');
  const issues = Array.isArray(raw) ? raw : (raw?.data || []);
  const fined = issues.filter((i) => Number(i.lateFee) > 0);
  const total = fined.reduce((s, i) => s + Number(i.lateFee || 0), 0);

  return {
    // Never critical: nothing is missing from the books, because nothing was
    // ever recorded as received. The problem is upstream of accounting.
    severity: fined.length ? SEVERITY.info : SEVERITY.none,
    count: fined.length,
    totalRupees: total,
    headline: fined.length
      ? `₹${total.toLocaleString('en-IN')} in library fines has been charged across `
        + `${fined.length} returned book(s)`
      : 'No library fines have been charged',
    detail: fined.length
      ? 'These are charges, not receipts. The library module computes a fine on return and '
        + 'stores it, but has no way to record payment — so whether any of it was collected '
        + 'is unknown to every system here.'
      : null,
    recommendation: fined.length
      ? 'Either add a collection step in the library module, or deactivate 4105 and 4108 so '
        + 'the accounts stop implying revenue nobody tracks. Note that the library statistics '
        + 'screen reports this figure as `lateFeeCollected`, which it is not.'
      : null,
    affected: [],
  };
}

// ─── 7.5 — unnamed salary deductions ─────────────────────────────────────────
async function payrollDeductions(school) {
  const r = await payrollMappingReport.build(school);

  return {
    severity: r.affectedSlipCount ? SEVERITY.info : SEVERITY.none,
    count: r.affectedSlipCount,
    totalRupees: rupees(r.otherTotalPaise),
    headline: r.affectedSlipCount
      ? `${r.affectedSlipCount} salary slip(s) carry ₹${rupees(r.otherTotalPaise).toLocaleString('en-IN')} `
        + 'in deductions with no named head'
      : 'Every salary deduction is recorded under a named head',
    detail: r.affectedSlipCount
      ? 'Salary slips now have separate ESIC and professional tax fields, so these are '
        + 'historic — entered when the form had a single deduction box. They remain posted '
        + 'to 2109 Other Deductions Payable.'
      : null,
    recommendation: r.unbalancedSlipCount
      ? `${r.unbalancedSlipCount} slip(s) do not add up and cannot be imported at all until `
        + 'the payroll figures are corrected.'
      : (r.affectedSlipCount
        ? 'Decide with the accountant whether to reclassify the historic balance by journal '
          + 'voucher, or leave it.'
        : null),
    affected: r.perEmployee.slice(0, 50),
  };
}

// ─── Orphaned ingest claims (D1) ─────────────────────────────────────────────
async function orphanClaims(school) {
  const r = await receiptReconciliation.reconcileFees(school, { limit: 50 });

  return {
    severity: r.suspect
      ? SEVERITY.warn
      : (r.outstandingCount ? SEVERITY.critical : SEVERITY.none),
    count: r.orphanCount,
    totalRupees: rupees(r.outstandingPaise),
    headline: r.suspect
      ? 'The comparison could not be trusted this time'
      : (r.orphanCount
        ? `${r.outstandingCount} posted receipt(s) no longer exist in the school system, `
          + `worth ₹${rupees(r.outstandingPaise).toLocaleString('en-IN')}`
        : 'Every posted receipt is still present in the school system'),
    detail: r.suspect
      ? r.suspectReason
      : (r.orphanCount
        ? 'A fee payment was deleted after the books had already recorded it. The posting '
          + 'stays — the books never delete — so the two sides now disagree.'
        : null),
    recommendation: (!r.suspect && r.outstandingCount)
      ? 'Find out why each receipt was deleted. If the payment did not happen, reverse the '
        + 'voucher through the approval workflow. Do not delete it.'
      : null,
    affected: r.exceptions.slice(0, 50),
  };
}

// ─── Accounts nothing can post to ────────────────────────────────────────────
async function strandedAccounts(school) {
  const r = await chartCoverage.build(school);

  return {
    severity: r.blocked.length ? SEVERITY.warn : SEVERITY.none,
    count: r.blocked.length,
    headline: r.blocked.length
      ? `${r.blocked.length} account(s) can never receive a posting`
      : 'Every account in the chart can be reached by something',
    detail: r.blocked.length
      ? 'These read zero on every report, which looks like a measurement rather than an '
        + 'absence — the more dangerous of the two.'
      : null,
    recommendation: r.blocked.length
      ? 'Deactivate them, or connect a source. Leaving them is the one option that misleads.'
      : null,
    affected: r.blocked.map((a) => ({
      accountCode: a.accountCode, accountName: a.accountName, reason: a.reason,
    })),
  };
}

/**
 * Run everything.
 *
 * @param {string|ObjectId} school
 */
async function runAll(school) {
  const startedAt = new Date();

  const checks = await Promise.all([
    guard('orphanClaims', 'Deleted receipts still posted', () => orphanClaims(school)),
    guard('feePaymentOnly', 'Receipts no report counts', () => feePaymentOnly()),
    guard('transportUsage', 'Transport fees outside the fee module', () => transportUsage()),
    guard('admissionFees', 'Registration fees', () => admissionFees(school)),
    guard('payrollDeductions', 'Unnamed salary deductions', () => payrollDeductions(school)),
    guard('libraryFines', 'Library fines', () => libraryFines()),
    guard('strandedAccounts', 'Accounts nothing can reach', () => strandedAccounts(school)),
  ]);

  const rank = { critical: 3, warn: 2, info: 1, none: 0 };
  const worst = checks.reduce(
    (w, c) => (rank[c.severity] > rank[w] ? c.severity : w), SEVERITY.none
  );

  const counts = checks.reduce((acc, c) => {
    acc[c.severity] = (acc[c.severity] || 0) + 1;
    return acc;
  }, {});

  return {
    ranAt: startedAt,
    durationMs: Date.now() - startedAt.getTime(),
    readOnly: true,

    overall: worst,
    counts,
    checksRun: checks.length,
    checksFailed: checks.filter((c) => !c.ok).length,

    // Worst first — the screen should open on whatever most needs attention,
    // not on whichever check happens to be listed first.
    checks: checks.sort((a, b) => rank[b.severity] - rank[a.severity]),
  };
}

module.exports = { runAll, SEVERITY };
