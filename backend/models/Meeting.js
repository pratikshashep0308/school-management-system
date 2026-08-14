// backend/models/Meeting.js
//
// Meeting Management — captures everything from creation through RSVP through
// post-meeting minutes. `participants[]` stores per-user state (invited / RSVP
// / attended) so we don't need a separate join collection.
//
// Design choices worth noting:
// - `participants` is denormalized (each entry holds user ref + RSVP + attendance)
//   rather than splitting into 3 sub-collections. A meeting has 5-200 participants
//   typically; this keeps reads cheap and writes atomic.
// - `meetingLink` is just a string the creator pastes. We don't integrate with
//   Zoom/Meet/Teams APIs — that's deferred.
// - `attachments` use the same base64 dataUrl pattern as Teacher.documents to
//   avoid wiring cloud storage at this stage.
// - `strict: false` on subdocs so future fields don't require schema migrations.

const mongoose = require('mongoose');

const MEETING_TYPES = [
  'staff', 'parent', 'ptm', 'principal', 'department',
  'counseling', 'online_lecture', 'emergency', 'other',
];

const RSVP_STATES = ['pending', 'accepted', 'declined', 'maybe'];

const ParticipantSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Snapshot the role and name at invite-time so meeting history stays readable
  // even if the user is later deleted or has their role changed.
  roleAtInvite: String,
  nameAtInvite: String,

  rsvp:        { type: String, enum: RSVP_STATES, default: 'pending' },
  rsvpAt:      Date,

  // Attendance — admin marks these post-meeting. attended is the truth source;
  // joinedAt/leftAt are optional metadata if the platform supplied them later.
  attended:    { type: Boolean, default: null },  // null = not yet marked
  joinedAt:    Date,
  leftAt:      Date,
  attendanceNote: String,
}, { _id: false });

const MeetingSchema = new mongoose.Schema({
  // Basics
  title:       { type: String, required: true, trim: true },
  description: String,
  type:        { type: String, enum: MEETING_TYPES, default: 'other' },

  // When — startTime is the canonical anchor; endTime computed from duration
  // but stored so range queries (e.g. "meetings overlapping this hour") are fast.
  startTime:   { type: Date, required: true },
  durationMin: { type: Number, default: 30, min: 1 },
  endTime:     { type: Date, required: true },

  // Where
  location:    String,                       // physical room name
  meetingLink: String,                       // pasted Zoom/Meet/Teams URL
  isOnline:    { type: Boolean, default: false },

  // Content
  agenda:      String,                       // pre-meeting plan
  notes:       String,                       // MOM (minutes of meeting), filled after
  actionItems: [{
    text:      String,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dueDate:   Date,
    done:      { type: Boolean, default: false },
  }],
  // Attachments (base64 data URLs) — same pattern as Teacher.documents.
  attachments: {
    type: [new mongoose.Schema({}, { strict: false, _id: false })],
    default: [],
  },

  // Who
  organizer:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: { type: [ParticipantSchema], default: [] },

  // Status — `cancelled` keeps the record so MOM/attendance history isn't lost.
  status: { type: String, enum: ['scheduled', 'in_progress', 'completed', 'cancelled'], default: 'scheduled' },

  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
}, {
  timestamps: true,                          // adds createdAt / updatedAt automatically
  strict: false,                             // forward-compat for new fields
});

// Helpful indexes — startTime for calendar range queries, participants.user for
// "my meetings" queries, school for tenant scoping. Compound (school+startTime)
// is the most common.
MeetingSchema.index({ school: 1, startTime: 1 });
MeetingSchema.index({ 'participants.user': 1, startTime: 1 });

// Auto-compute endTime if caller didn't set it. Keeps callers from having to
// remember the conversion when they pass durationMin.
MeetingSchema.pre('validate', function(next) {
  if (this.startTime && this.durationMin && !this.endTime) {
    this.endTime = new Date(this.startTime.getTime() + this.durationMin * 60 * 1000);
  }
  next();
});

module.exports = mongoose.models.Meeting || mongoose.model('Meeting', MeetingSchema);
module.exports.MEETING_TYPES = MEETING_TYPES;
module.exports.RSVP_STATES   = RSVP_STATES;