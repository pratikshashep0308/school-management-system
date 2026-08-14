const mongoose = require('mongoose');

// One behavioural note per student per day (per school).
// History is preserved: each day is its own document.
const BehaviouralNoteSchema = new mongoose.Schema({
  school:   { type: mongoose.Schema.Types.ObjectId, ref: 'School',  required: true },
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  date:     { type: Date, required: true },   // normalised to 00:00 of the day
  note:     { type: String, default: '' },
  category: { type: String, enum: ['general','positive','concern'], default: 'general' },
  createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String },
}, { timestamps: true });

// One note document per student per day per school
BehaviouralNoteSchema.index({ student: 1, date: 1, school: 1 }, { unique: true });

module.exports = mongoose.model('BehaviouralNote', BehaviouralNoteSchema);