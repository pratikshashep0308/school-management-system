// backend/models/transportModels.js
// Safe wrapper — all models use mongoose.models check to prevent OverwriteModelError
// This file exists for backward compatibility only.
// Core models are defined in index.js

const mongoose = require('mongoose');
require('./School'); // ensure School is registered

// Re-export from index.js safely
const {
  Vehicle,
  TransportFee2,
  Transport,
} = require('./index');

// Export with the names the old transport system expected
module.exports = {
  Vehicle,
  TransportFee: TransportFee2,
  TransportRoute: Transport,
  // Stub models that may be referenced but aren't needed
  Driver: mongoose.models.Driver || mongoose.model('Driver', new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    name: String, phone: String, role: { type: String, default: 'driver' },
    license: { number: String, expiry: Date }, status: { type: String, default: 'active' },
  }, { timestamps: true })),
  Trip: mongoose.models.Trip || mongoose.model('Trip', new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    route: { type: mongoose.Schema.Types.ObjectId, ref: 'Transport' },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    date: Date, tripType: String, status: { type: String, default: 'scheduled' },
    startTime: Date, endTime: Date, stopProgress: Array, alerts: Array,
  }, { timestamps: true })),
  BoardingLog: mongoose.models.BoardingLog || mongoose.model('BoardingLog', new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    trip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    date: Date, status: { type: String, default: 'unknown' },
  }, { timestamps: true })),
  TransportAllocation: mongoose.models.TransportAllocation || mongoose.model('TransportAllocation', new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    route: { type: mongoose.Schema.Types.ObjectId, ref: 'Transport' },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    stopName: String, feePerMonth: Number, isActive: { type: Boolean, default: true },
  }, { timestamps: true })),
  TransportNotification: mongoose.models.TransportNotification || mongoose.model('TransportNotification', new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    type: String, title: String, message: String,
  }, { timestamps: true })),
};