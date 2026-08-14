// backend/fms/services/reporting/syncLogService.js
//
// An operations record of every sync run.
//
// ─── WHY THIS WRAPS THE CYCLE RATHER THAN LIVING INSIDE IT ───────────────────
// The obvious implementation threads a logger through feeIngestService,
// payrollIngestService, expenseIngestService and admissionIngestService. That
// means four edits to code that currently posts to the books correctly and has
// 1,577 assertions standing behind it, in service of a feature that writes no
// financial data.
//
// So instead the log wraps the call. `run()` starts a recording on the SMS
// client, invokes the cycle untouched, and writes what happened. The ingest
// services do not know this exists, and a bug in here cannot produce a wrong
// posting — the worst it can do is fail to describe a right one.
//
// ─── AND WHY A FAILED LOG NEVER FAILS A SYNC ─────────────────────────────────
// If writing the log throws, the sync still succeeded and the caller still gets
// its result. Losing the record of a correct posting is a nuisance. Rolling
// back a correct posting because its diary entry failed would be absurd.

const mongoose = require('mongoose');

const smsClient = require('../../client/smsClient');
const { FmsSyncLog } = require('../../models/core');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * How many per-record outcomes to keep on one log.
 *
 * A 250-admission cycle produces 250 outcomes, nearly all of them
 * 'alreadyPosted'. Keeping every one on every run is how a log collection
 * outgrows the ledger it describes.
 */
const MAX_RECORDS = 100;

/** Statuses worth keeping when the cap bites, in order of interest. */
const KEEP_ORDER = ['failed', 'skipped', 'posted', 'alreadyPosted'];

/**
 * Choose which outcomes survive truncation.
 *
 * Failures first, always. Nobody opens a sync log to admire the successes, and
 * a truncated list that dropped the one failure would be worse than no list.
 */
function selectRecords(results = []) {
  if (results.length <= MAX_RECORDS) return { kept: results, truncated: false };

  const kept = [];
  for (const status of KEEP_ORDER) {
    for (const r of results) {
      if (kept.length >= MAX_RECORDS) break;
      if (r.status === status) kept.push(r);
    }
    if (kept.length >= MAX_RECORDS) break;
  }
  return { kept, truncated: true };
}

/** Normalise whatever an ingest service calls its identifier. */
function normaliseRecord(r) {
  return {
    sourceId: r.sourceId || r.receiptNumber || r.slipId || r.expenseId || null,
    status: r.status,
    voucherNumber: r.voucherNumber,
    amount: typeof r.amount === 'number' ? r.amount : undefined,
    failureReason: r.reason,
    stage: r.stage,
  };
}

function outcomeOf(counts, threw) {
  if (threw) return 'aborted';
  if ((counts.failed || 0) === 0) return 'success';
  if ((counts.posted || 0) > 0) return 'partial';
  return 'failed';
}

/**
 * Run a sync cycle and record it.
 *
 * @param {object}   ctx
 * @param {string}   ctx.source   'fee' | 'payroll' | 'expense' | 'admission'
 * @param {string}   ctx.school
 * @param {object}   [ctx.req]    for the actor
 * @param {boolean}  [ctx.dryRun]
 * @param {Function} fn           the cycle; whatever it returns is passed through
 */
async function run({ source, school, req, dryRun = false }, fn) {
  const startedAt = new Date();
  smsClient.startRecording();

  let result;
  let threw = null;

  try {
    result = await fn();
  } catch (err) {
    threw = err;
  }

  const calls = smsClient.stopRecording();
  const finishedAt = new Date();

  const counts = result?.counts || {};
  const results = Array.isArray(result?.results) ? result.results.map(normaliseRecord) : [];
  const { kept, truncated } = selectRecords(results);

  const postedAmount = results
    .filter((r) => r.status === 'posted' && typeof r.amount === 'number')
    .reduce((sum, r) => sum + r.amount, 0);

  try {
    await FmsSyncLog.create({
      school: oid(school),
      source,
      dryRun,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      actor: req?.user?._id,
      actorEmail: req?.user?.email,
      calls,
      counts: {
        posted: counts.posted || 0,
        alreadyPosted: counts.alreadyPosted || 0,
        failed: counts.failed || 0,
        skipped: counts.skipped || 0,
      },
      postedAmount,
      records: kept,
      recordsTruncated: truncated,
      totalRecords: results.length,
      outcome: outcomeOf(counts, threw),
      error: threw ? threw.message : undefined,
    });
  } catch (logErr) {
    // Deliberately swallowed. See the header: the sync is the thing that
    // matters, and a diary that cannot be written is not a reason to undo it.
    // eslint-disable-next-line no-console
    console.error('[fms] sync log could not be written:', logErr.message);
  }

  if (threw) throw threw;
  return result;
}

/**
 * Recent runs, newest first.
 *
 * `calls` and `records` are omitted from the list — they are the bulky part and
 * nobody reads them until they open one.
 */
async function list(school, { source, outcome, limit = 25 } = {}) {
  const filter = { school: oid(school) };
  if (source) filter.source = source;
  if (outcome) filter.outcome = outcome;

  return FmsSyncLog.find(filter)
    .select('-calls -records')
    .sort({ startedAt: -1 })
    .limit(Math.min(100, Math.max(1, Number(limit) || 25)))
    .lean();
}

/** One run, in full. */
async function get(school, id) {
  return FmsSyncLog.findOne({ _id: oid(id), school: oid(school) }).lean();
}

/** Header figures: when did each source last run, and did it work? */
async function summary(school) {
  const rows = await FmsSyncLog.aggregate([
    { $match: { school: oid(school) } },
    { $sort: { startedAt: -1 } },
    {
      $group: {
        _id: '$source',
        lastRunAt: { $first: '$startedAt' },
        lastOutcome: { $first: '$outcome' },
        lastDurationMs: { $first: '$durationMs' },
        runs: { $sum: 1 },
        failedRuns: {
          $sum: { $cond: [{ $in: ['$outcome', ['failed', 'aborted']] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((r) => ({
    source: r._id,
    lastRunAt: r.lastRunAt,
    lastOutcome: r.lastOutcome,
    lastDurationMs: r.lastDurationMs,
    runs: r.runs,
    failedRuns: r.failedRuns,
  }));
}

module.exports = { run, list, get, summary, MAX_RECORDS, selectRecords };
