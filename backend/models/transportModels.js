// backend/models/transportModels.js
// Complete Transport Management System - MongoDB Models
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER MODEL
// ─────────────────────────────────────────────────────────────────────────────
const DriverSchema = new Schema({
  school:       { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  name:         { type: String, required: true, trim: true },
  phone:        { type: String, required: true },
  altPhone:     String,
  email:        String,
  photo:        String,                      // Cloudinary URL
  role:         { type: String, enum: ['driver', 'helper'], default: 'driver' },

  // License details
  license: {
    number:  { type: String, required: true },
    type:    { type: String, enum: ['LMV', 'HMV', 'HPMV', 'other'], default: 'HMV' },
    expiry:  { type: Date, required: true },   // Alert sent 30 days before
    issued:  Date,
  },

  // Address
  address: { street: String, city: String, state: String, pincode: String },

  // Employment
  joiningDate:  { type: Date, default: Date.now },
  salary:       Number,
  status:       { type: String, enum: ['active', 'inactive', 'on_leave'], default: 'active' },
  assignedVehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle' },

  // Emergency contact
  emergencyContact: { name: String, phone: String, relation: String },
}, { timestamps: true });

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLE MODEL
// ─────────────────────────────────────────────────────────────────────────────
const VehicleSchema = new Schema({
  school:          { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  registrationNo:  { type: String, required: true, uppercase: true },
  type:            { type: String, enum: ['bus', 'van', 'minibus', 'auto'], default: 'bus' },
  make:            String,   // e.g. TATA, Ashok Leyland
  model:           String,   // e.g. Starbus Ultra
  year:            Number,
  capacity:        { type: Number, required: true },
  color:           String,
  photo:           String,

  // GPS
  gpsDeviceId:     String,
  simNumber:       String,

  // Current location (updated by socket/GPS)
  currentLocation: {
    lat:       { type: Number, default: 18.5204 },   // Default: Pune
    lng:       { type: Number, default: 73.8567 },
    speed:     { type: Number, default: 0 },          // km/h
    heading:   { type: Number, default: 0 },          // degrees
    updatedAt: { type: Date,   default: Date.now },
  },

  // Assigned staff
  driver:    { type: Schema.Types.ObjectId, ref: 'Driver' },
  helper:    { type: Schema.Types.ObjectId, ref: 'Driver' },
  assignedRoute: { type: Schema.Types.ObjectId, ref: 'TransportRoute' },

  // Status
  status:    { type: String, enum: ['active', 'maintenance', 'inactive'], default: 'active' },

  // Documents & maintenance
  insurance: { provider: String, policyNo: String, expiry: Date },
  fitness:   { certificateNo: String, expiry: Date },
  puc:       { certificateNo: String, expiry: Date },

  maintenance: [{
    type:        { type: String, enum: ['service', 'repair', 'tyre', 'other'] },
    description: String,
    date:        Date,
    cost:        Number,
    nextDueDate: Date,
    vendor:      String,
    odometer:    Number,
  }],

  // Fuel tracking
  fuelLogs: [{
    date:      Date,
    litres:    Number,
    cost:      Number,
    odometer:  Number,
    filledBy:  String,
  }],

  odometer:  { type: Number, default: 0 },   // Total km
}, { timestamps: true });

VehicleSchema.index({ school: 1, registrationNo: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE MODEL
// ─────────────────────────────────────────────────────────────────────────────
const StopSchema = new Schema({
  name:         { type: String, required: true },
  sequence:     { type: Number, required: true },   // 1, 2, 3...
  lat:          Number,
  lng:          Number,
  pickupTime:   String,   // "07:15"
  dropTime:     String,   // "14:30"
  landmark:     String,
  studentsAtStop: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
}, { _id: true });

const TransportRouteSchema = new Schema({
  school:       { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  name:         { type: String, required: true },         // "Route A - Kothrud"
  code:         { type: String, required: true },         // "RT-A"
  description:  String,
  vehicle:      { type: Schema.Types.ObjectId, ref: 'Vehicle' },
  driver:       { type: Schema.Types.ObjectId, ref: 'Driver' },
  stops:        [StopSchema],
  totalDistance: Number,   // km (calculated)
  estimatedTime: Number,   // minutes (calculated)
  morningStart:  String,   // "06:45"
  afternoonStart:String,   // "13:30"
  feePerMonth:   { type: Number, default: 0 },
  isActive:      { type: Boolean, default: true },
  color:         { type: String, default: '#3B82F6' },   // for map display
}, { timestamps: true });

TransportRouteSchema.index({ school: 1, code: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT TRANSPORT ALLOCATION
// ─────────────────────────────────────────────────────────────────────────────
const TransportAllocationSchema = new Schema({
  school:       { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  student:      { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  route:        { type: Schema.Types.ObjectId, ref: 'TransportRoute', required: true },
  vehicle:      { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  stopName:     { type: String, required: true },
  stopId:       Schema.Types.ObjectId,
  pickupTime:   String,
  dropTime:     String,
  transportCardNo: { type: String, unique: true, sparse: true },
  rfidTag:      String,    // for RFID boarding system
  feePerMonth:  { type: Number, required: true },
  startDate:    { type: Date, default: Date.now },
  endDate:      Date,
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

TransportAllocationSchema.index({ school: 1, student: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// LIVE TRIP (one per vehicle per day)
// ─────────────────────────────────────────────────────────────────────────────
const TripSchema = new Schema({
  school:     { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  route:      { type: Schema.Types.ObjectId, ref: 'TransportRoute', required: true },
  vehicle:    { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  driver:     { type: Schema.Types.ObjectId, ref: 'Driver' },
  date:       { type: Date, required: true },
  tripType:   { type: String, enum: ['morning', 'afternoon'], required: true },
  status:     { type: String, enum: ['scheduled', 'in_progress', 'completed', 'cancelled'], default: 'scheduled' },

  startTime:   Date,
  endTime:     Date,

  // GPS path (array of coords stored for playback)
  gpsBreadcrumbs: [{
    lat: Number, lng: Number, speed: Number, timestamp: Date,
  }],

  // Stop-wise progress
  stopProgress: [{
    stopId:      Schema.Types.ObjectId,
    stopName:    String,
    arrivedAt:   Date,
    departedAt:  Date,
    status:      { type: String, enum: ['pending', 'arrived', 'departed'], default: 'pending' },
  }],

  // Alert log
  alerts: [{
    type:    { type: String, enum: ['delay', 'route_change', 'breakdown', 'emergency', 'info'] },
    message: String,
    sentAt:  Date,
  }],

  notes: String,
}, { timestamps: true });

// ─────────────────────────────────────────────────────────────────────────────
// BOARDING LOG (real-time student boarding)
// ─────────────────────────────────────────────────────────────────────────────
const BoardingLogSchema = new Schema({
  school:     { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  trip:       { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
  student:    { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  route:      { type: Schema.Types.ObjectId, ref: 'TransportRoute' },
  vehicle:    { type: Schema.Types.ObjectId, ref: 'Vehicle' },
  date:       { type: Date, required: true },

  // Boarding
  boardedAt:    Date,
  boardedStop:  String,
  boardingMethod: { type: String, enum: ['rfid', 'qr', 'manual'], default: 'manual' },

  // Alighting
  alightedAt:   Date,
  alightedStop: String,

  status: { type: String, enum: ['boarded', 'alighted', 'absent', 'unknown'], default: 'unknown' },

  // Parent notification
  parentNotified:   { type: Boolean, default: false },
  notificationSentAt: Date,
}, { timestamps: true });

BoardingLogSchema.index({ trip: 1, student: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPORT FEE LEDGER
// ─────────────────────────────────────────────────────────────────────────────
const TransportFeeSchema = new Schema({
  school:     { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  student:    { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  allocation: { type: Schema.Types.ObjectId, ref: 'TransportAllocation' },
  month:      { type: Number, required: true },    // 1–12
  year:       { type: Number, required: true },
  amount:     { type: Number, required: true },
  lateFee:    { type: Number, default: 0 },
  discount:   { type: Number, default: 0 },
  totalDue:   { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  dueDate:    Date,
  paidDate:   Date,
  status:     { type: String, enum: ['pending', 'paid', 'partial', 'waived'], default: 'pending' },
  receiptNo:  String,
  paymentMethod: { type: String, enum: ['cash', 'online', 'cheque', 'upi'] },
  transactionId: String,
  remarks:    String,
}, { timestamps: true });

TransportFeeSchema.index({ school: 1, student: 1, month: 1, year: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPORT NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────
const TransportNotificationSchema = new Schema({
  school:     { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  trip:       { type: Schema.Types.ObjectId, ref: 'Trip' },
  route:      { type: Schema.Types.ObjectId, ref: 'TransportRoute' },
  type:       { type: String, enum: ['boarded', 'alighted', 'delay', 'route_change', 'emergency', 'info'], required: true },
  title:      { type: String, required: true },
  message:    { type: String, required: true },
  recipients: [{ type: Schema.Types.ObjectId, ref: 'User' }],  // parent user IDs
  readBy:     [{ type: Schema.Types.ObjectId, ref: 'User' }],
  sentAt:     { type: Date, default: Date.now },
  channel:    { type: String, enum: ['socket', 'email', 'sms', 'push'], default: 'socket' },
}, { timestamps: true });

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  Driver:                  mongoose.model('Driver',                  DriverSchema),
  Vehicle:                 mongoose.model('Vehicle',                 VehicleSchema),
  TransportRoute:          mongoose.model('TransportRoute',          TransportRouteSchema),
  TransportAllocation:     mongoose.model('TransportAllocation',     TransportAllocationSchema),
  Trip:                    mongoose.model('Trip',                    TripSchema),
  BoardingLog:             mongoose.model('BoardingLog',             BoardingLogSchema),
  TransportFee:            mongoose.model('TransportFee',            TransportFeeSchema),
  TransportNotification:   mongoose.model('TransportNotification',   TransportNotificationSchema),
};