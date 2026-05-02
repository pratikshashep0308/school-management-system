const mongoose = require('mongoose');

const AdmissionSchema = new mongoose.Schema({

  // ── STUDENT DETAILS ──────────────────────────────────────────
  studentName:    { type: String, trim: true },
  dateOfBirth:    { type: Date },
  gender:         { type: String, enum: ['male', 'female', 'other'] },
  bloodGroup:     { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-',''] },
  photo:          { type: String, default: '' },
  nationality:    { type: String, default: 'Indian' },
  religion:       { type: String },
  category:       { type: String, enum: ['general','obc','sc','st','other',''], default: '' },
  motherTongue:   { type: String },
  aadhaarNumber:  { type: String },

  // ── ADDRESS ──────────────────────────────────────────────────
  address: {
    street:  String,
    city:    String,
    state:   String,
    pincode: String,
    country: { type: String, default: 'India' }
  },

  // ── ACADEMIC ─────────────────────────────────────────────────
  applyingForClass:   { type: String, default: '' },
  applyingForSection: { type: String },
  academicYear:       { type: String },
  previousSchool:     { type: String },
  previousClass:      { type: Number },
  previousGrade:      { type: String },
  previousBoard:      { type: String, enum: ['CBSE','ICSE','State Board','IB','IGCSE','Other',''], default: '' },
  tcNumber:           { type: String },

  // ── PARENT / GUARDIAN ────────────────────────────────────────
  father: {
    name:          String,
    occupation:    String,
    phone:         String,
    email:         { type: String, lowercase: true },
    qualification: String,
    income:        Number
  },
  mother: {
    name:          String,
    occupation:    String,
    phone:         String,
    email:         { type: String, lowercase: true },
    qualification: String
  },
  guardian: {
    name:     String,
    relation: String,
    phone:    String,
    email:    { type: String, lowercase: true }
  },

  // Primary contact (backward compat + public form)
  parentName:  { type: String },
  parentEmail: { type: String, lowercase: true },
  parentPhone: { type: String },

  // ── SIBLINGS ─────────────────────────────────────────────────
  siblings: [{
    name:     String,
    class:    String,
    school:   String,
    studying: { type: Boolean, default: true }
  }],

  // ── MEDICAL INFO ─────────────────────────────────────────────
  medical: {
    hasAllergies: { type: Boolean, default: false },
    allergies:    String,
    hasCondition: { type: Boolean, default: false },
    condition:    String,
    medications:  String,
    doctorName:   String,
    doctorPhone:  String
  },

  // ── EMERGENCY CONTACT ────────────────────────────────────────
  emergencyContact: {
    name:     String,
    relation: String,
    phone:    String,
    phone2:   String
  },

  // ── DOCUMENT CHECKLIST ───────────────────────────────────────
  documents: {
    birthCertificate:    { submitted: { type: Boolean, default: false }, url: String },
    transferCertificate: { submitted: { type: Boolean, default: false }, url: String },
    marksheet:           { submitted: { type: Boolean, default: false }, url: String },
    aadhaarCard:         { submitted: { type: Boolean, default: false }, url: String },
    passportPhoto:       { submitted: { type: Boolean, default: false }, url: String },
    casteCertificate:    { submitted: { type: Boolean, default: false }, url: String },
    medicalCertificate:  { submitted: { type: Boolean, default: false }, url: String },
    addressProof:        { submitted: { type: Boolean, default: false }, url: String }
  },

  // ── INTERVIEW ────────────────────────────────────────────────
  interview: {
    scheduled:   { type: Boolean, default: false },
    date:        Date,
    time:        String,
    mode:        { type: String, enum: ['in_person','online','phone',''], default: '' },
    venue:       String,
    conductedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score:       { type: Number, min: 0, max: 100 },
    remarks:     String,
    completed:   { type: Boolean, default: false }
  },

  // ── ENTRANCE TEST ────────────────────────────────────────────
  entranceTest: {
    required:  { type: Boolean, default: false },
    date:      Date,
    score:     Number,
    maxScore:  { type: Number, default: 100 },
    result:    { type: String, enum: ['pass','fail','pending',''], default: '' },
    remarks:   String
  },

  // ── ACTIVITY TIMELINE ────────────────────────────────────────
  timeline: [{
    action:  String,
    note:    String,
    byName:  String,
    by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at:      { type: Date, default: Date.now }
  }],

  // ── STATUS & PRIORITY ────────────────────────────────────────
  status: {
    type: String,
    enum: ['pending','under_review','interview_scheduled','approved','rejected','enrolled','waitlisted'],
    default: 'pending'
  },
  priority:          { type: String, enum: ['normal','high','urgent'], default: 'normal' },
  applicationNumber: { type: String, unique: true, sparse: true },
  notes:             String,
  internalNotes:     String,
  rejectionReason:   String,
  processedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt:       Date,

  // ── REGISTRATION FEE ─────────────────────────────────────────
  registrationFee: {
    amount:    Number,
    paid:      { type: Boolean, default: false },
    paidOn:    Date,
    receiptNo: String
  },

  // ── SOURCE ───────────────────────────────────────────────────
  source:     { type: String, enum: ['online','walk_in','referral','agent',''], default: 'online' },
  referredBy: String,

  school:    { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

AdmissionSchema.pre('save', function (next) {
  if (!this.applicationNumber) {
    const year = new Date().getFullYear();
    const rand = Math.random().toString(36).substr(2, 6).toUpperCase();
    this.applicationNumber = `ADM-${year}-${rand}`;
  }
  this.updatedAt = new Date();
  next();
});

AdmissionSchema.index({ school: 1, status: 1 });
AdmissionSchema.index({ parentEmail: 1 });
AdmissionSchema.index({ applicationNumber: 1 });
AdmissionSchema.index({ applyingForClass: 1, school: 1 });

module.exports = mongoose.model('Admission', AdmissionSchema);