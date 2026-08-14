// backend/fms/models/vendor/index.js
//
// fms_vendors          — the vendor master
// fms_vendordocuments  — KYC documents
//
// SRS M7 / FR-M7, screens SCR-26/27/28/29.
//
// GSTIN and PAN are validated by services/vendor/taxIdValidation.js, which
// checks the GSTIN's mod-36 checksum rather than just its shape — a typo'd
// GSTIN passes a regex and fails the school when the expense is questioned.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const VENDOR_STATUS = ['draft', 'active', 'onHold', 'blacklisted', 'inactive'];
const VENDOR_TYPE = ['goods', 'services', 'both', 'contractor', 'utility'];
const DOC_TYPE = [
  'gstCertificate', 'panCard', 'cancelledCheque', 'bankLetter',
  'msmeCertificate', 'tradeLicence', 'agreement', 'other',
];

const BankSchema = new mongoose.Schema({
  accountName: { type: String },
  accountNumber: { type: String },
  ifsc: { type: String },
  bankName: { type: String },
  branch: { type: String },
  accountType: { type: String, enum: ['current', 'savings', 'cc', 'od', null], default: null },
}, { _id: false });

const AddressSchema = new mongoose.Schema({
  line1: { type: String },
  line2: { type: String },
  city: { type: String },
  state: { type: String },
  stateCode: { type: String },      // GST state code, cross-checked against GSTIN
  pincode: { type: String },
  country: { type: String, default: 'India' },
}, { _id: false });

const VendorSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },

  vendorCode: { type: String, required: true },     // VEN-2026-27-00001
  vendorName: { type: String, required: true, trim: true },
  legalName: { type: String },
  vendorType: { type: String, enum: VENDOR_TYPE, default: 'goods' },

  gstin: { type: String, default: null },
  pan: { type: String, default: null },
  msmeNumber: { type: String },
  isGstRegistered: { type: Boolean, default: false },

  address: { type: AddressSchema, default: () => ({}) },

  contactPerson: { type: String },
  phone: { type: String },
  altPhone: { type: String },
  email: { type: String },
  website: { type: String },

  bank: { type: BankSchema, default: () => ({}) },

  // Payment terms, in days. 0 means immediate.
  creditDays: { type: Number, default: 0, min: 0 },
  paymentTerms: { type: String },

  /** 1–5, set by whoever deals with them. Advisory, never a control. */
  rating: { type: Number, min: 1, max: 5, default: null },
  ratingNote: { type: String },

  vendorStatus: { type: String, enum: VENDOR_STATUS, default: 'draft', index: true },

  // Blacklisting is a serious act and must carry a reason and an author.
  statusReason: { type: String },
  statusChangedBy: { type: ObjectId },
  statusChangedAt: { type: Date },

  notes: { type: String },
  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_vendors' });

VendorSchema.pre('validate', async function () {
  if (this.creditDays !== undefined && !Number.isInteger(this.creditDays)) {
    throw new Error('vendor: creditDays must be a whole number of days');
  }
});

VendorSchema.index({ school: 1, vendorCode: 1 }, { unique: true });
// A GSTIN identifies one taxable person. Two vendor records sharing one means
// duplicate masters, and payments split across both.
VendorSchema.index(
  { school: 1, gstin: 1 },
  { unique: true, partialFilterExpression: { gstin: { $type: 'string' } } }
);
VendorSchema.index({ school: 1, vendorStatus: 1, vendorName: 1 });
VendorSchema.index({ school: 1, vendorName: 1 });

['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  VendorSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error(
      'fms_vendors: vendors are deactivated or blacklisted, never deleted — ' +
      'purchase and payment history references them'
    );
  })
);

// ─────────────────────────────────────────────────────────────────────────────

const VendorDocumentSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },
  vendor: { type: ObjectId, required: true, index: true },

  docType: { type: String, enum: DOC_TYPE, required: true },
  docNumber: { type: String },
  fileName: { type: String, required: true },
  url: { type: String, required: true },
  mimeType: { type: String },
  sizeBytes: { type: Number },

  issueDate: { type: Date },
  expiryDate: { type: Date },

  verified: { type: Boolean, default: false },
  verifiedBy: { type: ObjectId },
  verifiedAt: { type: Date },
  verificationNote: { type: String },

  uploadedBy: { type: ObjectId },
  uploadedAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'fms_vendordocuments' });

VendorDocumentSchema.index({ school: 1, vendor: 1, docType: 1 });
VendorDocumentSchema.index({ school: 1, expiryDate: 1 });

// ─── No hard deletes ─────────────────────────────────────────────────────────
// KYC evidence, and the record of who verified it.
['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  VendorDocumentSchema.pre(op, { query: true, document: false }, async function () {
    throw new Error('fms_vendordocuments: vendor documents are never deleted');
  })
);

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsVendor: reg('FmsVendor', VendorSchema),
  FmsVendorDocument: reg('FmsVendorDocument', VendorDocumentSchema),
  VENDOR_STATUS, VENDOR_TYPE, DOC_TYPE,
};