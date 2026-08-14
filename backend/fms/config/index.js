// backend/fms/config/index.js
//
// FMS plugin configuration. Everything the plugin needs to boot lives here.
//
// Precedence (later wins):
//   1. these defaults
//   2. process.env
//   3. fms_settings collection  ← from P1.2 onward; not yet available at P1.1
//
// Nothing in this file reads an SMS model or an SMS collection.

const PLUGIN_VERSION = '0.1.0';

/**
 * The toggle. Must be the string 'true' — not '1', not 'yes'.
 * Deliberately strict so a typo fails closed rather than open.
 */
function isEnabled() {
  return process.env.FMS_ENABLED === 'true';
}

/**
 * Indian financial year: 1 April – 31 March.
 * Returns e.g. { code: 'FY2026-27', startDate, endDate } for the date given.
 */
function financialYearFor(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  // Jan–Mar (month index 0–2) belong to the FY that started the previous April.
  const startYear = d.getMonth() < 3 ? y - 1 : y;
  return {
    code: `FY${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
    startDate: new Date(Date.UTC(startYear, 3, 1, 0, 0, 0)),
    endDate: new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59)),
  };
}

const config = {
  version: PLUGIN_VERSION,
  isEnabled,

  // ── Money ──────────────────────────────────────────────────────────────────
  // FMS stores integer paise everywhere. Never float rupees.
  currency: {
    code: 'INR',
    symbol: '₹',
    minorUnitsPerUnit: 100,
    locale: 'en-IN',
  },

  // ── Financial year ─────────────────────────────────────────────────────────
  financialYear: {
    startMonth: 4, // April (1-indexed)
    startDay: 1,
    forDate: financialYearFor,
    current: () => financialYearFor(new Date()),
  },

  // ── SMS REST client ────────────────────────────────────────────────────────
  // The FMS talks to the SMS over HTTP only. It never imports an SMS model.
  sms: {
    baseUrl: process.env.FMS_SMS_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}/api`,
    serviceEmail: process.env.FMS_SERVICE_EMAIL || '',
    servicePassword: process.env.FMS_SERVICE_PASSWORD || '',
    timeoutMs: Number(process.env.FMS_SMS_TIMEOUT_MS || 15000),
    // JWT_EXPIRE is 30d on this deployment. Re-auth well before that so ingest
    // never fails silently on an expired token (discovery finding G3).
    tokenTtlMs: Number(process.env.FMS_TOKEN_TTL_MS || 24 * 60 * 60 * 1000),
    maxRetries: 2,
  },

  // ── Ingest cadence ─────────────────────────────────────────────────────────
  // Cron strings. Pull-only: the SMS is never modified to push (D5 / DL6).
  ingest: {
    enabled: process.env.FMS_INGEST_ENABLED === 'true',
    fees: process.env.FMS_CRON_FEES || '0 1 * * *',
    payroll: process.env.FMS_CRON_PAYROLL || '0 2 * * *',
    expenses: process.env.FMS_CRON_EXPENSES || '30 2 * * *',
    reconciliation: process.env.FMS_CRON_RECON || '0 3 * * *',
  },

  // ── Number sequence formats ────────────────────────────────────────────────
  // Actual allocation is transactional via fms_numberSequences (P1.4).
  numberFormats: {
    incomeVoucher: 'INC/{FY}/{SEQ:5}',
    receiptVoucher: 'RCT/{FY}/{SEQ:5}',
    paymentVoucher: 'PAY/{FY}/{SEQ:5}',
    journalVoucher: 'JV/{FY}/{SEQ:5}',
    expenseRequest: 'EXP/{FY}/{SEQ:5}',
    purchaseRequest: 'PR/{FY}/{SEQ:5}',
    purchaseOrder: 'PO/{FY}/{SEQ:5}',
    goodsReceipt: 'GRN/{FY}/{SEQ:5}',
  },

  // ── Collection naming ──────────────────────────────────────────────────────
  // Every FMS model MUST set { collection } explicitly. Mongoose would otherwise
  // derive a name from the model name and the two spellings would drift
  // (discovery P0.3 §1.2).
  collectionPrefix: 'fms_',
};

module.exports = config;