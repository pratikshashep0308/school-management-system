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

  // ── TFS-EOS delta additions ────────────────────────────────────────────────
  // GAP-CFG-002 — languages consumed by the Notification Center and Parent App.
  supportedLanguages:    { type: [String], default: ['English'] },
  defaultParentLanguage: { type: String, default: 'English' },

  // GAP-CFG-003 / R-3 — the SINGLE authoritative source for attendance
  // thresholds. Eleven literals previously existed across the attendance code,
  // and the same rule appeared as both `75` and `0.75` in one file. Both values
  // are now read from here; their business meaning is unchanged.
  //
  // Presentation colour bands are deliberately NOT sourced from this object
  // (R-2). Changing a threshold must not silently repaint historical reports.
  aiThresholds: {
    attendanceWarningPct:  { type: Number, default: 75, min: 0, max: 100 },
    attendanceCriticalPct: { type: Number, default: 60, min: 0, max: 100 },
  },
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


// ── R-3 configuration validation ─────────────────────────────────────────────
// A critical threshold at or above the warning threshold is incoherent: a
// student could be "critical" without ever being "warning", so alerts would
// skip a level. Rejected rather than silently reordered.
SchoolSchema.pre('validate', function (next) {
  const t = this.aiThresholds || {};
  const warn = t.attendanceWarningPct;
  const crit = t.attendanceCriticalPct;
  if (warn == null || crit == null) return next();
  if (crit < 0 || warn > 100) {
    return next(new Error('AI_THRESHOLD_OUT_OF_RANGE: thresholds must satisfy 0 <= critical < warning <= 100'));
  }
  if (crit >= warn) {
    return next(new Error(
      `AI_THRESHOLD_ORDER: attendanceCriticalPct (${crit}) must be strictly below ` +
      `attendanceWarningPct (${warn}).`
    ));
  }
  return next();
});

module.exports = mongoose.model('School', SchoolSchema);