// backend/fms/services/vendor/vendorService.js
//
// Vendor Management. SRS M7 / FR-M7, screens SCR-26 (list), SCR-27 (entry),
// SCR-28 (history), SCR-29 (documents).

const mongoose = require('mongoose');
const {
  FmsFinancialYear, FmsNumberSequence, FmsAuditTrail, FmsLedgerEntry,
} = require('../../models/core');
const { FmsVendor, FmsVendorDocument } = require('../../models/vendor');
const { FmsExpenseRequest } = require('../../models/expense');
const { FmsPaymentVoucher } = require('../../models/payment');
const taxId = require('./taxIdValidation');
const { errors } = require('../../utils/apiResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Statuses a vendor may not be transacted with. */
const BLOCKED_STATUSES = ['blacklisted', 'onHold', 'draft', 'inactive'];

async function audit({ school, doc, action, before, after, req }) {
  await FmsAuditTrail.create({
    school,
    entity: 'fms_vendors',
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

/**
 * Validate the tax identifiers and normalise them.
 *
 * Both are optional — a small local supplier may have neither. But if a GSTIN
 * is supplied it must pass its checksum, and if both are supplied they must
 * describe the same taxable person.
 */
function checkTaxIds(payload) {
  const result = taxId.validatePair(payload.gstin, payload.pan);
  if (!result.valid) {
    throw errors.validation('Validation failed', {
      [result.field]: result.reason,
      ...(result.expected ? { expectedCheckCharacter: result.expected } : {}),
      ...(result.gstinPan ? { panInGstin: result.gstinPan } : {}),
    });
  }
  return {
    gstin: result.gstin?.gstin || null,
    pan: result.pan?.pan || (result.gstin?.pan ?? null),   // derive PAN from GSTIN if absent
    stateCode: result.gstin?.stateCode || null,
    stateName: result.gstin?.stateName || null,
  };
}

async function create(school, payload, req) {
  const tax = checkTaxIds(payload);

  if (tax.gstin) {
    const clash = await FmsVendor.findOne({ school, gstin: tax.gstin }).lean();
    if (clash) {
      throw errors.conflict(
        `GSTIN ${tax.gstin} already belongs to vendor ${clash.vendorCode} (${clash.vendorName})`,
        { vendorId: clash._id, vendorCode: clash.vendorCode }
      );
    }
  }

  // A GSTIN encodes the state. If the address disagrees, one of them is wrong —
  // and getting it wrong means charging the wrong kind of GST.
  if (tax.stateCode && payload.address?.stateCode &&
      payload.address.stateCode !== tax.stateCode) {
    throw errors.validation('Validation failed', {
      'address.stateCode':
        `state code ${payload.address.stateCode} contradicts the GSTIN, which is registered ` +
        `in ${tax.stateCode} (${tax.stateName}) — this affects whether GST is CGST+SGST or IGST`,
    });
  }

  const fy = await FmsFinancialYear.findOne({ school, isCurrent: true }).lean();
  if (!fy) throw errors.conflict('No current financial year is set');

  const session = await mongoose.startSession();
  let doc;
  try {
    await session.withTransaction(async () => {
      const vendorCode = await FmsNumberSequence.next(
        school, fy._id, 'VEN', 'VEN', fy.yearCode, session
      );

      const [created] = await FmsVendor.create([{
        school,
        vendorCode,
        vendorName: payload.vendorName,
        legalName: payload.legalName,
        vendorType: payload.vendorType || 'goods',
        gstin: tax.gstin,
        pan: tax.pan,
        msmeNumber: payload.msmeNumber,
        isGstRegistered: !!tax.gstin,
        address: {
          ...(payload.address || {}),
          // Derived from the GSTIN when not supplied — one fewer thing to get wrong.
          stateCode: payload.address?.stateCode || tax.stateCode,
          state: payload.address?.state || tax.stateName,
        },
        contactPerson: payload.contactPerson,
        phone: payload.phone,
        altPhone: payload.altPhone,
        email: payload.email,
        website: payload.website,
        bank: payload.bank || {},
        creditDays: payload.creditDays ?? 0,
        paymentTerms: payload.paymentTerms,
        rating: payload.rating ?? null,
        vendorStatus: 'draft',
        notes: payload.notes,
        createdBy: req?.user?._id,
      }], { session });

      doc = created;
    });
  } finally {
    await session.endSession();
  }

  await audit({ school, doc, action: 'create', after: doc.toObject(), req });
  return doc;
}

async function update(school, id, payload, req) {
  const doc = await FmsVendor.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Vendor');

  const before = doc.toObject();

  if (payload.gstin !== undefined || payload.pan !== undefined) {
    const tax = checkTaxIds({
      gstin: payload.gstin !== undefined ? payload.gstin : doc.gstin,
      pan: payload.pan !== undefined ? payload.pan : doc.pan,
    });

    if (tax.gstin && tax.gstin !== doc.gstin) {
      const clash = await FmsVendor
        .findOne({ school, gstin: tax.gstin, _id: { $ne: id } }).lean();
      if (clash) {
        throw errors.conflict(
          `GSTIN ${tax.gstin} already belongs to vendor ${clash.vendorCode}`,
          { vendorId: clash._id }
        );
      }
    }

    doc.gstin = tax.gstin;
    doc.pan = tax.pan;
    doc.isGstRegistered = !!tax.gstin;
  }

  const passthrough = [
    'vendorName', 'legalName', 'vendorType', 'msmeNumber', 'contactPerson',
    'phone', 'altPhone', 'email', 'website', 'creditDays', 'paymentTerms',
    'rating', 'ratingNote', 'notes',
  ];
  for (const k of passthrough) {
    if (payload[k] !== undefined) doc[k] = payload[k];
  }
  if (payload.address) doc.address = { ...doc.address.toObject?.() || doc.address, ...payload.address };
  if (payload.bank) doc.bank = { ...doc.bank.toObject?.() || doc.bank, ...payload.bank };

  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({ school, doc, action: 'update', before, after: doc.toObject(), req });
  return doc;
}

/**
 * Change status.
 *
 * Blacklisting and holding both need a reason: they stop payments, and someone
 * will eventually ask why.
 */
async function setStatus(school, id, { vendorStatus, reason }, req) {
  const doc = await FmsVendor.findOne({ _id: id, school });
  if (!doc) throw errors.notFound('Vendor');

  if (doc.vendorStatus === vendorStatus) {
    throw errors.conflict(`Vendor is already ${vendorStatus}`);
  }
  if (['blacklisted', 'onHold', 'inactive'].includes(vendorStatus) &&
      (!reason || !String(reason).trim())) {
    throw errors.validation('Validation failed', {
      reason: `is required when setting a vendor to '${vendorStatus}' — this stops payments`,
    });
  }

  // Activating requires the identifiers a payment will need.
  if (vendorStatus === 'active') {
    const missing = [];
    if (!doc.bank?.accountNumber) missing.push('bank.accountNumber');
    if (!doc.bank?.ifsc) missing.push('bank.ifsc');
    if (missing.length) {
      throw errors.validation('Validation failed', {
        bank: `bank details are required before a vendor can be activated — missing ${missing.join(', ')}`,
      });
    }
  }

  const before = doc.toObject();
  doc.vendorStatus = vendorStatus;
  doc.statusReason = reason;
  doc.statusChangedBy = req?.user?._id;
  doc.statusChangedAt = new Date();
  doc.updatedBy = req?.user?._id;
  await doc.save();

  await audit({ school, doc, action: 'update', before, after: doc.toObject(), req });
  return doc;
}

/** Can this vendor be transacted with right now? */
async function assertTransactable(school, vendorId) {
  const v = await FmsVendor.findOne({ _id: vendorId, school }).lean();
  if (!v) throw errors.notFound('Vendor');
  if (BLOCKED_STATUSES.includes(v.vendorStatus)) {
    throw errors.conflict(
      `Vendor ${v.vendorCode} is ${v.vendorStatus} and cannot be transacted with`,
      { vendorStatus: v.vendorStatus, reason: v.statusReason }
    );
  }
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents (SCR-29)
// ─────────────────────────────────────────────────────────────────────────────

async function addDocument(school, vendorId, payload, req) {
  const vendor = await FmsVendor.findOne({ _id: vendorId, school }).lean();
  if (!vendor) throw errors.notFound('Vendor');

  const doc = await FmsVendorDocument.create({
    school,
    vendor: vendor._id,
    docType: payload.docType,
    docNumber: payload.docNumber,
    fileName: payload.fileName,
    url: payload.url,
    mimeType: payload.mimeType,
    sizeBytes: payload.sizeBytes,
    issueDate: payload.issueDate ? new Date(payload.issueDate) : undefined,
    expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : undefined,
    uploadedBy: req?.user?._id,
  });

  await FmsAuditTrail.create({
    school, entity: 'fms_vendordocuments', entityId: doc._id,
    action: 'create', after: doc.toObject(),
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip,
  });

  return doc;
}

/** Verify a KYC document. The verifier must not be whoever uploaded it. */
async function verifyDocument(school, docId, req, note) {
  const doc = await FmsVendorDocument.findOne({ _id: docId, school });
  if (!doc) throw errors.notFound('Vendor document');

  if (doc.verified) throw errors.conflict('This document is already verified');
  if (String(doc.uploadedBy) === String(req?.user?._id)) {
    throw errors.forbidden(
      'Separation of duties: you cannot verify a document you uploaded.',
      { hint: 'A different authorised user must verify it.' }
    );
  }

  const before = doc.toObject();
  doc.verified = true;
  doc.verifiedBy = req?.user?._id;
  doc.verifiedAt = new Date();
  doc.verificationNote = note;
  await doc.save();

  await FmsAuditTrail.create({
    school, entity: 'fms_vendordocuments', entityId: doc._id,
    action: 'verify', before, after: doc.toObject(),
    actor: req?.user?._id, actorEmail: req?.user?.email, actorRole: req?.fmsRole,
    ipAddress: req?.ip,
  });

  return doc;
}

/** Documents past their expiry date, or expiring soon. */
async function expiringDocuments(school, withinDays = 30) {
  const cutoff = new Date(Date.now() + withinDays * 86400000);
  return FmsVendorDocument.find({
    school,
    expiryDate: { $ne: null, $lte: cutoff },
  }).sort({ expiryDate: 1 }).lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction history (SCR-28)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything transacted with a vendor.
 *
 * Purchase orders are P4.3, so they are absent here and the response says so
 * rather than implying the totals are complete. Expenses and payments are real.
 */
async function history(school, vendorId, { from, to } = {}) {
  const vendor = await FmsVendor.findOne({ _id: vendorId, school }).lean();
  if (!vendor) throw errors.notFound('Vendor');

  const dateRange = {};
  if (from) dateRange.$gte = new Date(from);
  if (to) {
    const d = new Date(to);
    d.setUTCHours(23, 59, 59, 999);
    dateRange.$lte = d;
  }
  const hasRange = Object.keys(dateRange).length > 0;

  const expenseMatch = { school: oid(school), 'vendor.ref': oid(vendorId) };
  if (hasRange) expenseMatch.requestDate = dateRange;

  const paymentMatch = { school: oid(school), vendorRef: oid(vendorId) };
  if (hasRange) paymentMatch.paymentDate = dateRange;

  const [expenses, payments, expAgg, payAgg] = await Promise.all([
    FmsExpenseRequest.find(expenseMatch)
      .select('_id expenseNumber requestDate purpose totalAmount expenseStatus budgetHeadCode')
      .sort({ requestDate: -1 }).limit(200).lean(),
    FmsPaymentVoucher.find(paymentMatch)
      .select('_id paymentNumber paymentDate amount paymentMode instrumentNumber paymentStatus expenseNumber')
      .sort({ paymentDate: -1 }).limit(200).lean(),
    FmsExpenseRequest.aggregate([
      { $match: { ...expenseMatch, expenseStatus: { $nin: ['rejected', 'cancelled'] } } },
      { $group: { _id: '$expenseStatus', total: { $sum: '$totalAmount' }, n: { $sum: 1 } } },
    ]),
    FmsPaymentVoucher.aggregate([
      { $match: { ...paymentMatch, paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' }, n: { $sum: 1 } } },
    ]),
  ]);

  const byStatus = Object.fromEntries(expAgg.map((r) => [r._id, { amount: r.total, count: r.n }]));
  const billed = expAgg.reduce((s, r) => s + r.total, 0);
  const paid = payAgg[0]?.total || 0;

  // Ledger entries where this vendor is the named party — the accounting view,
  // independent of the expense records.
  const [ledgerAgg] = await FmsLedgerEntry.aggregate([
    { $match: { school: oid(school), party: oid(vendorId) } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, n: { $sum: 1 } } },
  ]);

  return {
    vendor: {
      _id: vendor._id,
      vendorCode: vendor.vendorCode,
      vendorName: vendor.vendorName,
      gstin: vendor.gstin,
      pan: vendor.pan,
      vendorStatus: vendor.vendorStatus,
      creditDays: vendor.creditDays,
      rating: vendor.rating,
    },
    period: { from: from || null, to: to || null },
    summary: {
      totalBilled: billed,
      totalPaid: paid,
      outstanding: billed - paid,
      expenseCount: expAgg.reduce((s, r) => s + r.n, 0),
      paymentCount: payAgg[0]?.n || 0,
      byStatus,
      ledgerEntries: ledgerAgg?.n || 0,
      ledgerNet: (ledgerAgg?.debit || 0) - (ledgerAgg?.credit || 0),
    },
    expenses,
    payments,
    purchaseOrders: [],
    note: 'Purchase orders arrive in P4.3 and are not included in these totals',
  };
}

module.exports = {
  create, update, setStatus, assertTransactable,
  addDocument, verifyDocument, expiringDocuments,
  history, checkTaxIds, BLOCKED_STATUSES,
};