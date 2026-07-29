// backend/fms/services/ingest/expenseIngestService.js
//
// SMS Expense → FMS. Per docs/discovery/04_integration_plan.md §4.
//
// ─── MOST OF TOUCHPOINT 3 IS NOT AN INTEGRATION ──────────────────────────────
// §4 is explicit: there is no SMS procurement model, no vendor model, no
// inventory model, no purchase routes. Purchase requests, purchase orders,
// goods receipts and vendor payables are wholly FMS-owned, and P4.3 already
// implements the postings §4 specifies:
//
//     invoice verified   Dr <expense head>      Cr 2201 Sundry Creditors
//     payment made       Dr 2201 Sundry Creditors   Cr Bank / Cash
//
// Rebuilding those here would duplicate a module that already exists and is
// tested. This file covers the ONE genuine boundary §4 identifies: SMS
// `Expense` records, read-only, keyed on `expense._id`.
//
// ─── THE DECISION THAT MATTERS ───────────────────────────────────────────────
// An SMS expense is money ALREADY SPENT. Feeding it through the FMS approval
// chain retroactively would manufacture a verification, an approval and a
// payment authorisation that never took place — an audit trail describing
// events that did not happen is worse than no trail at all.
//
// So an imported expense is recorded as completed, with a single workflow entry
// stating plainly that it was imported and NOT approved through the FMS. It
// appears alongside FMS-originated expenses because people want one list, but
// it never pretends to be one of them.

const mongoose = require('mongoose');
const {
  FmsAccount, FmsFinancialYear, FmsAuditTrail, FmsIngestState, FmsNumberSequence,
} = require('../../models/core');
const { FmsExpenseRequest } = require('../../models/expense');
const { FmsAccountMapping } = require('../../models/integration');
const smsClient = require('../../client/smsClient');
const posting = require('../ledger/LedgerPostingService');
const mapper = require('./accountMapper');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** §8.4 — the fallback head when a category has no mapping. */
const FALLBACK_EXPENSE_CODE = '5299';

/** Where the money came out of, when the SMS says how it was paid. */
const METHOD_TO_CODE = { cash: '1101', bank: '1201', cheque: '1201', online: '1202', upi: '1202' };

async function loadContext(school) {
  const [accounts, mappings] = await Promise.all([
    FmsAccount.find({ school, status: 'active', isPostable: true })
      .select('_id accountCode accountName accountType isCashAccount isBankAccount').lean(),
    // mappingType MUST be selected: indexMappings groups by it, so omitting it
    // indexed every mapping under `undefined` and the lookup silently found
    // nothing. Filtering on a field is not the same as projecting it.
    FmsAccountMapping.find({ school, mappingType: 'expenseCategory', isActive: true })
      .select('mappingType sourceKey account accountCode').lean(),
  ]);

  return {
    byCode: new Map(accounts.map((a) => [a.accountCode, a])),
    index: mapper.indexMappings(mappings),
    mappingCount: mappings.length,
  };
}

/**
 * Which expense head?
 *
 * §8.4 says only two categories exist today, so this is a small manual mapping
 * rather than a rule. An unmapped category falls back to 5299 and is FLAGGED —
 * unlike an unmapped fee type, which errors, because an expense category is a
 * free-text label in the SMS rather than a controlled list, and refusing every
 * new label would block the import entirely.
 */
function resolveExpenseAccount(expense, ctx) {
  const key = String(expense.category?._id || expense.category || '');

  const explicit = key ? ctx.index.expenseCategory?.get(key) : null;
  if (explicit) {
    return { account: explicit.account, accountCode: explicit.accountCode, mapped: true };
  }

  const fallback = ctx.byCode.get(FALLBACK_EXPENSE_CODE);
  if (!fallback) {
    return {
      error:
        `category '${expense.categoryName || key || 'none'}' has no mapping and ` +
        `no '${FALLBACK_EXPENSE_CODE} Other Expenses' account exists to hold it`,
      hint: 'Create 5299, or map this category under /api/fms/integrations/mappings.',
    };
  }

  return {
    account: fallback._id,
    accountCode: fallback.accountCode,
    mapped: false,
    needsReclassification: true,
    note: `Category '${expense.categoryName || 'unnamed'}' is unmapped — posted to Other Expenses`,
  };
}

function resolveCreditAccount(method, ctx) {
  const code = METHOD_TO_CODE[String(method || 'cash').toLowerCase()];
  if (!code) {
    return { error: `unknown payment method '${method}'`, hint: `known: ${Object.keys(METHOD_TO_CODE).join(', ')}` };
  }
  const acct = ctx.byCode.get(code);
  if (!acct) return { error: `payment method '${method}' maps to ${code}, which does not exist` };
  return { account: acct._id, accountCode: acct.accountCode };
}

/** Post one SMS expense. Returns a result; never throws for a bad record. */
async function postOne(school, expense, ctx, req) {
  const key = String(expense._id);

  const money = mapper.toPaiseStrict(expense.amount);
  if (!money.ok) {
    return { sourceId: key, status: 'failed', stage: 'amount', reason: money.error };
  }

  const date = new Date(expense.date || expense.expenseDate || expense.createdAt);
  if (Number.isNaN(date.getTime())) {
    return { sourceId: key, status: 'failed', stage: 'date', reason: 'no usable date on the expense' };
  }

  const fy = await FmsFinancialYear.findOne({
    school, startDate: { $lte: date }, endDate: { $gte: date },
  }).lean();
  if (!fy) {
    return { sourceId: key, status: 'failed', stage: 'financialYear',
      reason: `no financial year covers ${date.toISOString().slice(0, 10)}` };
  }
  if (['closed', 'locked'].includes(fy.fyStatus)) {
    return { sourceId: key, status: 'skipped', stage: 'financialYear',
      reason: `financial year ${fy.yearCode} is ${fy.fyStatus}` };
  }

  const debit = resolveExpenseAccount(expense, ctx);
  if (debit.error) {
    return { sourceId: key, status: 'failed', stage: 'expenseAccount', reason: debit.error, hint: debit.hint };
  }

  const credit = resolveCreditAccount(expense.paymentMethod || expense.method, ctx);
  if (credit.error) {
    return { sourceId: key, status: 'failed', stage: 'creditAccount', reason: credit.error, hint: credit.hint };
  }

  const description = expense.description || expense.title || expense.particulars || 'Expense';
  const payee = expense.paidTo || expense.vendor || expense.vendorName;

  try {
    const result = await posting.post({
      school,
      financialYear: fy._id,
      voucherType: 'payment',
      voucherDate: date,
      narration: `${description}${payee ? ` — ${payee}` : ''}`,
      referenceNumber: expense.billNumber || expense.receiptNumber,
      source: 'expense',
      sourceId: key,
      sourceRef: expense._id,
      postedBy: req?.user?._id,
      lines: [
        { account: debit.account, debit: money.paise, credit: 0,
          narration: description, partyName: payee },
        { account: credit.account, debit: 0, credit: money.paise,
          narration: description, partyName: payee },
      ],
    });

    const session = await mongoose.startSession();
    let record;
    try {
      await session.withTransaction(async () => {
        const expenseNumber = await FmsNumberSequence.next(
          school, fy._id, 'EXP', 'EXP', fy.yearCode, session
        );

        const [created] = await FmsExpenseRequest.create([{
          school,
          financialYear: fy._id,
          expenseNumber,
          requestDate: date,
          department: { name: expense.department?.name || expense.departmentName || 'Imported', ref: null },
          requestedBy: req?.user?._id,
          requestedByName: expense.createdByName || 'SMS import',
          vendor: { name: payee },
          category: expense.categoryName || expense.category?.name || 'Imported',
          purpose: description,
          remarks: expense.remarks,
          budgetHead: debit.account,
          budgetHeadCode: debit.accountCode,
          baseAmount: money.paise,
          totalAmount: money.paise,
          paymentMode: ['cheque', 'cash'].includes(expense.paymentMethod) ? expense.paymentMethod : 'neft',
          // Recorded as completed. The money is already gone; anything else
          // would misdescribe its state.
          expenseStatus: 'paymentCompleted',
          workflow: [{
            action: 'import',
            actor: req?.user?._id,
            actorEmail: req?.user?.email,
            actorRole: req?.fmsRole,
            // Stated plainly, because the empty approval chain below is a FACT
            // about this record, not a gap in it.
            comment:
              'Imported from the SMS. This expense was NOT verified or approved ' +
              'through the FMS workflow — it was already recorded as spent.',
            fromStatus: null,
            toStatus: 'paymentCompleted',
            at: new Date(),
          }],
          sourceSystem: 'sms',
          sourceExpenseId: expense._id,
          needsReclassification: !!debit.needsReclassification,
          createdBy: req?.user?._id,
        }], { session });
        record = created;
      });
    } finally {
      await session.endSession();
    }

    return {
      sourceId: key, status: 'posted',
      expenseNumber: record.expenseNumber,
      voucherNumber: result.voucher.voucherNumber,
      amount: money.paise,
      debitAccount: debit.accountCode,
      creditAccount: credit.accountCode,
      categoryMapped: !!debit.mapped,
      needsReclassification: !!debit.needsReclassification,
      note: debit.note,
    };
  } catch (err) {
    if (err.code === 'DUPLICATE_SOURCE' || err.code === 11000 ||
        /already (been )?(posted|ingested)/i.test(err.message || '')) {
      return { sourceId: key, status: 'alreadyPosted', reason: 'imported in an earlier cycle' };
    }
    return { sourceId: key, status: 'failed', stage: 'posting', reason: err.message, code: err.code };
  }
}

async function sync(school, opts = {}, req) {
  const startedAt = new Date();
  const { dryRun = false } = opts;

  let expenses;
  try {
    const raw = await smsClient.get('/expenses');
    expenses = Array.isArray(raw) ? raw : (raw?.data || []);
  } catch (err) {
    throw errors.conflict(
      `The SMS could not be reached: ${err.message}`,
      { hint: 'The cycle was abandoned before posting anything. It will retry on the next tick.' }
    );
  }

  const ctx = await loadContext(school);
  if (ctx.byCode.size === 0) {
    throw errors.conflict(
      'No postable accounts exist — the Chart of Accounts has not been set up',
      { hint: 'Expense import cannot run until the chart exists (O3).' }
    );
  }

  const results = [];
  const counts = { posted: 0, alreadyPosted: 0, failed: 0, skipped: 0 };

  for (const e of expenses) {
    if (dryRun) {
      const money = mapper.toPaiseStrict(e.amount);
      const debit = resolveExpenseAccount(e, ctx);
      const credit = resolveCreditAccount(e.paymentMethod || e.method, ctx);
      const already = await FmsIngestState.findOne({
        school: oid(school), source: 'expense', sourceId: String(e._id), ingestStatus: 'posted',
      }).lean();

      const problem = !money.ok ? money.error : (debit.error || credit.error);
      const status = already ? 'alreadyPosted' : (problem ? 'failed' : 'posted');
      counts[status] += 1;
      results.push({
        sourceId: String(e._id), status,
        amount: money.ok ? money.paise : null,
        debitAccount: debit.accountCode, creditAccount: credit.accountCode,
        categoryMapped: !!debit.mapped,
        needsReclassification: !!debit.needsReclassification,
        reason: problem || undefined,
      });
      continue;
    }

    const r = await postOne(school, e, ctx, req);
    counts[r.status] = (counts[r.status] || 0) + 1;
    results.push(r);
  }

  const cycle = {
    startedAt,
    finishedAt: new Date(),
    dryRun,
    sourceCounts: { expenses: expenses.length },
    counts,
    unmappedCategories: results.filter((r) => r.needsReclassification).length,
    failures: results.filter((r) => r.status === 'failed'),
    results,
    note:
      'Imported expenses are recorded as completed and carry no FMS approval ' +
      'trail — the money was already spent when the SMS recorded it. Purchase ' +
      'orders, goods receipts and vendor payables are FMS-owned (P4.3) and are ' +
      'not part of this import.',
  };

  if (!dryRun) {
    await FmsAuditTrail.create({
      school: oid(school), entity: 'fms_expenserequests', entityId: null,
      action: 'post',
      after: { cycle: 'expense', counts, unmapped: cycle.unmappedCategories },
      actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
      ipAddress: req?.ip,
    });
  }

  return cycle;
}

async function status(school) {
  const [imported, unmapped, failed] = await Promise.all([
    FmsExpenseRequest.countDocuments({ school, sourceSystem: 'sms' }),
    FmsExpenseRequest.countDocuments({ school, sourceSystem: 'sms', needsReclassification: true }),
    FmsIngestState.countDocuments({ school, source: 'expense', ingestStatus: 'failed' }),
  ]);

  const ctx = await loadContext(school);

  return {
    source: 'expense',
    importedExpenses: imported,
    unmappedCategories: unmapped,
    failedRecords: failed,
    categoryMappings: ctx.mappingCount,
    chartReady: ctx.byCode.size > 0,
    fallbackAccountPresent: ctx.byCode.has(FALLBACK_EXPENSE_CODE),
    note:
      'Purchase orders, goods receipts and vendor payables are FMS-owned and ' +
      'posted by the Purchase module (P4.3), not imported. §4 confirms the SMS ' +
      'has no procurement, vendor or inventory model.',
  };
}

module.exports = {
  sync, status, postOne, loadContext,
  resolveExpenseAccount, resolveCreditAccount,
  FALLBACK_EXPENSE_CODE, METHOD_TO_CODE,
};