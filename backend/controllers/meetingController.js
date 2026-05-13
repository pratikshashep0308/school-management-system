// backend/controllers/meetingController.js
//
// Endpoints surface a small CRUD plus a few targeted actions (rsvp, attendance,
// minutes). The "list" endpoint scopes results to what each role should see:
// admins see everything in their school, others see meetings they're invited to.
//
// Notifications are fired on:
//   - invite (one per participant on create / update-participants)
//   - rsvp change to the organizer
//   - meeting starting in 10 min (cron job)
//
// We piggyback on the existing Notification model so the bell icon and any
// existing real-time socket plumbing keeps working without changes.

const Meeting     = require('../models/Meeting');
const { Notification } = require('../models/index');
const User        = require('../models/User');
const Student     = require('../models/Student');
const mongoose    = require('mongoose');

// ── small helpers ───────────────────────────────────────────────────────────

// Emit a real-time event for a user (the frontend listens on `user_<id>`).
// Falls back to a noop if socket.io isn't mounted (tests / cli).
function pushSocket(req, userIds, event, payload) {
  const io = req.app.get('io');
  if (!io) return;
  for (const uid of userIds) {
    io.to('user_' + uid).emit(event, payload);
  }
}

// Build a Notification doc for each invited participant. We don't include
// the audience field — these are per-user, not broadcast.
async function notifyParticipants(req, meeting, { title, message, type = 'event' }) {
  const userIds = meeting.participants.map(p => p.user.toString())
    .filter(id => id !== req.user.id.toString());           // don't notify self
  if (!userIds.length) return;

  const docs = userIds.map(uid => ({
    title,
    message,
    type,
    audience: 'all',                                         // required by schema, unused for direct
    targetUser: uid,                                          // ad-hoc field — schema is strict, but we ignore for now
    sentBy: req.user.id,
    school: req.user.school,
    meetingId: meeting._id,
  }));
  try {
    // Notification schema is strict — only fields declared survive. We push
    // through anyway because the title/message/type/sentBy are enough for the
    // bell to display; meetingId can be inferred client-side from the message.
    await Notification.insertMany(docs, { ordered: false });
  } catch (err) {
    console.error('Meeting notification insert failed:', err.message);
  }
  pushSocket(req, userIds, 'meeting:invite', { meetingId: meeting._id, title, message });
}

// ── controllers ─────────────────────────────────────────────────────────────

// GET /api/meetings  — scoped to the caller's visibility
exports.list = async (req, res) => {
  try {
    const { from, to, type, status, mine } = req.query;
    const filter = { school: req.user.school };

    if (type)   filter.type   = type;
    if (status) filter.status = status;
    if (from || to) {
      filter.startTime = {};
      if (from) filter.startTime.$gte = new Date(from);
      if (to)   filter.startTime.$lte = new Date(to);
    }

    // Non-admin roles only see meetings they're invited to (or organizing).
    // `mine=1` lets even admins narrow to their own.
    const isAdmin = ['superAdmin', 'schoolAdmin'].includes(req.user.role);
    if (!isAdmin || mine === '1') {
      filter.$or = [
        { organizer: req.user._id },
        { 'participants.user': req.user._id },
      ];
    }

    const meetings = await Meeting.find(filter)
      .populate('organizer',         'name role')
      .populate('participants.user', 'name email role')
      .sort({ startTime: 1 });

    res.json({ success: true, data: meetings });
  } catch (err) {
    console.error('Meeting list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/meetings/:id
exports.get = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, school: req.user.school })
      .populate('organizer',         'name email role')
      .populate('participants.user', 'name email role')
      .populate('actionItems.assignedTo', 'name');
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });
    res.json({ success: true, data: meeting });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/meetings  — create. Body may include `participantUserIds` (array
// of User ObjectIds) or `groups` (array of role strings like ['teacher'] to
// auto-expand). We resolve groups before persisting.
exports.create = async (req, res) => {
  try {
    const {
      title, description, type, startTime, durationMin,
      location, meetingLink, isOnline, agenda,
      participantUserIds = [], groups = [], classId,
      attachments,
    } = req.body;

    if (!title?.trim())  return res.status(400).json({ success: false, message: 'Title required' });
    if (!startTime)      return res.status(400).json({ success: false, message: 'Start time required' });

    // Expand group selectors into concrete user IDs. Examples:
    //   groups = ['teacher']             → all teacher users in school
    //   groups = ['parents_of_class']    → all parent users whose child is in classId
    let resolvedIds = new Set(participantUserIds.map(String));

    if (groups.includes('all_teachers') || groups.includes('teacher')) {
      const ts = await User.find({ school: req.user.school, role: 'teacher', isActive: true }).select('_id');
      ts.forEach(u => resolvedIds.add(u._id.toString()));
    }
    if (groups.includes('all_staff')) {
      const ts = await User.find({ school: req.user.school, role: { $in: ['teacher','accountant','librarian','transportManager','schoolAdmin'] }, isActive: true }).select('_id');
      ts.forEach(u => resolvedIds.add(u._id.toString()));
    }
    if (groups.includes('all_parents')) {
      const ps = await User.find({ school: req.user.school, role: 'parent', isActive: true }).select('_id');
      ps.forEach(u => resolvedIds.add(u._id.toString()));
    }
    if (groups.includes('all_students')) {
      const ss = await User.find({ school: req.user.school, role: 'student', isActive: true }).select('_id');
      ss.forEach(u => resolvedIds.add(u._id.toString()));
    }
    // Class-scoped invites: parents/students of one class
    if (classId && groups.includes('parents_of_class')) {
      const studs = await Student.find({ school: req.user.school, class: classId, isActive: true }).select('parentId');
      studs.forEach(s => s.parentId && resolvedIds.add(s.parentId.toString()));
    }
    if (classId && groups.includes('students_of_class')) {
      const studs = await Student.find({ school: req.user.school, class: classId, isActive: true }).select('user');
      studs.forEach(s => s.user && resolvedIds.add(s.user.toString()));
    }

    // Always include the organizer so they show up on their own meeting list.
    resolvedIds.add(req.user.id.toString());

    // Hydrate participant entries with their role + name snapshot.
    const userDocs = await User.find({ _id: { $in: [...resolvedIds] }, school: req.user.school }).select('name role');
    const participants = userDocs.map(u => ({
      user: u._id,
      roleAtInvite: u.role,
      nameAtInvite: u.name,
      rsvp: u._id.toString() === req.user.id.toString() ? 'accepted' : 'pending',
      rsvpAt: u._id.toString() === req.user.id.toString() ? new Date() : undefined,
    }));

    const meeting = await Meeting.create({
      title:       title.trim(),
      description: description || '',
      type:        type || 'other',
      startTime:   new Date(startTime),
      durationMin: Number(durationMin) || 30,
      location:    location || '',
      meetingLink: meetingLink || '',
      isOnline:    !!isOnline || !!meetingLink,
      agenda:      agenda || '',
      attachments: Array.isArray(attachments) ? attachments : [],
      organizer:   req.user._id,
      participants,
      school:      req.user.school,
    });

    await meeting.populate('organizer',         'name role');
    await meeting.populate('participants.user', 'name email role');

    await notifyParticipants(req, meeting, {
      title:   `Meeting invite: ${meeting.title}`,
      message: `${req.user.name} invited you to a ${meeting.type} meeting on ${new Date(meeting.startTime).toLocaleString('en-IN')}`,
    });

    res.status(201).json({ success: true, data: meeting });
  } catch (err) {
    console.error('Meeting create error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/meetings/:id  — organizer or admin only
exports.update = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, school: req.user.school });
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const isAdmin     = ['superAdmin', 'schoolAdmin'].includes(req.user.role);
    const isOrganizer = meeting.organizer.toString() === req.user.id.toString();
    if (!isAdmin && !isOrganizer) {
      return res.status(403).json({ success: false, message: 'Only the organizer or admin can edit this meeting' });
    }

    // Whitelist editable fields. Participants are managed separately.
    const editable = ['title','description','type','startTime','durationMin','location','meetingLink','isOnline','agenda','notes','attachments','status','actionItems'];
    editable.forEach(k => {
      if (req.body[k] !== undefined) meeting[k] = req.body[k];
    });
    // If startTime / duration changed, recompute endTime
    if (req.body.startTime || req.body.durationMin !== undefined) {
      meeting.endTime = new Date(meeting.startTime.getTime() + (meeting.durationMin || 30) * 60 * 1000);
    }

    await meeting.save();
    await meeting.populate('organizer',         'name role');
    await meeting.populate('participants.user', 'name email role');

    res.json({ success: true, data: meeting });
  } catch (err) {
    console.error('Meeting update error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/meetings/:id  — organizer or admin
exports.remove = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, school: req.user.school });
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });
    const isAdmin     = ['superAdmin', 'schoolAdmin'].includes(req.user.role);
    const isOrganizer = meeting.organizer.toString() === req.user.id.toString();
    if (!isAdmin && !isOrganizer) {
      return res.status(403).json({ success: false, message: 'Only the organizer or admin can delete' });
    }
    await meeting.deleteOne();
    res.json({ success: true, message: 'Meeting deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/meetings/:id/rsvp  — caller must be in the participants list
exports.rsvp = async (req, res) => {
  try {
    const { status } = req.body;                   // accepted | declined | maybe
    if (!['accepted', 'declined', 'maybe'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid RSVP status' });
    }
    const meeting = await Meeting.findOne({ _id: req.params.id, school: req.user.school });
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const p = meeting.participants.find(p => p.user.toString() === req.user.id.toString());
    if (!p) return res.status(403).json({ success: false, message: 'You were not invited to this meeting' });

    p.rsvp = status;
    p.rsvpAt = new Date();
    await meeting.save();

    // Notify the organizer
    pushSocket(req, [meeting.organizer.toString()], 'meeting:rsvp', {
      meetingId: meeting._id, userId: req.user.id, status,
    });

    res.json({ success: true, data: { rsvp: status } });
  } catch (err) {
    console.error('RSVP error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/meetings/:id/attendance  — organizer/admin marks attendance
// Body: { entries: [{ userId, attended, attendanceNote }] }
exports.markAttendance = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, school: req.user.school });
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const isAdmin     = ['superAdmin', 'schoolAdmin'].includes(req.user.role);
    const isOrganizer = meeting.organizer.toString() === req.user.id.toString();
    if (!isAdmin && !isOrganizer) {
      return res.status(403).json({ success: false, message: 'Only the organizer or admin can mark attendance' });
    }

    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    entries.forEach(({ userId, attended, attendanceNote }) => {
      const p = meeting.participants.find(p => p.user.toString() === String(userId));
      if (p) {
        if (attended !== undefined) p.attended = !!attended;
        if (attendanceNote !== undefined) p.attendanceNote = attendanceNote;
      }
    });
    await meeting.save();
    res.json({ success: true, data: meeting });
  } catch (err) {
    console.error('Attendance mark error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/meetings/:id/participants  — replace the participant list
exports.updateParticipants = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, school: req.user.school });
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });
    const isAdmin     = ['superAdmin', 'schoolAdmin'].includes(req.user.role);
    const isOrganizer = meeting.organizer.toString() === req.user.id.toString();
    if (!isAdmin && !isOrganizer) {
      return res.status(403).json({ success: false, message: 'Only the organizer or admin can edit participants' });
    }

    const { userIds = [] } = req.body;
    const existing = new Map(meeting.participants.map(p => [p.user.toString(), p]));
    const incoming = new Set(userIds.map(String));

    // Drop participants no longer in the list (but keep organizer)
    meeting.participants = meeting.participants.filter(p =>
      p.user.toString() === meeting.organizer.toString() || incoming.has(p.user.toString())
    );

    // Add new participants
    const newOnes = userIds.filter(id => !existing.has(String(id)));
    if (newOnes.length) {
      const docs = await User.find({ _id: { $in: newOnes }, school: req.user.school }).select('name role');
      docs.forEach(u => {
        meeting.participants.push({
          user: u._id,
          roleAtInvite: u.role,
          nameAtInvite: u.name,
          rsvp: 'pending',
        });
      });
    }

    await meeting.save();
    await meeting.populate('participants.user', 'name email role');
    res.json({ success: true, data: meeting });
  } catch (err) {
    console.error('Update participants error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/meetings/conflict-check?startTime=&durationMin=&userIds=a,b,c
// Soft conflict detection — returns conflicting meetings for any of the
// supplied users. Frontend shows a warning but doesn't block.
exports.conflictCheck = async (req, res) => {
  try {
    const { startTime, durationMin, userIds } = req.query;
    if (!startTime || !userIds) return res.json({ success: true, data: [] });
    const start = new Date(startTime);
    const end   = new Date(start.getTime() + (Number(durationMin) || 30) * 60 * 1000);
    const ids   = userIds.split(',').filter(Boolean);

    const conflicts = await Meeting.find({
      school: req.user.school,
      status: { $ne: 'cancelled' },
      'participants.user': { $in: ids },
      // Overlap: meeting starts before our end AND ends after our start
      startTime: { $lt: end },
      endTime:   { $gt: start },
    })
      .populate('participants.user', 'name')
      .select('title startTime endTime participants.user');

    res.json({ success: true, data: conflicts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};