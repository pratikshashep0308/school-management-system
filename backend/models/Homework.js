const mongoose = require('mongoose');

const HomeworkSchema = new mongoose.Schema({
  school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  class:       { type: mongoose.Schema.Types.ObjectId, ref: 'Class',   required: true },
  subject:     { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
  // Who actually created this (teacher OR admin) — the `teacher` ref is empty
  // when an admin creates homework, so we record the real name here.
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String },
  title:       { type: String, required: true },
  description: { type: String },
  dueDate:     { type: Date,   required: true },
  assignedDate:{ type: Date,   default: Date.now },
  attachments: [{ name: String, url: String }],
  status:      { type: String, enum: ['active','completed','not_completed','not_applicable','cancelled'], default: 'active' },
  // Per-student status: each student can set their own completion state
  studentStatuses: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    status:  { type: String, enum: ['completed','not_completed','not_applicable'], default: 'not_completed' },
    updatedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Homework', HomeworkSchema);