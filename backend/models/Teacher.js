// backend/models/Teacher.js
const mongoose = require('mongoose');

const TeacherSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  employeeId:    { type: String, unique: true, sparse: true },  // sparse allows null without unique conflict
  subjects:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  classes:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
  classTeacherOf:{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  qualification: String,
  designation:   String,
  experience:    { type: Number, default: 0 },
  joiningDate:   { type: Date, default: Date.now },
  salary:        Number,
  address:       String,
  isActive:      { type: Boolean, default: true },
  school:        { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt:     { type: Date, default: Date.now },
});

module.exports = mongoose.models.Teacher || mongoose.model('Teacher', TeacherSchema);