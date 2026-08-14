// backend/fms/services/income/incomeService.js
//
// Income Management. SRS M3 / FR-M3, screens SCR-11 (list), SCR-12 (entry),
// SCR-13 (receipt).
//
// Records money received, posts it, and produces the receipt the payer takes
// away. Cancellation reverses; nothing is ever deleted.

const {
  FmsAccount, FmsFinancialYear, FmsAuditTrail,
} = require('../../models/core');
const { FmsIncomeVoucher, INCOME_CATEGORY, PAYMENT_MODE } = require('../../models/income');
const posting = require('../ledger/LedgerPostingService');
const money = require('../../utils/money');
const { errors } = require('../../utils/apiResponse');

const LOCKED_FY = ['closed', 'locked'];

/**
 * Which asset account a payment mode lands in, when the caller does not name one.
 *
 * `online` and `upi` deliberately do NOT default: the money has not reached the
 * bank account yet, and posting it straight to the main bank head would
 * overstate the balance until settlement. Discovery §2.5 routes them through a
 * clearing head, and the caller must say which.
 */
const MODE_HINT = {
  cash: 'isCashAccount',
  cheque: 'isBankAccount',
  bank: 'isBankAccount',
  dd: 'isBankAccount',
};

async function audit({ school, doc, action, before, after, req }) {
  await FmsAuditTrail.create({
    school,
    entity: 'fms_incomevouchers',
    entityId: doc?._id,
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

/** Resolve and validate the two accounts a receipt touches. */
async function resolveAccounts(school, { debitAccount, creditAccount, paymentMode }) {
  const [dr, cr] = await Promise.all([
    debitAccount ? FmsAccount.findOne({ _id: debitAccount, school }).lean() : null,
    FmsAccount.findOne({ _id: creditAccount, school }).lean(),
  ]);

  if (debitAccount && !dr) {
    throw errors.validation('Validation failed', { debitAccount: 'account not found' });
  }
  if (!cr) {
    throw errors.validation('Validation failed', { creditAccount: 'account not found' });
  }

  // The credit side must genuinely be income. Crediting an expense head would
  // balance arithmetically and be nonsense in every report.
  if (cr.accountType !== 'income') {
    throw errors.validation('Validation failed', {
      creditAccount: `${cr.accountCode} is an ${cr.accountType} account — income must be credited to an income head`,
    });
  }

  let debit = dr;
  if (!debit) {
    const hint = MODE_HINT[paymentMode];
    if (!hint) {
      throw errors.validation('Validation failed', {
        debitAccount: `is required for paymentMode '${paymentMode}' — ` +
          'online and UPI receipts must name the account explicitly, since the money ' +
          'has not settled to the bank yet',
      });
    }
    const candidates = await FmsAccount.find({ school, [hint]: true, status: 'active' }).lean();
    if (candidates.length !== 1) {
      throw errors.validation('Validation failed', {
        debitAccount: candidates.length === 0
          ? `no active ${paymentMode} account is configured`
          : `${candidates.length} accounts match '${paymentMode}' — name one explicitly`,
      });
    }
    debit = candidates[0];
  }

  for (const a of [debit, cr]) {
    if (!a.isPostable) {
      throw errors.validation('Validation failed', {
        account: `${a.accountCode} is a grouping head, not postable`,
      });
    }
    if (a.status !== 'active') {
      throw errors.validation('Validation failed', { account: `${a.accountCode} is ${a.status}` });
    }
  }

  return { debit, credit: cr };
}

/**
 * Record money received and post it. One call, one transaction inside
 * LedgerPostingService, one number.
 */
async function record(school, payload, req) {
  const {
    receiptDate, category, amount, paymentMode,
    creditAccount, debitAccount,
    payerName, payerType, smsStudentId, admissionNumber, className,
    narration, reference, instrumentNumber, instrumentDate, bankName,
  } = payload;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw errors.validation('Validation failed', {
      amount: 'must be a positive integer in paise (₹1,234.56 → 123456)',
    });
  }
  if (!INCOME_CATEGORY.includes(category)) {
    throw errors.validation('Validation failed', {
      category: `must be one of: ${INCOME_CATEGORY.join(', ')}`,
    });
  }
  if (!PAYMENT_MODE.includes(paymentMode)) {
    throw errors.validation('Validation failed', {
      paymentMode: `must be one of: ${PAYMENT_MODE.join(', ')}`,
    });
  }

  const date = new Date(receiptDate);
  if (Number.isNaN(date.getTime())) {
    throw errors.validation('Validation failed', { receiptDate: 'must be a valid date' });
  }
  if (date > new Date()) {
    throw errors.validation('Validation failed', {
      receiptDate: 'cannot be in the future — a receipt records money already received',
    });
  }

  // Instruments need a reference; without one a cheque cannot be traced.
  if (['cheque', 'dd'].includes(paymentMode) && !instrumentNumber) {
    throw errors.validation('Validation failed', {
      instrumentNumber: `is required for a ${paymentMode} receipt`,
    });
  }

  const fy = await FmsFinancialYear.findOne({
    school, startDate: { $lte: date }, endDate: { $gte: date },
  }).lean();
  if (!fy) {
    throw errors.validation('Validation failed', {
      receiptDate: `no financial year covers ${date.toISOString().slice(0, 10)}`,
    });
  }
  if (LOCKED_FY.includes(fy.fyStatus)) {
    throw errors.conflict(`Financial year ${fy.yearCode} is ${fy.fyStatus}`);
  }

  const { debit, credit } = await resolveAccounts(school, {
    debitAccount, creditAccount, paymentMode,
  });

  // Post first. If this fails, no receipt number is consumed and no record is
  // created — the sequence stays gapless, which matters because a missing
  // receipt number looks like a destroyed receipt.
  const result = await posting.post({
    school,
    financialYear: fy._id,
    voucherType: 'income',
    voucherDate: date,
    narration: narration || `${category} received from ${payerName}`,
    referenceNumber: reference || instrumentNumber,
    source: 'manual',
    postedBy: req?.user?._id,
    lines: [
      {
        account: debit._id,
        debit: amount,
        credit: 0,
        narration: `${paymentMode}${instrumentNumber ? ' ' + instrumentNumber : ''}`,
        partyType: payerType === 'student' ? 'student' : 'other',
        party: smsStudentId || null,
        partyName: payerName,
      },
      {
        account: credit._id,
        debit: 0,
        credit: amount,
        narration: narration || category,
        partyType: payerType === 'student' ? 'student' : 'other',
        party: smsStudentId || null,
        partyName: payerName,
      },
    ],
  });

  const doc = await FmsIncomeVoucher.create({
    school,
    financialYear: fy._id,
    receiptNumber: result.voucher.voucherNumber,   // one number, see the model note
    receiptDate: date,
    category,
    amount,
    paymentMode,
    instrumentNumber,
    instrumentDate: instrumentDate ? new Date(instrumentDate) : undefined,
    bankName,
    debitAccount: debit._id,
    debitAccountCode: debit.accountCode,
    creditAccount: credit._id,
    creditAccountCode: credit.accountCode,
    creditAccountName: credit.accountName,
    payerType: payerType || 'other',
    payerName,
    smsStudentId: smsStudentId || null,
    admissionNumber,
    className,
    narration,
    reference,
    incomeStatus: 'posted',
    voucher: result.voucher._id,
    postedBy: req?.user?._id,
    postedAt: new Date(),
    createdBy: req?.user?._id,
  });

  await audit({ school, doc, action: 'create', after: doc.toObject(), req });
  return { income: doc, voucher: result.voucher, entries: result.entries };
}

/** Cancel a receipt: reverses the posting. Never deletes. */
async function cancel(school, id, req, reason) {
  const doc = await FmsIncomeVoucher.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Income voucher');

  if (doc.incomeStatus === 'cancelled') {
    throw errors.conflict('This receipt is already cancelled', {
      cancelledAt: doc.cancelledAt, reason: doc.cancellationReason,
    });
  }
  if (!reason || !String(reason).trim()) {
    throw errors.validation('Validation failed', {
      reason: 'is required — a cancelled receipt without a reason cannot be explained to an auditor',
    });
  }

  const fy = await FmsFinancialYear.findById(doc.financialYear).lean();
  if (!fy || LOCKED_FY.includes(fy.fyStatus)) {
    throw errors.conflict(
      `Financial year is ${fy ? fy.fyStatus : 'missing'}; cancellation would post into a closed period`
    );
  }

  const before = doc.toObject();
  const result = await posting.reverse(doc.voucher, req?.user?._id, `Receipt cancelled: ${reason}`);

  doc.incomeStatus = 'cancelled';
  doc.cancelledBy = req?.user?._id;
  doc.cancelledAt = new Date();
  doc.cancellationReason = reason;
  doc.reversalVoucher = result.reversal._id;
  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({ school, doc, action: 'cancel', before, after: doc.toObject(), req });
  return { income: doc, reversal: result.reversal };
}

// ─────────────────────────────────────────────────────────────────────────────
// Receipt rendering
// ─────────────────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** ₹ in words — Indian numbering, for the receipt's amount line. */
function inWords(paise) {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function under100(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  }
  function under1000(n) {
    if (n < 100) return under100(n);
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + under100(n % 100) : '');
  }

  if (rupees === 0 && p === 0) return 'Zero Rupees Only';

  // Indian grouping: crore, lakh, thousand, hundred.
  const parts = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  if (crore) parts.push(under1000(crore) + ' Crore');
  if (lakh) parts.push(under1000(lakh) + ' Lakh');
  if (thousand) parts.push(under1000(thousand) + ' Thousand');
  if (rest) parts.push(under1000(rest));

  // Singular matters on a document a parent keeps: "One Rupee", not "One Rupees".
  let out = parts.join(' ') + (rupees === 1 ? ' Rupee' : ' Rupees');
  if (p) out += ' and ' + under100(p) + (p === 1 ? ' Paisa' : ' Paise');
  return out + ' Only';
}

/**
 * A printable HTML receipt.
 *
 * HTML rather than PDF deliberately: it prints correctly from any browser, needs
 * no new dependency, and can be emailed or shown on screen. `pdfkit` is already
 * an SMS dependency if a PDF is wanted later.
 */
function renderReceipt(doc, school) {
  const cancelled = doc.incomeStatus === 'cancelled';
  const d = (x) => (x ? new Date(x).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }) : '');

  const row = (label, value) => value
    ? `<tr><td class="l">${esc(label)}</td><td class="v">${esc(value)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Receipt ${esc(doc.receiptNumber)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --ink:#1a1a1a; --muted:#666; --rule:#d4d4d4; }
  * { box-sizing:border-box; }
  body { font-family:"Segoe UI",system-ui,sans-serif; color:var(--ink);
         margin:0; padding:24px; background:#f4f4f5; }
  .sheet { max-width:680px; margin:0 auto; background:#fff; padding:32px 36px;
           border:1px solid var(--rule); position:relative; }
  h1 { font-size:20px; margin:0 0 2px; letter-spacing:.02em; }
  .sub { color:var(--muted); font-size:12px; margin-bottom:20px; }
  .title { text-align:center; font-size:13px; letter-spacing:.18em; text-transform:uppercase;
           color:var(--muted); border-top:1px solid var(--rule); border-bottom:1px solid var(--rule);
           padding:8px 0; margin:20px 0; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  td { padding:7px 0; vertical-align:top; }
  td.l { color:var(--muted); width:38%; }
  td.v { font-weight:500; }
  .amount { margin:22px 0; padding:16px; background:#fafafa; border:1px solid var(--rule); }
  .amount .fig { font-size:26px; font-weight:600; }
  .amount .words { font-size:12px; color:var(--muted); margin-top:4px; font-style:italic; }
  .foot { margin-top:32px; display:flex; justify-content:space-between;
          font-size:11px; color:var(--muted); }
  .sign { text-align:right; }
  .sign span { display:block; border-top:1px solid var(--rule); padding-top:6px;
               margin-top:44px; min-width:180px; }
  .void { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
          font-size:82px; font-weight:800; color:rgba(200,0,0,.14);
          transform:rotate(-22deg); pointer-events:none; letter-spacing:.08em; }
  .cancelnote { background:#fff5f5; border:1px solid #f0c4c4; color:#8a1f1f;
                padding:10px 12px; font-size:12px; margin-bottom:18px; }
  @media print {
    body { background:#fff; padding:0; }
    .sheet { border:none; max-width:none; padding:0; }
    @page { margin:16mm; }
  }
</style></head>
<body><div class="sheet">
  ${cancelled ? '<div class="void">CANCELLED</div>' : ''}
  <h1>${esc(school?.name || 'The Future Step School')}</h1>
  <div class="sub">${esc(school?.address || '')}</div>

  ${cancelled ? `<div class="cancelnote"><strong>This receipt has been cancelled.</strong><br>
     ${esc(doc.cancellationReason || '')} &middot; ${d(doc.cancelledAt)}</div>` : ''}

  <div class="title">Money Receipt</div>

  <table>
    ${row('Receipt No.', doc.receiptNumber)}
    ${row('Date', d(doc.receiptDate))}
    ${row('Received From', doc.payerName)}
    ${row('Admission No.', doc.admissionNumber)}
    ${row('Class', doc.className)}
    ${row('Towards', doc.creditAccountName)}
    ${row('Payment Mode', doc.paymentMode?.toUpperCase())}
    ${row('Instrument No.', doc.instrumentNumber)}
    ${row('Bank', doc.bankName)}
    ${row('Remarks', doc.narration)}
  </table>

  <div class="amount">
    <div class="fig">${esc(money.format(doc.amount))}</div>
    <div class="words">${esc(inWords(doc.amount))}</div>
  </div>

  <div class="foot">
    <div>Computer-generated receipt.<br>Valid without signature unless cancelled.</div>
    <div class="sign"><span>Authorised Signatory</span></div>
  </div>
</div></body></html>`;
}

module.exports = {
  record, cancel, renderReceipt, inWords, resolveAccounts,
  INCOME_CATEGORY, PAYMENT_MODE,
};