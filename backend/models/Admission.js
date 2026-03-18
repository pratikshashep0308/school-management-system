const mongoose = require('mongoose');

const AdmissionSchema = new mongoose.Schema({
  // Student details
  studentName:      { type: String, required: [true, 'Student name is required'], trim: true },
  dateOfBirth:      { type: Date },
  gender:           { type: String, enum: ['male', 'female', 'other'] },
  bloodGroup:       { type: String },
  photo:            { type: String, default: '' },

  // Academic
  applyingForClass: { type: Number, required: [true, 'Class is required'], min: 1, max: 12 },
  previousSchool:   { type: String },
  previousClass:    { type: Number },
  previousGrade:    { type: String },

  // Parent / Guardian
  parentName:       { type: String, required: [true, 'Parent name is required'] },
  parentEmail:      { type: String, required: [true, 'Parent email is required'], lowercase: true },
  parentPhone:      { type: String, required: [true, 'Parent phone is required'] },
  address:          { type: String },

  // Status management
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'enrolled'],
    default: 'pending',
  },
  applicationNumber: { type: String, unique: true, sparse: true },
  notes:             { type: String },
  processedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt:       { type: Date },

  // Meta
  school:    { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now },
});

// Auto-generate application number
AdmissionSchema.pre('save', function (next) {
  if (!this.applicationNumber) {
    const year = new Date().getFullYear();
    const rand = Math.random().toString(36).substr(2, 5).toUpperCase();
    this.applicationNumber = `ADM-${year}-${rand}`;
  }
  next();
});

// Index for fast lookup
AdmissionSchema.index({ school: 1, status: 1 });
AdmissionSchema.index({ parentEmail: 1 });

module.exports = mongoose.model('Admission', AdmissionSchema);
