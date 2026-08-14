// backend/fms/services/notification/events.js
//
// What each event says, and who should be told. SRS M19 / FR-M19, SCR-64.
//
// ─── PURE ON PURPOSE ─────────────────────────────────────────────────────────
// Given an event and its payload: which roles are notified, what the subject
// says, what the body says. No sending, no database. Getting the recipient list
// wrong means either the wrong person reads a salary figure, or the right
// person never learns an expense is waiting — and both are testable here
// without an SMTP server.
//
// ─── CHANNEL REALITY (the same shape as the gateway finding) ─────────────────
// FR-M19 asks for EMAIL, SMS, WHATSAPP and IN_APP. The SMS has infrastructure
// for two of them:
//
//   email    ✅ nodemailer, EMAIL_HOST/PORT/USER/PASS already configured
//   inApp    ✅ socket.io already running in server.js
//   sms      ❌ no gateway, no credentials
//   whatsapp ❌ no Business API, no credentials
//
// The unavailable two are NOT silently dropped. A dispatch to them is recorded
// with status 'notConfigured', so the log shows a message was meant to go and
// did not — rather than showing nothing and letting somebody assume it did.

const CHANNELS = ['email', 'inApp', 'sms', 'whatsapp'];

/** Channels the deployment can actually reach. */
const AVAILABLE_CHANNELS = ['email', 'inApp'];

const UNAVAILABLE_REASON = {
  sms: 'No SMS gateway is configured — no provider, no credentials',
  whatsapp: 'No WhatsApp Business API is configured — no provider, no credentials',
};

/**
 * Every event the FMS raises.
 *
 * `roles` is who is told BY DEFAULT. A per-user preference can narrow it but
 * never widen it — otherwise a preference becomes a way to grant yourself
 * sight of payroll.
 */
const EVENTS = {
  expenseSubmitted: {
    key: 'expenseSubmitted',
    label: 'An expense was submitted for approval',
    roles: ['accountant', 'accountsManager'],
    defaultChannels: ['email', 'inApp'],
    urgency: 'normal',
  },
  expenseApproved: {
    key: 'expenseApproved',
    label: 'An expense was approved',
    roles: ['accountant', 'accountsManager'],
    // Plus the person who raised it — resolved at dispatch, not listed here,
    // because it is a specific user rather than a role.
    alsoNotifyRequester: true,
    defaultChannels: ['email', 'inApp'],
    urgency: 'normal',
  },
  expenseRejected: {
    key: 'expenseRejected',
    label: 'An expense was rejected',
    roles: ['accountsManager'],
    alsoNotifyRequester: true,
    defaultChannels: ['email', 'inApp'],
    urgency: 'high',
  },
  budgetExceeded: {
    key: 'budgetExceeded',
    label: 'A budget head has been exceeded',
    roles: ['principal', 'accountsManager', 'chairman'],
    // sms is listed because a budget breach genuinely warrants one. It is not
    // configured, so dispatch records it as 'notConfigured' — the log then
    // shows what was MEANT to be sent, which is the point.
    defaultChannels: ['email', 'inApp', 'sms'],
    urgency: 'high',
  },
  budgetThreshold: {
    key: 'budgetThreshold',
    label: 'A budget head is near its limit',
    roles: ['accountsManager'],
    defaultChannels: ['inApp'],
    urgency: 'normal',
  },
  vendorPaymentDue: {
    key: 'vendorPaymentDue',
    label: 'A vendor payment is due',
    roles: ['accountsManager', 'accountant'],
    defaultChannels: ['email', 'inApp'],
    urgency: 'normal',
  },
  cashClosingPending: {
    key: 'cashClosingPending',
    label: 'The cash has not been counted and closed',
    roles: ['cashier', 'accountsManager'],
    defaultChannels: ['inApp'],
    urgency: 'high',
  },
  closingVariance: {
    key: 'closingVariance',
    label: 'A cash count did not match the books',
    roles: ['accountsManager', 'principal'],
    defaultChannels: ['email', 'inApp', 'sms'],
    urgency: 'high',
  },
  settlementOverdue: {
    key: 'settlementOverdue',
    label: 'Online collections have not been settled',
    roles: ['accountsManager'],
    defaultChannels: ['email', 'inApp'],
    urgency: 'normal',
  },
  ingestFailed: {
    key: 'ingestFailed',
    label: 'An ingest cycle had failures',
    roles: ['accountsManager'],
    defaultChannels: ['email', 'inApp'],
    urgency: 'high',
  },
  monthlySummary: {
    key: 'monthlySummary',
    label: 'Monthly financial summary',
    roles: ['principal', 'chairman', 'accountsManager'],
    defaultChannels: ['email'],
    urgency: 'low',
  },
};

/** ₹ for display. Notifications are read by people, not machines. */
function rupees(paise) {
  if (paise === null || paise === undefined) return '—';
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const s = String(Math.floor(abs / 100));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${neg ? '-' : ''}₹${grouped}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Compose the message for an event.
 *
 * Bodies are deliberately plain and short. A notification exists to make
 * somebody open the system, not to reproduce the record inside an email — and
 * an email that contains the full figures is one that leaks them to whatever
 * mailbox it reaches.
 */
function compose(eventKey, payload = {}) {
  const def = EVENTS[eventKey];
  if (!def) {
    return { error: `Unknown event '${eventKey}'`, known: Object.keys(EVENTS) };
  }

  const p = payload;
  let subject;
  let body;

  switch (eventKey) {
    case 'expenseSubmitted':
      subject = `Expense ${p.expenseNumber || ''} awaiting approval`.trim();
      body = `${p.requestedByName || 'A department'} submitted ${rupees(p.amount)} for ` +
             `${p.purpose || 'an expense'}. It is waiting for your action.`;
      break;

    case 'expenseApproved':
      subject = `Expense ${p.expenseNumber || ''} approved`.trim();
      body = `${rupees(p.amount)} for ${p.purpose || 'an expense'} was approved` +
             (p.approvedByName ? ` by ${p.approvedByName}` : '') + '.';
      break;

    case 'expenseRejected':
      subject = `Expense ${p.expenseNumber || ''} rejected`.trim();
      body = `${rupees(p.amount)} for ${p.purpose || 'an expense'} was rejected` +
             (p.reason ? `: ${p.reason}` : '') + '.';
      break;

    case 'budgetExceeded':
      subject = `Budget exceeded — ${p.accountName || p.accountCode || 'a head'}`;
      body = `${p.accountName || p.accountCode} has consumed ${rupees(p.consumed)} ` +
             `against a budget of ${rupees(p.budgetAmount)}. ` +
             `It is over by ${rupees(Math.abs(p.available || 0))}.`;
      break;

    case 'budgetThreshold':
      subject = `Budget nearly used — ${p.accountName || p.accountCode || 'a head'}`;
      body = `${p.accountName || p.accountCode} has used ` +
             `${Math.round((p.utilisation || 0) * 100)}% of its budget. ` +
             `${rupees(p.available)} remains.`;
      break;

    case 'vendorPaymentDue':
      subject = `Payment due — ${p.vendorName || 'a vendor'}`;
      body = `${rupees(p.amount)} is due to ${p.vendorName || 'a vendor'}` +
             (p.invoiceNumber ? ` against invoice ${p.invoiceNumber}` : '') +
             (p.dueDate ? `, due ${new Date(p.dueDate).toISOString().slice(0, 10)}` : '') + '.';
      break;

    case 'cashClosingPending':
      subject = `Cash not closed for ${p.date || 'yesterday'}`;
      body = `The cash for ${p.date || 'yesterday'} has not been counted and closed. ` +
             'A day left open cannot be reconciled later against what was actually there.';
      break;

    case 'closingVariance':
      subject = `Cash count variance on ${p.date || ''}`.trim();
      body = `The count for ${p.accountName || 'cash'} differs from the books by ` +
             `${rupees(Math.abs(p.variance || 0))} ` +
             `(${(p.variance || 0) < 0 ? 'short' : 'over'}). ` +
             'It needs verifying before it can be posted.';
      break;

    case 'settlementOverdue':
      subject = 'Online collections awaiting settlement';
      body = `${rupees(p.pendingAmount)} across ${p.pendingCount || 0} receipt(s) has been ` +
             `in the clearing account for up to ${p.oldestAgeDays || 0} days. ` +
             'Either the money has not arrived or it has not been settled.';
      break;

    case 'ingestFailed':
      subject = `${p.source || 'An'} ingest cycle had ${p.failed || 0} failure(s)`;
      body = `${p.failed || 0} record(s) could not be posted` +
             (p.firstReason ? `. First failure: ${p.firstReason}` : '.') +
             ' They will be retried on the next cycle.';
      break;

    case 'monthlySummary':
      subject = `Financial summary — ${p.period || 'last month'}`;
      body = `Income ${rupees(p.income)}, expenditure ${rupees(p.expenditure)}, ` +
             `${(p.surplus || 0) >= 0 ? 'surplus' : 'deficit'} ${rupees(Math.abs(p.surplus || 0))}.`;
      break;

    default:
      subject = def.label;
      body = def.label;
  }

  return {
    event: eventKey,
    subject,
    body,
    urgency: def.urgency,
    roles: def.roles,
    alsoNotifyRequester: !!def.alsoNotifyRequester,
    defaultChannels: def.defaultChannels,
  };
}

/**
 * Which channels will actually be used.
 *
 * A preference can NARROW the default but never widen it. Otherwise a user
 * could opt themselves into payroll notifications by editing a preference,
 * which is a permissions decision wearing a preference's clothes.
 */
function resolveChannels(eventKey, preference) {
  const def = EVENTS[eventKey];
  if (!def) return { channels: [], unavailable: [], error: `Unknown event '${eventKey}'` };

  const wanted = Array.isArray(preference?.channels) && preference.channels.length
    ? def.defaultChannels.filter((c) => preference.channels.includes(c))
    : def.defaultChannels;

  const channels = wanted.filter((c) => AVAILABLE_CHANNELS.includes(c));
  const unavailable = wanted
    .filter((c) => !AVAILABLE_CHANNELS.includes(c))
    .map((c) => ({ channel: c, reason: UNAVAILABLE_REASON[c] || 'not configured' }));

  return { channels, unavailable, suppressed: preference?.muted === true };
}

module.exports = {
  EVENTS,
  CHANNELS,
  AVAILABLE_CHANNELS,
  UNAVAILABLE_REASON,
  compose,
  resolveChannels,
  rupees,
};