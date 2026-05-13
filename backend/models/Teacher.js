// backend/models/Teacher.js
const mongoose = require('mongoose');

const TeacherSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  employeeId:    { type: String, unique: true, sparse: true },  // sparse allows null without unique conflict
  subjects:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  classes:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
  classTeacherOf:{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' },

  // Personal
  gender:        String,
  dateOfBirth:   Date,
  bloodGroup:    String,
  religion:      String,
  maritalStatus: String,                  // Single / Married / Divorced / Widowed
  fatherName:    String,                  // Father / Husband name
  nationalId:    String,                  // Aadhaar / equivalent
  panNumber:     String,
  address:       String,                  // Free-text home address (legacy)
  city:          String,
  state:         String,
  pincode:       String,
  emergencyContactName:   String,
  emergencyContactNumber: String,

  // Professional
  qualification:  String,
  designation:    String,
  department:     String,
  experience:     { type: Number, default: 0 },
  previousSchool: String,
  joiningDate:    { type: Date, default: Date.now },
  employmentType: String,                 // Full-time / Part-time / Contract

  // Payroll
  salary:           Number,
  salaryMethod:     String,               // Bank Transfer / Cash / Cheque
  bankName:         String,
  bankAccountNumber: String,
  ifscCode:         String,
  uanNumber:        String,               // EPF UAN
  pfNumber:         String,

  // Documents — generic store: each entry { type, url, name, uploadedAt }
  documents: [{
    type:       String,                   // 'aadhaar' | 'pan' | 'photo' | 'ssc' | 'graduation' | 'experience_cert' | 'address_proof' | 'bank_proof' | 'other'
    url:        String,
    name:       String,
    uploadedAt: { type: Date, default: Date.now },
  }],

  isActive:      { type: Boolean, default: true },
  school:        { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt:     { type: Date, default: Date.now },
}, {
  // Forward-compat: allow ad-hoc fields the frontend might send for fields we
  // haven't formally added to the schema yet (e.g. new HR sections).
  strict: false,
});

module.exports = mongoose.models.Teacher || mongoose.model('Teacher', TeacherSchema);