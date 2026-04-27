const mongoose = require('mongoose');

const HomeworkSchema = new mongoose.Schema({
  school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  class:       { type: mongoose.Schema.Types.ObjectId, ref: 'Class',   required: true },
  subject:     { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
  title:       { type: String, required: true },
  description: { type: String },
  dueDate:     { type: Date,   required: true },
  assignedDate:{ type: Date,   default: Date.now },
  attachments: [String],
  status:      { type: String, enum: ['active','completed','cancelled'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('Homework', HomeworkSchema);