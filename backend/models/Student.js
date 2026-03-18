const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  admissionNumber: { type: String, unique: true, required: true },
  rollNumber: { type: String },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  section: String,
  dateOfBirth: Date,
  gender: { type: String, enum: ['male', 'female', 'other'] },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  parentName: String,
  parentPhone: String,
  parentEmail: String,
  documents: [{
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  admissionDate: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  transportRoute: { type: mongoose.Schema.Types.ObjectId, ref: 'Transport' },
  libraryCard: String,
  medicalInfo: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Student', StudentSchema);
