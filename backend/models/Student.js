// backend/models/Student.js
const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  user:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  admissionNumber: { type: String, unique: true, required: true },
  rollNumber:      String,
  class:           { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  section:         String,
  status:          { type: String, enum: ['active', 'inactive', 'alumni'], default: 'active' },

  // Personal
  dateOfBirth:  Date,
  gender:       { type: String, enum: ['male', 'female', 'other'] },
  bloodGroup:   { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-'] },
  nationality:  { type: String, default: 'Indian' },
  religion:     String,
  category:     { type: String, enum: ['General','OBC','SC','ST','Other'] },
  hobbies:      String,
  profileImage: String,

  // Address
  address: {
    street:  String,
    city:    String,
    state:   String,
    pincode: String,
    country: { type: String, default: 'India' },
  },

  // ─── Parent / Guardian ────────────────────────────────────────────────────
  // parentId is the CANONICAL link to the parent's User document (role='parent').
  // All parent-auth middleware uses: Student.findOne({ parentId: req.user._id })
  parentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

  // String fields for display / search (always kept in sync with parentId's User doc)
  parentName:       String,
  parentPhone:      String,
  parentEmail:      String,   // mirrors User.email of the parent User doc
  guardianName:     String,
  guardianPhone:    String,
  guardianRelation: String,

  // Legacy alias — kept for backward compat with existing portal code
  // @deprecated  use parentId
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Academic
  admissionDate:  { type: Date, default: Date.now },
  previousSchool: String,
  previousClass:  String,

  // Health
  medicalInfo:   String,
  emergencyContact: {
    name:     String,
    phone:    String,
    relation: String,
  },

  // Documents
  documents: [{
    name:       String,
    url:        String,
    type:       { type: String, enum: ['aadhaar','birth_certificate','transfer_certificate','marksheet','photo','other'] },
    uploadedAt: { type: Date, default: Date.now },
  }],

  // System
  transportRoute: { type: mongoose.Schema.Types.ObjectId, ref: 'Transport' },
  libraryCard:    String,
  qrCode:         String,
  isActive:       { type: Boolean, default: true },
  school:         { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt:      { type: Date, default: Date.now },
});

// Auto-generate QR code string; keep legacy `parent` field in sync with parentId
StudentSchema.pre('save', function(next) {
  if (!this.qrCode) {
    this.qrCode = 'STU-QR-' + this._id.toString();
  }
  if (this.parentId) this.parent = this.parentId;
  next();
});

StudentSchema.index({ parentId: 1, school: 1 });
StudentSchema.index({ parentEmail: 1, school: 1 });

module.exports = mongoose.models.Student || mongoose.model('Student', StudentSchema);