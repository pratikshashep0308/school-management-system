const mongoose = require('mongoose');

const SchoolSchema = new mongoose.Schema({
  // ── Basic Information ──
  name:              { type: String, required: true, trim: true },
  shortName:         String,
  schoolCode:        String,
  udiseCode:         String,
  affiliationNumber: String,
  board:             { type: String, enum: ['CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE', 'Other'], default: 'State Board' },
  medium:            String,
  schoolType:        { type: String, enum: ['Private', 'Government', 'Semi-Government', ''], default: '' },
  establishedYear:   Number,

  // ── Management Details ──
  principalName:       String,
  vicePrincipal:       String,
  chairman:            String,
  trustName:           String,
  registrationNumber:  String,

  // ── Contact Information ──
  phone:          String,   // mobile
  altMobile:      String,
  landline:       String,
  email:          String,
  website:        String,

  // ── Address ──
  address:  String,   // full address
  area:     String,
  city:     String,
  district: String,
  state:    String,
  country:  { type: String, default: 'India' },
  pincode:  String,

  // ── Branding (file URLs) ──
  logo:               String,
  banner:             String,
  principalSignature: String,
  stamp:              String,
  favicon:            String,

  // ── Academic Information ──
  academicYear:        { type: String, default: '2025-26' },
  currentSession:      String,
  admissionStartDate:  Date,
  admissionEndDate:    Date,
  workingDays:         String,
  weeklyOff:           String,
  timeZone:            { type: String, default: 'Asia/Kolkata' },

  // ── Identity & Documents ──
  gstNumber:              String,
  panNumber:              String,
  registrationCertNumber: String,
  recognitionNumber:      String,

  // ── Communication ──
  smsSenderId:      String,
  emailSenderName:  String,
  whatsappNumber:   String,
  emergencyContact: String,

  // ── Currency & Regional ──
  currency:    { type: String, default: 'INR' },
  language:    { type: String, default: 'English' },
  dateFormat:  { type: String, default: 'DD/MM/YYYY' },
  timeFormat:  { type: String, default: '12h' },

  // ── Social Media ──
  facebook:  String,
  instagram: String,
  youtube:   String,
  linkedin:  String,
  twitter:   String,

  // ── Location ──
  googleMapsUrl: String,
  latitude:      String,
  longitude:     String,

  // ── Status ──
  status:            { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  licenseExpiryDate: Date,

  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('School', SchoolSchema);