// backend/models/Student.js — Enhanced Student Model
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

  // Guardian
  parent:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  parentName:   String,
  parentPhone:  String,
  parentEmail:  String,
  guardianName: String,
  guardianPhone:String,
  guardianRelation: String,

  // Academic
  admissionDate:  { type: Date, default: Date.now },
  previousSchool: String,
  previousClass:  String,

  // Health
  medicalInfo:   String,  // allergies, conditions
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
  qrCode:         String,  // stored QR code data URL or ID
  isActive:       { type: Boolean, default: true },
  school:         { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt:      { type: Date, default: Date.now },
});

// Auto-generate QR code string before saving
StudentSchema.pre('save', function(next) {
  if (!this.qrCode) {
    this.qrCode = 'STU-QR-' + this._id.toString();
  }
  next();
});

module.exports = mongoose.models.Student || mongoose.model('Student', StudentSchema);