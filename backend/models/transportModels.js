// backend/models/transportModels.js
// Complete Transport Management Models — Drop-in replacement for the existing stub
// Compatible with the school-management-system project structure

const mongoose = require('mongoose');
const { Schema, model, models } = mongoose;

// ─── Helper to prevent OverwriteModelError ───────────────────────────────────
const safe = (name, schema) => models[name] || model(name, schema);

// =============================================================================
// BUS MODEL
// Represents a physical vehicle in the fleet
// =============================================================================
const BusSchema = new Schema({
  school:         { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  busNumber:      { type: String, required: true, uppercase: true, trim: true },
  registrationNo: { type: String, required: true, uppercase: true, trim: true },
  type:           { type: String, enum: ['bus', 'van', 'minibus', 'auto'], default: 'bus' },
  capacity:       { type: Number, required: true, default: 40 },
  color:          { type: String, default: '#3B82F6' },

  // Driver info (embedded for quick access without populate)
  driver: {
    name:    { type: String, required: true },
    phone:   { type: String, required: true },
    license: { type: String },
    photo:   { type: String },
  },

  // Helper / conductor
  helper: {
    name:  String,
    phone: String,
  },

  // GPS & live tracking
  currentLocation: {
    lat:       { type: Number, default: 18.5204 },  // Default: Pune
    lng:       { type: Number, default: 73.8567 },
    speed:     { type: Number, default: 0 },
    heading:   { type: Number, default: 0 },
    accuracy:  { type: Number, default: 0 },
    updatedAt: { type: Date,   default: Date.now },
  },

  // Assigned route
  assignedRoute:   { type: Schema.Types.ObjectId, ref: 'BusRoute' },

  // Maintenance & documents
  insurance: {
    number:  String,
    expiry:  Date,
  },
  fitness: {
    number:  String,
    expiry:  Date,
  },
  permit: {
    number:  String,
    expiry:  Date,
  },
  lastMaintenanceDate: Date,
  nextMaintenanceDate: Date,

  status: {
    type:    String,
    enum:    ['active', 'maintenance', 'inactive', 'breakdown'],
    default: 'active',
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

BusSchema.index({ school: 1, busNumber: 1 }, { unique: true });
BusSchema.index({ school: 1, registrationNo: 1 }, { unique: true });


// =============================================================================
// STOP MODEL
// Individual pickup/drop point on a route
// =============================================================================
const StopSchema = new Schema({
  school:    { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  route:     { type: Schema.Types.ObjectId, ref: 'BusRoute', required: true },

  name:      { type: String, required: true, trim: true },
  sequence:  { type: Number, required: true },           // Order on the route (1, 2, 3…)

  // Time bus arrives at this stop (HH:MM string, e.g. "07:30")
  morningArrivalTime: { type: String, required: true },   // e.g. "07:30"
  eveningArrivalTime: { type: String },                   // e.g. "14:00"

  // Geographic coords for map markers
  location: {
    lat: { type: Number },
    lng: { type: Number },
  },

  // Landmark description shown to students/parents
  landmark:  String,

  // Populated at runtime — how many students use this stop
  studentCount: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

StopSchema.index({ route: 1, sequence: 1 });


// =============================================================================
// BUS ROUTE MODEL
// A named route with an ordered list of stops
// =============================================================================
const BusRouteSchema = new Schema({
  school:     { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  name:       { type: String, required: true, trim: true },
  code:       { type: String, required: true, uppercase: true, trim: true }, // e.g. "RT-01"
  description: String,
  color:      { type: String, default: '#3B82F6' }, // Hex for map display

  // Ordered stops (embedded summary — full Stop docs are in Stop collection)
  stops: [{
    stop:         { type: Schema.Types.ObjectId, ref: 'Stop' },
    name:         String,
    sequence:     Number,
    morningTime:  String,
    eveningTime:  String,
    lat:          Number,
    lng:          Number,
    studentCount: { type: Number, default: 0 },
  }],

  // Assigned bus
  assignedBus: { type: Schema.Types.ObjectId, ref: 'Bus' },

  // Schedule
  morningDepartureTime: { type: String, default: '07:00' },
  eveningDepartureTime: { type: String, default: '13:30' },

  // Total students on this route
  totalStudents: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

BusRouteSchema.index({ school: 1, code: 1 }, { unique: true });


// =============================================================================
// TRANSPORT ASSIGNMENT MODEL
// Links a student to a specific route, stop, and bus
// =============================================================================
const TransportAssignmentSchema = new Schema({
  school:  { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  route:   { type: Schema.Types.ObjectId, ref: 'BusRoute', required: true },
  bus:     { type: Schema.Types.ObjectId, ref: 'Bus', required: true },

  // Student's specific stops
  pickupStop: {
    stopId:   { type: Schema.Types.ObjectId, ref: 'Stop' },
    name:     { type: String, required: true },
    time:     { type: String, required: true },  // e.g. "07:25"
    sequence: Number,
    lat:      Number,
    lng:      Number,
  },
  dropStop: {
    stopId:   { type: Schema.Types.ObjectId, ref: 'Stop' },
    name:     { type: String, required: true },
    time:     { type: String, required: true },  // e.g. "14:05"
    sequence: Number,
    lat:      Number,
    lng:      Number,
  },

  // Pass type
  passType:  { type: String, enum: ['morning', 'evening', 'both'], default: 'both' },

  // Monthly fee for this assignment
  monthlyFee: { type: Number, required: true },

  assignedDate: { type: Date, default: Date.now },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

// One active assignment per student
TransportAssignmentSchema.index({ student: 1, isActive: 1 });
TransportAssignmentSchema.index({ school: 1, route: 1, isActive: 1 });


// =============================================================================
// TRANSPORT FEE MODEL
// Monthly transport fee record per student
// =============================================================================
const TransportFeeSchema = new Schema({
  school:     { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  student:    { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  assignment: { type: Schema.Types.ObjectId, ref: 'TransportAssignment' },

  month:      { type: Number, required: true, min: 1, max: 12 },
  year:       { type: Number, required: true },

  amount:     { type: Number, required: true },   // Base amount
  lateFee:    { type: Number, default: 0 },       // Late payment penalty
  discount:   { type: Number, default: 0 },       // Sibling discount etc.
  totalDue:   { type: Number, required: true },   // amount + lateFee - discount

  status: {
    type:    String,
    enum:    ['pending', 'paid', 'partial', 'waived'],
    default: 'pending',
  },

  paidAmount:    { type: Number, default: 0 },
  paidDate:      Date,
  paymentMethod: { type: String, enum: ['cash', 'online', 'cheque', 'upi', 'bank_transfer'] },
  transactionId: String,
  receiptNo:     String,

  dueDate: Date,
  remarks: String,

  // Full payment history (for partial payments)
  paymentHistory: [{
    amount:        Number,
    date:          { type: Date, default: Date.now },
    method:        String,
    transactionId: String,
    recordedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
  }],
}, { timestamps: true });

// Unique fee per student per month per year
TransportFeeSchema.index({ student: 1, month: 1, year: 1, school: 1 }, { unique: true });

// Virtual: balance due
TransportFeeSchema.virtual('balanceDue').get(function () {
  return this.totalDue - this.paidAmount;
});


// =============================================================================
// TRIP MODEL
// A single journey (morning or evening) on a given day
// =============================================================================
const TripSchema = new Schema({
  school:    { type: Schema.Types.ObjectId, ref: 'School', required: true },
  route:     { type: Schema.Types.ObjectId, ref: 'BusRoute', required: true },
  bus:       { type: Schema.Types.ObjectId, ref: 'Bus', required: true },

  date:      { type: Date, required: true },
  tripType:  { type: String, enum: ['morning', 'evening'], required: true },

  status:    {
    type:    String,
    enum:    ['scheduled', 'in_progress', 'completed', 'cancelled'],
    default: 'scheduled',
  },

  startTime: Date,
  endTime:   Date,

  // Real-time progress through stops
  stopProgress: [{
    stopId:     Schema.Types.ObjectId,
    stopName:   String,
    status:     { type: String, enum: ['pending', 'reached', 'skipped'], default: 'pending' },
    actualTime: Date,
  }],

  // Alert history
  alerts: [{
    type:    { type: String, enum: ['delay', 'breakdown', 'route_change', 'emergency'] },
    message: String,
    sentAt:  { type: Date, default: Date.now },
  }],
}, { timestamps: true });


// =============================================================================
// GPS LOG MODEL
// Historical location data per bus
// =============================================================================
const GpsLogSchema = new Schema({
  school:    { type: Schema.Types.ObjectId, ref: 'School', required: true },
  bus:       { type: Schema.Types.ObjectId, ref: 'Bus', required: true },
  trip:      { type: Schema.Types.ObjectId, ref: 'Trip' },
  lat:       { type: Number, required: true },
  lng:       { type: Number, required: true },
  speed:     { type: Number, default: 0 },
  heading:   { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now, index: true },
}, { timestamps: false });

GpsLogSchema.index({ bus: 1, timestamp: -1 });


// =============================================================================
// EXPORTS
// =============================================================================
module.exports = {
  Bus:                  safe('Bus',                  BusSchema),
  Stop:                 safe('Stop',                 StopSchema),
  BusRoute:             safe('BusRoute',             BusRouteSchema),
  TransportAssignment:  safe('TransportAssignment',  TransportAssignmentSchema),
  TransportFee:         safe('TransportFee',         TransportFeeSchema),
  Trip:                 safe('Trip',                 TripSchema),
  GpsLog:               safe('GpsLog',               GpsLogSchema),
};
