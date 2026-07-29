// backend/fms/models/integration/index.js
//
// fms_accountmappings — how an SMS concept becomes an FMS account head.
// Per docs/discovery/04_integration_plan.md §8.
//
// One collection rather than four, because the question is always the same
// shape: "this thing over there, which head does its money go to?". Separate
// collections per integration would mean four resolvers that drift.

const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const MAPPING_TYPE = ['feeType', 'paymentMethod', 'payrollComponent', 'expenseCategory'];

const AccountMappingSchema = new mongoose.Schema({
  school: { type: ObjectId, required: true, index: true },

  mappingType: { type: String, enum: MAPPING_TYPE, required: true },

  /**
   * The SMS side. An opaque ObjectId string for a FeeType or ExpenseCategory,
   * or an enum value like 'cash' for a payment method. Kept as a string so one
   * field serves both without a discriminator.
   */
  sourceKey: { type: String, required: true },
  sourceLabel: { type: String },                 // human-readable, for the UI

  account: { type: ObjectId, required: true },   // fms_accounts._id
  accountCode: { type: String },
  accountName: { type: String },

  isActive: { type: Boolean, default: true },
  notes: { type: String },

  createdBy: { type: ObjectId },
  updatedBy: { type: ObjectId },
}, { timestamps: true, collection: 'fms_accountmappings' });

// One mapping per source key. Two would make the resolution order decide where
// real money lands, which is not a thing that should depend on iteration order.
AccountMappingSchema.index(
  { school: 1, mappingType: 1, sourceKey: 1 },
  { unique: true }
);
AccountMappingSchema.index({ school: 1, mappingType: 1, isActive: 1 });

function reg(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  FmsAccountMapping: reg('FmsAccountMapping', AccountMappingSchema),
  MAPPING_TYPE,
};