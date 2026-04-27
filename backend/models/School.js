const mongoose = require('mongoose');

const SchoolSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  address: String,
  phone: String,
  email: String,
  logo: String,
  website: String,
  principalName: String,
  establishedYear: Number,
  board: { type: String, enum: ['CBSE', 'ICSE', 'State Board', 'IB', 'Other'], default: 'CBSE' },
  academicYear: { type: String, default: '2025-26' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('School', SchoolSchema);