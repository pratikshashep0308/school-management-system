// backend/models/transportModels.js
// ✅ FIXED & UPGRADED Transport Management Models
// Key fixes:
//   1. TransportAssignment has explicit routeId/busId/pickupStopId/dropStopId top-level fields
//   2. BusLocation model added (standalone live GPS snapshot per bus)
//   3. TransportFee: paymentDate virtual alias for backward compat
//   4. All indexes tuned for role-based filtered queries

'use strict';
const mongoose = require('mongoose');
const { Schema, model, models } = mongoose;
const safe = (name, schema) => models[name] || model(name, schema);

// ── BUS ───────────────────────────────────────────────────────────────────────
const BusSchema = new Schema({
  school:         { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  busNumber:      { type: String, required: true, uppercase: true, trim: true },
  registrationNo: { type: String, required: true, uppercase: true, trim: true },
  type:           { type: String, enum: ['bus','van','minibus','auto'], default: 'bus' },
  capacity:       { type: Number, required: true, default: 40 },
  color:          { type: String, default: '#3B82F6' },
  driver: {
    name: { type: String, required: true }, phone: { type: String, required: true },
    license: String, photo: String,
  },
  helper: { name: String, phone: String },
  currentLocation: {
    lat: { type: Number, default: 18.5204 }, lng: { type: Number, default: 73.8567 },
    speed: { type: Number, default: 0 }, heading: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 }, updatedAt: { type: Date, default: Date.now },
  },
  assignedRoute:       { type: Schema.Types.ObjectId, ref: 'BusRoute' },
  insurance:           { number: String, expiry: Date },
  fitness:             { number: String, expiry: Date },
  permit:              { number: String, expiry: Date },
  lastMaintenanceDate: Date,
  nextMaintenanceDate: Date,
  status:   { type: String, enum: ['active','maintenance','inactive','breakdown'], default: 'active' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
BusSchema.index({ school: 1, busNumber: 1 }, { unique: true });
BusSchema.index({ school: 1, registrationNo: 1 }, { unique: true });

// ── STOP ──────────────────────────────────────────────────────────────────────
const StopSchema = new Schema({
  school:             { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  route:              { type: Schema.Types.ObjectId, ref: 'BusRoute', required: true },
  name:               { type: String, required: true, trim: true },
  sequence:           { type: Number, required: true },
  morningArrivalTime: { type: String, required: true },
  eveningArrivalTime: String,
  location:           { lat: Number, lng: Number },
  landmark:           String,
  studentCount:       { type: Number, default: 0 },  // refreshed dynamically
  isActive:           { type: Boolean, default: true },
}, { timestamps: true });
StopSchema.index({ route: 1, sequence: 1 });

// ── BUS ROUTE ─────────────────────────────────────────────────────────────────
const BusRouteSchema = new Schema({
  school:      { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  name:        { type: String, required: true, trim: true },
  code:        { type: String, required: true, uppercase: true, trim: true },
  description: String,
  color:       { type: String, default: '#3B82F6' },
  stops: [{
    stop: { type: Schema.Types.ObjectId, ref: 'Stop' },
    name: String, sequence: Number,
    morningTime: String, eveningTime: String,
    lat: Number, lng: Number,
    studentCount: { type: Number, default: 0 },
  }],
  assignedBus:          { type: Schema.Types.ObjectId, ref: 'Bus' },
  morningDepartureTime: { type: String, default: '07:00' },
  eveningDepartureTime: { type: String, default: '13:30' },
  totalStudents:        { type: Number, default: 0 },
  isActive:             { type: Boolean, default: true },
}, { timestamps: true });
BusRouteSchema.index({ school: 1, code: 1 }, { unique: true });

// ── TRANSPORT ASSIGNMENT  ✅ FIXED ────────────────────────────────────────────
// Top-level routeId/busId/pickupStopId/dropStopId for direct querying
const TransportAssignmentSchema = new Schema({
  school:       { type: Schema.Types.ObjectId, ref: 'School',   required: true, index: true },
  student:      { type: Schema.Types.ObjectId, ref: 'Student',  required: true },
  routeId:      { type: Schema.Types.ObjectId, ref: 'BusRoute', required: true },
  busId:        { type: Schema.Types.ObjectId, ref: 'Bus',      required: true },
  pickupStopId: { type: Schema.Types.ObjectId, ref: 'Stop',     required: true },
  dropStopId:   { type: Schema.Types.ObjectId, ref: 'Stop',     required: true },
  // Denormalized for fast reads
  pickupStop: {
    stopId:   { type: Schema.Types.ObjectId, ref: 'Stop' },
    name:     { type: String, required: true },
    time:     { type: String, required: true },
    sequence: Number, lat: Number, lng: Number,
  },
  dropStop: {
    stopId:   { type: Schema.Types.ObjectId, ref: 'Stop' },
    name:     { type: String, required: true },
    time:     { type: String, required: true },
    sequence: Number, lat: Number, lng: Number,
  },
  passType:     { type: String, enum: ['morning','evening','both'], default: 'both' },
  monthlyFee:   { type: Number, required: true, min: 0 },
  assignedDate: { type: Date, default: Date.now },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });
TransportAssignmentSchema.index({ student: 1, isActive: 1 });
TransportAssignmentSchema.index({ school: 1, routeId: 1, isActive: 1 });
TransportAssignmentSchema.index({ pickupStopId: 1, isActive: 1 });

// ── TRANSPORT FEE  ✅ FIXED ───────────────────────────────────────────────────
const TransportFeeSchema = new Schema({
  school:        { type: Schema.Types.ObjectId, ref: 'School',  required: true, index: true },
  student:       { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  assignment:    { type: Schema.Types.ObjectId, ref: 'TransportAssignment' },
  month:         { type: Number, required: true, min: 1, max: 12 },
  year:          { type: Number, required: true },
  amount:        { type: Number, required: true },
  lateFee:       { type: Number, default: 0 },
  discount:      { type: Number, default: 0 },
  totalDue:      { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending','paid','partial','waived'],
    default: 'pending',
  },
  paidAmount:    { type: Number, default: 0 },
  paidDate:      Date,
  paymentMethod: { type: String, enum: ['cash','online','cheque','upi','bank_transfer'] },
  transactionId: String,
  receiptNo:     String,
  dueDate:       Date,
  remarks:       String,
  paymentHistory: [{
    amount: Number, date: { type: Date, default: Date.now },
    method: String, transactionId: String,
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  }],
}, { timestamps: true });
TransportFeeSchema.index({ student: 1, month: 1, year: 1, school: 1 }, { unique: true });
TransportFeeSchema.index({ school: 1, status: 1, month: 1, year: 1 });
// Virtual alias: paymentDate → paidDate (backward compat with old frontend)
TransportFeeSchema.virtual('paymentDate').get(function () { return this.paidDate; });
TransportFeeSchema.virtual('balanceDue').get(function () { return this.totalDue - this.paidAmount; });

// ── BUS LOCATION  ✅ NEW ──────────────────────────────────────────────────────
// One document per bus — upserted on each GPS ping.
// Consumers GET /transport/buses/:id/location for the current snapshot.
const BusLocationSchema = new Schema({
  busId:     { type: Schema.Types.ObjectId, ref: 'Bus',    required: true, unique: true },
  school:    { type: Schema.Types.ObjectId, ref: 'School', required: true },
  latitude:  { type: Number, required: true },
  longitude: { type: Number, required: true },
  speed:     { type: Number, default: 0 },
  heading:   { type: Number, default: 0 },
  accuracy:  { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: false });
BusLocationSchema.index({ school: 1, busId: 1 });

// ── TRIP ──────────────────────────────────────────────────────────────────────
const TripSchema = new Schema({
  school:   { type: Schema.Types.ObjectId, ref: 'School',   required: true },
  route:    { type: Schema.Types.ObjectId, ref: 'BusRoute', required: true },
  bus:      { type: Schema.Types.ObjectId, ref: 'Bus',      required: true },
  date:     { type: Date, required: true },
  tripType: { type: String, enum: ['morning','evening'], required: true },
  status:   { type: String, enum: ['scheduled','in_progress','completed','cancelled'], default: 'scheduled' },
  startTime: Date, endTime: Date,
  stopProgress: [{
    stopId: Schema.Types.ObjectId, stopName: String,
    status: { type: String, enum: ['pending','reached','skipped'], default: 'pending' },
    actualTime: Date,
  }],
  alerts: [{
    type: { type: String, enum: ['delay','breakdown','route_change','emergency'] },
    message: String, sentAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

// ── GPS LOG ───────────────────────────────────────────────────────────────────
const GpsLogSchema = new Schema({
  school:    { type: Schema.Types.ObjectId, ref: 'School', required: true },
  bus:       { type: Schema.Types.ObjectId, ref: 'Bus',    required: true },
  trip:      { type: Schema.Types.ObjectId, ref: 'Trip' },
  lat:       { type: Number, required: true },
  lng:       { type: Number, required: true },
  speed:     { type: Number, default: 0 },
  heading:   { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now, index: true },
}, { timestamps: false });
GpsLogSchema.index({ bus: 1, timestamp: -1 });

// =============================================================================
module.exports = {
  Bus:                 safe('Bus',                BusSchema),
  Stop:                safe('Stop',               StopSchema),
  BusRoute:            safe('BusRoute',           BusRouteSchema),
  TransportAssignment: safe('TransportAssignment',TransportAssignmentSchema),
  TransportFee:        safe('TransportFee',       TransportFeeSchema),
  BusLocation:         safe('BusLocation',        BusLocationSchema),
  Trip:                safe('Trip',               TripSchema),
  GpsLog:              safe('GpsLog',             GpsLogSchema),
};