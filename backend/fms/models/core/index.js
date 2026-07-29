// backend/fms/models/core/index.js
//
// The foundational FMS collections. Everything Phase 1–2 needs.
//
// ─── TWO RULES, BOTH LOAD-BEARING ────────────────────────────────────────────
//
// 1. EVERY model name is prefixed `Fms`.
//
//    The Database Design Document's sample code uses:
//        mongoose.models.Account || mongoose.model('Account', schema)
//
//    If a model of that name is ALREADY registered, `mongoose.models.X` returns
//    the existing one. The SMS registers `Notification`, `Report` and `Expense`
//    — all three are also FMS collection names. Without the prefix, the FMS
//    would silently receive the SMS model and read/write SMS collections,
//    violating the REST-only boundary with no error raised.
//
//    Prefixing makes collision impossible rather than merely unlikely.
//
// 2. EVERY model sets `{ collection: 'fms_...' }` explicitly.
//
//    Mongoose derives collection names from model names. `FmsLedgerEntry` would
//    become `fmsledgerentries` — unprefixed by our convention and not what any
//    migration or query expects. The Data Dictionary itself contains both
//    `fms_ledgerEntries` and `fms_ledgerentries`; we resolve that to the
//    all-lowercase form and set it explicitly everywhere.
//
// ─── MONEY ───────────────────────────────────────────────────────────────────
// Every monetary field is an INTEGER number of paise. Never a float.
//
// ─── DELETES ─────────────────────────────────────────────────────────────────
// No hard deletes on financial documents. Soft-cancel via `status`.
// `fms_ledgerentries` is append-only — corrections post a reversing voucher.

const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;
const ACCOUNT_TYPES = ['asset', 'liability', 'income', 'expense', 'equity'];

/**
 * Where a posting came from. ONE list, used by both fms_vouchers and
 * fms_ingeststate.
 *
 * These were originally two separate enums and they drifted: `purchase` was
 * added to vouchers in P4.3 but not to ingest state, so the first purchase
 * posting failed validation. A single list is the only way that cannot recur.
 *
 *   manual    entered by a person; no external source, so no idempotency key
 *   cycle     an ingest RUN marker rather than a document
 */
const POSTING_SOURCES = [
  'manual', 'fee', 'payroll', 'expense', 'purchase', 'bank', 'gateway', 'cycle',
];
const NORMAL_BALANCE = ['debit', 'credit'];
const DOC_STATUS = ['active', 'inactive', 'archived'];

/** Audit fields carried by every FMS document. */
const audit = {
  createdBy: { type: ObjectId },   // SMS User._id — opaque, no ref (REST boundary)
  updatedBy: { type: ObjectId },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. fms_financialyears
// ─────────────────────────────────────────────────────────────────────────────
const FinancialYearSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  yearCode: { type: String, required: true, trim: true },      // '2026-27'
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  fyStatus: {
    type: String,
    enum: ['open', 'closing', 'closed', 'locked', 'reopened'],
    default: 'open',
    index: true,
  },
  isCurrent: { type: Boolean, default: false },
  openingBalancesPosted: { type: Boolean, default: false },
  closedBy: { type: ObjectId },
  closedAt: { type: Date },
  reopenedBy: { type: ObjectId },
  lockedModules: [{ type: String }],
  status: { type: String, enum: DOC_STATUS, default: 'active' },
  ...audit,
}, { timestamps: true, collection: 'fms_financialyears' });

FinancialYearSchema.index({ school: 1, yearCode: 1 }, { unique: true });
FinancialYearSchema.index(
  { school: 1, isCurrent: 1 },
  { partialFilterExpression: { isCurrent: true } }
);
// Async-throw style: works on Mongoose 8 (the deployed version) AND 9, which
// dropped the callback `next` argument for document middleware.
FinancialYearSchema.pre('save', async function () {
  if (this.endDate <= this.startDate) {
    throw new Error('financialYear: endDate must be after startDate');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. fms_accountgroups
// ─────────────────────────────────────────────────────────────────────────────
const AccountGroupSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  groupCode: { type: String, required: true, trim: true },
  groupName: { type: String, required: true, trim: true },
  accountType: { type: String, enum: ACCOUNT_TYPES, required: true },
  normalBalance: { type: String, enum: NORMAL_BALANCE, required: true },
  parent: { type: ObjectId, ref: 'FmsAccountGroup', default: null },
  level: { type: Number, default: 1 },
  isSystem: { type: Boolean, default: false },
  status: { type: String, enum: DOC_STATUS, default: 'active' },
  ...audit,
}, { timestamps: true, collection: 'fms_accountgroups' });

AccountGroupSchema.index({ school: 1, groupCode: 1 }, { unique: true });
AccountGroupSchema.index({ school: 1, parent: 1 });
AccountGroupSchema.index({ school: 1, accountType: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// 3. fms_accounts — the Chart of Accounts
// ─────────────────────────────────────────────────────────────────────────────
const AccountSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  accountCode: { type: String, required: true, trim: true },
  accountName: { type: String, required: true, trim: true },
  accountGroup: { type: ObjectId, ref: 'FmsAccountGroup', required: true },
  accountType: { type: String, enum: ACCOUNT_TYPES, required: true },
  normalBalance: { type: String, enum: NORMAL_BALANCE, required: true },
  isPostable: { type: Boolean, default: true },
  isBankAccount: { type: Boolean, default: false },
  isCashAccount: { type: Boolean, default: false },
  openingBalance: { type: Number, default: 0 },   // integer paise
  currentBalance: { type: Number, default: 0 },   // integer paise — cache of SUM(dr)-SUM(cr)

  // SMS references — opaque ObjectIds captured at seed/ingest. NO `ref`:
  // populating across the boundary would violate the REST-only constraint.
  smsFeeTypeId: { type: ObjectId, default: null },
  smsExpenseCategoryId: { type: ObjectId, default: null },

  status: { type: String, enum: DOC_STATUS, default: 'active' },
  ...audit,
}, { timestamps: true, collection: 'fms_accounts' });

AccountSchema.index({ school: 1, accountCode: 1 }, { unique: true });
AccountSchema.index({ school: 1, accountGroup: 1 });
AccountSchema.index({ school: 1, accountType: 1, status: 1 });
AccountSchema.index({ school: 1, isBankAccount: 1 });
AccountSchema.index(
  { school: 1, smsFeeTypeId: 1 },
  { unique: true, partialFilterExpression: { smsFeeTypeId: { $type: 'objectId' } } }
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. fms_vouchers — the transaction header
// ─────────────────────────────────────────────────────────────────────────────
const VoucherSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, ref: 'FmsFinancialYear', required: true },
  voucherNumber: { type: String, required: true, trim: true },
  voucherType: {
    type: String,
    enum: ['income', 'payment', 'receipt', 'journal'],
    required: true,
  },
  voucherDate: { type: Date, required: true },
  narration: { type: String, default: '' },
  totalAmount: { type: Number, default: 0, min: 0 },   // integer paise, == Σ debits
  voucherStatus: {
    type: String,
    enum: ['draft', 'posted', 'reversed', 'cancelled'],
    default: 'draft',
    index: true,
  },
  referenceNumber: { type: String },

  // Provenance of an ingested posting.
  source: { type: String, enum: POSTING_SOURCES, default: 'manual' },
  sourceRef: { type: ObjectId },     // SMS source _id — opaque
  sourceKey: { type: String },       // idempotency key actually used (e.g. receiptNumber)
  sourceModel: { type: String },

  postedBy: { type: ObjectId },
  postedAt: { type: Date },
  reversalOf: { type: ObjectId, ref: 'FmsVoucher' },
  reversedBy: { type: ObjectId, ref: 'FmsVoucher' },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
  ...audit,
}, { timestamps: true, collection: 'fms_vouchers' });

VoucherSchema.index({ school: 1, voucherNumber: 1 }, { unique: true });
VoucherSchema.index({ school: 1, financialYear: 1, voucherDate: -1 });
VoucherSchema.index({ school: 1, voucherType: 1, voucherDate: -1 });
VoucherSchema.index({ source: 1, sourceRef: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// 5. fms_ledgerentries — APPEND-ONLY. The heart of the system.
// ─────────────────────────────────────────────────────────────────────────────
const LedgerEntrySchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, ref: 'FmsFinancialYear', required: true },
  voucher: { type: ObjectId, ref: 'FmsVoucher', required: true },
  voucherNumber: { type: String },                    // denormalised
  /**
   * Instrument or bank reference — cheque number, UTR, NEFT ref.
   *
   * Snapshotted onto the ENTRY, not left on the voucher, because BANK
   * RECONCILIATION MATCHES ON IT. A statement line reading 'NEFT CR NEFT001'
   * can only be tied to its posting if the posting carries NEFT001 somewhere a
   * matcher can see. Without this, only payments that happen to mention their
   * cheque number in free-text narration reconcile automatically.
   */
  referenceNumber: { type: String, default: null },
  voucherType: { type: String, enum: ['income', 'payment', 'receipt', 'journal'] },
  account: { type: ObjectId, ref: 'FmsAccount', required: true },
  accountCode: { type: String },                      // denormalised snapshot
  accountName: { type: String },                      // denormalised snapshot
  debit: { type: Number, default: 0, min: 0 },        // integer paise
  credit: { type: Number, default: 0, min: 0 },       // integer paise
  entryDate: { type: Date, required: true },
  narration: { type: String, default: '' },

  partyType: { type: String, enum: ['vendor', 'student', 'teacher', 'other', null], default: null },
  party: { type: ObjectId, default: null },           // opaque — may be an SMS id
  partyName: { type: String },                        // denormalised; survives SMS deletion

  department: { type: ObjectId, default: null },
  costCenter: { type: String },
  isReversal: { type: Boolean, default: false },
  reversalOf: { type: ObjectId, ref: 'FmsLedgerEntry' },
  postedBy: { type: ObjectId, required: true },
  status: { type: String, enum: ['posted', 'reversed'], default: 'posted' },
}, { timestamps: true, collection: 'fms_ledgerentries' });

// Exactly one side non-zero. Direction is never a signed amount.
LedgerEntrySchema.pre('validate', async function () {
  const dr = this.debit || 0;
  const cr = this.credit || 0;
  if ((dr > 0 && cr > 0) || (dr === 0 && cr === 0)) {
    throw new Error('ledgerEntry: exactly one of debit/credit must be non-zero');
  }
  if (!Number.isInteger(dr) || !Number.isInteger(cr)) {
    throw new Error('ledgerEntry: amounts must be integer paise, not float rupees');
  }
});

// Append-only: block updates and deletes at the model layer. The posting service
// is the only writer, and it only ever inserts.
const MUTATIONS = [
  'updateOne', 'updateMany', 'findOneAndUpdate',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
];
// { query: true, document: false } is required: without it Mongoose registers
// updateOne/deleteOne as DOCUMENT middleware too, which fires on save() and
// would block legitimate inserts.
MUTATIONS.forEach((op) =>
  LedgerEntrySchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_ledgerentries is append-only — post a reversing voucher instead');
  })
);

LedgerEntrySchema.index({ school: 1, financialYear: 1, entryDate: -1 });
LedgerEntrySchema.index({ school: 1, account: 1, entryDate: -1 });
LedgerEntrySchema.index({ school: 1, voucher: 1 });
LedgerEntrySchema.index({ school: 1, party: 1, entryDate: -1 });
LedgerEntrySchema.index({ voucherNumber: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// 6. fms_numbersequences — atomic voucher numbering
// ─────────────────────────────────────────────────────────────────────────────
const NumberSequenceSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  financialYear: { type: ObjectId, ref: 'FmsFinancialYear', required: true },
  type: {
    type: String,
    enum: ['EXP', 'INC', 'PMT', 'RCT', 'JV', 'PO', 'PR', 'GRN', 'VEN'],
    required: true,
  },
  prefix: { type: String, required: true },
  yearLabel: { type: String, required: true },
  sequence: { type: Number, default: 0 },
  padding: { type: Number, default: 5 },
  status: { type: String, enum: ['active'], default: 'active' },
}, { timestamps: true, collection: 'fms_numbersequences' });

NumberSequenceSchema.index({ school: 1, financialYear: 1, type: 1 }, { unique: true });

/**
 * Atomic issuer — one round-trip $inc, safe under concurrency.
 * MUST be called with the posting transaction's session.
 */
NumberSequenceSchema.statics.next = async function (school, financialYear, type, prefix, yearLabel, session) {
  const doc = await this.findOneAndUpdate(
    { school, financialYear, type },
    { $inc: { sequence: 1 }, $setOnInsert: { prefix, yearLabel, padding: 5 } },
    { new: true, upsert: true, session }
  );
  return `${doc.prefix}-${doc.yearLabel}-${String(doc.sequence).padStart(doc.padding, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. fms_ingeststate — idempotency ledger for REST ingest
// ─────────────────────────────────────────────────────────────────────────────
const IngestStateSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  source: { type: String, enum: POSTING_SOURCES, required: true },
  // The idempotency key. Confirmed clean on production 2026-07-27:
  //   fees    → receiptNumber   (0 duplicates, 0 null/blank across 160 ledgers)
  //   payroll → salarySlip._id
  //   expense → expense._id
  sourceId: { type: String, required: true },

  ingestStatus: {
    type: String,
    enum: ['pending', 'posted', 'failed', 'reversed', 'skipped'],
    default: 'pending',
    index: true,
  },
  voucher: { type: ObjectId, ref: 'FmsVoucher' },
  sourceAmount: { type: Number },        // ORIGINAL float rupees from SMS — proves the conversion
  postedAmount: { type: Number },        // integer paise actually posted
  sourceSnapshot: { type: mongoose.Schema.Types.Mixed },  // raw record, for audit/replay
  attempts: { type: Number, default: 0 },
  lastError: { type: String },
  lastAttemptAt: { type: Date },
  postedAt: { type: Date },
}, { timestamps: true, collection: 'fms_ingeststate' });

// THE guard against double-posting. A concurrent second ingest inserting the
// same key throws E11000, which the ingest service catches as "already posted".
IngestStateSchema.index({ school: 1, source: 1, sourceId: 1 }, { unique: true });
IngestStateSchema.index({ school: 1, source: 1, ingestStatus: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// 8. fms_roleassignments — FMS finance roles, keyed by SMS User._id
// ─────────────────────────────────────────────────────────────────────────────
const FINANCE_ROLES = [
  'chairman', 'trustee', 'principal', 'vicePrincipal', 'accountsManager',
  'accountant', 'cashier', 'purchaseOfficer', 'deptHead', 'teacher',
  'auditor', 'readOnly',
];

const MODULE_KEYS = [
  'accounts', 'income', 'expenses', 'approvals', 'budgets', 'vendors',
  'purchase', 'banking', 'pettyCash', 'ledger', 'journal', 'payments',
  'financialReports', 'audit', 'financialYear',
];

const RoleAssignmentSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  smsUserId: { type: ObjectId, required: true },   // opaque — the SMS is not joined
  smsUserEmail: { type: String },                  // denormalised, for readable admin screens
  financeRole: { type: String, enum: FINANCE_ROLES, required: true },
  // moduleKey → 'none' | 'read' | 'edit' | 'admin'
  permissions: { type: Map, of: String, default: {} },
  multiBranch: { type: Boolean, default: false },
  status: { type: String, enum: DOC_STATUS, default: 'active' },
  ...audit,
}, { timestamps: true, collection: 'fms_roleassignments' });

RoleAssignmentSchema.index({ school: 1, smsUserId: 1 }, { unique: true });
RoleAssignmentSchema.index({ school: 1, financeRole: 1, status: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// 9. fms_settings — plugin configuration + migration state
// ─────────────────────────────────────────────────────────────────────────────
const SettingsSchema = new mongoose.Schema({
  school: { type: ObjectId, default: null, index: true },  // null = global
  key: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed },
  description: { type: String },
  ...audit,
}, { timestamps: true, collection: 'fms_settings' });

SettingsSchema.index({ school: 1, key: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// 10. fms_audittrail — who/what/when, with before/after
// ─────────────────────────────────────────────────────────────────────────────
const AuditTrailSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  entity: { type: String, required: true },        // e.g. 'fms_vouchers'
  entityId: { type: ObjectId },
  action: {
    type: String,
    // Every distinct auditable act gets its own value. Folding one into another
    // (logging a verification as an approval, or a return as a rejection) would
    // make the trail read as something that did not happen.
    enum: [
      'create', 'update', 'cancel',
      'submit', 'verify', 'approve', 'reject', 'return',
      'post', 'reverse',
      'lock', 'reopen',
    ],
    required: true,
  },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  actor: { type: ObjectId },                       // SMS User._id
  actorEmail: { type: String },
  actorRole: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
  notes: { type: String },
}, { timestamps: true, collection: 'fms_audittrail' });

// Append-only, same reasoning as the ledger.
MUTATIONS.forEach((op) =>
  AuditTrailSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_audittrail is append-only');
  })
);

AuditTrailSchema.index({ school: 1, entity: 1, entityId: 1, createdAt: -1 });
AuditTrailSchema.index({ school: 1, actor: 1, createdAt: -1 });
AuditTrailSchema.index({ school: 1, createdAt: -1 });

// ─────────────────────────────────────────────────────────────────────────────
// Registration
//
// `mongoose.models.X || mongoose.model(...)` is safe HERE only because every
// name is Fms-prefixed and therefore cannot be an SMS model. The guard exists
// for repeated requires within the FMS itself (e.g. under jest), not to paper
// over a collision.
// ─────────────────────────────────────────────────────────────────────────────
function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

const models = {
  FmsFinancialYear: reg('FmsFinancialYear', FinancialYearSchema),
  FmsAccountGroup: reg('FmsAccountGroup', AccountGroupSchema),
  FmsAccount: reg('FmsAccount', AccountSchema),
  FmsVoucher: reg('FmsVoucher', VoucherSchema),
  FmsLedgerEntry: reg('FmsLedgerEntry', LedgerEntrySchema),
  FmsNumberSequence: reg('FmsNumberSequence', NumberSequenceSchema),
  FmsIngestState: reg('FmsIngestState', IngestStateSchema),
  FmsRoleAssignment: reg('FmsRoleAssignment', RoleAssignmentSchema),
  FmsSettings: reg('FmsSettings', SettingsSchema),
  FmsAuditTrail: reg('FmsAuditTrail', AuditTrailSchema),
};

module.exports = models;
module.exports.constants = {
  ACCOUNT_TYPES, NORMAL_BALANCE, DOC_STATUS, FINANCE_ROLES, MODULE_KEYS,
  POSTING_SOURCES,
};