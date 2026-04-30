const mongoose = require('mongoose');
const Admission = require('../models/Admission');
const Student   = require('../models/Student');
const User      = require('../models/User');
const bcrypt    = require('bcryptjs');

// ─────────────────────────────────────────────
// GET /api/admissions
// ─────────────────────────────────────────────
exports.getAdmissions = async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.status)           filter.status = req.query.status;
  if (req.query.applyingForClass) filter.applyingForClass = req.query.applyingForClass;
  if (req.query.priority)         filter.priority = req.query.priority;
  if (req.query.source)           filter.source = req.query.source;
  if (req.query.academicYear)     filter.academicYear = req.query.academicYear;

  // Text search
  if (req.query.search) {
    const q = req.query.search;
    filter.$or = [
      { studentName:       { $regex: q, $options: 'i' } },
      { applicationNumber: { $regex: q, $options: 'i' } },
      { parentName:        { $regex: q, $options: 'i' } },
      { parentEmail:       { $regex: q, $options: 'i' } },
      { parentPhone:       { $regex: q, $options: 'i' } }
    ];
  }

  const page  = Number(req.query.page)  || 1;
  const limit = Number(req.query.limit) || 50;

  const [admissions, total] = await Promise.all([
    Admission.find(filter)
      .populate('processedBy', 'name')
      .populate('interview.conductedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Admission.countDocuments(filter)
  ]);

  res.json({ success: true, count: admissions.length, total, page, pages: Math.ceil(total / limit), data: admissions });
};

// ─────────────────────────────────────────────
// GET /api/admissions/stats
// ─────────────────────────────────────────────
exports.getStats = async (req, res) => {
  const school = new mongoose.Types.ObjectId(req.user.school);

  const [statusStats, classStats, sourceStats, monthlyStats] = await Promise.all([
    // By status
    Admission.aggregate([
      { $match: { school } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),

    // By class
    Admission.aggregate([
      { $match: { school } },
      { $group: { _id: '$applyingForClass', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),

    // By source
    Admission.aggregate([
      { $match: { school } },
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ]),

    // Monthly trend (last 6 months)
    Admission.aggregate([
      { $match: { school, createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } },
      { $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ])
  ]);

  const statusResult = {
    total: 0, pending: 0, under_review: 0, interview_scheduled: 0,
    approved: 0, rejected: 0, enrolled: 0, waitlisted: 0
  };
  statusStats.forEach(s => {
    statusResult[s._id] = s.count;
    statusResult.total += s.count;
  });

  // Conversion rate
  statusResult.conversionRate = statusResult.total > 0
    ? ((statusResult.enrolled / statusResult.total) * 100).toFixed(1)
    : 0;

  res.json({
    success: true,
    data: {
      status:  statusResult,
      byClass: classStats.map(c => ({ class: c._id, count: c.count })),
      bySource: sourceStats.map(s => ({ source: s._id || 'unknown', count: s.count })),
      monthly: monthlyStats.map(m => ({
        label: new Date(m._id.year, m._id.month - 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
        count: m.count
      }))
    }
  });
};

// ─────────────────────────────────────────────
// GET /api/admissions/:id
// ─────────────────────────────────────────────
exports.getAdmission = async (req, res) => {
  const admission = await Admission.findById(req.params.id)
    .populate('processedBy', 'name email')
    .populate('interview.conductedBy', 'name')
    .populate('timeline.by', 'name');
  if (!admission) return res.status(404).json({ success: false, message: 'Application not found' });
  res.json({ success: true, data: admission });
};

// ─────────────────────────────────────────────
// POST /api/admissions  (admin)
// ─────────────────────────────────────────────
exports.createAdmission = async (req, res) => {
  const admission = await Admission.create({
    ...req.body,
    school: req.user.school,
    timeline: [{ action: 'Application created', byName: req.user.name, by: req.user.id, at: new Date() }]
  });
  res.status(201).json({ success: true, data: admission });
};

// ─────────────────────────────────────────────
// POST /api/admissions/public  (no auth)
// ─────────────────────────────────────────────
exports.publicSubmit = async (req, res) => {
  const { studentName } = req.body;
  if (!studentName) {
    return res.status(400).json({ success: false, message: 'Required fields missing' });
  }
  const School = require('../models/School');
  const school = await School.findOne();
  const admission = await Admission.create({
    ...req.body,
    school: school?._id,
    status: 'pending',
    source: 'online',
    timeline: [{ action: 'Application submitted online', byName: parentName, at: new Date() }]
  });
  res.status(201).json({ success: true, data: { applicationNumber: admission.applicationNumber } });
};

// ─────────────────────────────────────────────
// PUT /api/admissions/:id
// ─────────────────────────────────────────────
exports.updateAdmission = async (req, res) => {
  const admission = await Admission.findById(req.params.id);
  if (!admission) return res.status(404).json({ success: false, message: 'Application not found' });

  // Append to timeline
  const timelineEntry = { action: 'Application details updated', byName: req.user.name, by: req.user.id, at: new Date() };
  if (req.body.notes) timelineEntry.note = req.body.notes;

  const updated = await Admission.findByIdAndUpdate(
    req.params.id,
    { ...req.body, $push: { timeline: timelineEntry } },
    { new: true, runValidators: true }
  );
  res.json({ success: true, data: updated });
};

// ─────────────────────────────────────────────
// PUT /api/admissions/:id/status
// ─────────────────────────────────────────────
exports.updateStatus = async (req, res) => {
  const { status, notes, rejectionReason } = req.body;
  const validStatuses = ['pending','under_review','interview_scheduled','approved','rejected','enrolled','waitlisted'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  const timelineEntry = {
    action:  `Status changed to ${status.replace('_', ' ')}`,
    note:    notes || rejectionReason || '',
    byName:  req.user.name,
    by:      req.user.id,
    at:      new Date()
  };

  const update = {
    status,
    notes,
    processedBy: req.user.id,
    processedAt: new Date(),
    $push: { timeline: timelineEntry }
  };
  if (rejectionReason) update.rejectionReason = rejectionReason;

  const admission = await Admission.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!admission) return res.status(404).json({ success: false, message: 'Application not found' });
  res.json({ success: true, data: admission });
};

// ─────────────────────────────────────────────
// PUT /api/admissions/:id/interview
// Schedule or update interview
// ─────────────────────────────────────────────
exports.updateInterview = async (req, res) => {
  const { date, time, mode, venue, score, remarks, completed } = req.body;

  const interviewUpdate = {};
  if (date)      interviewUpdate['interview.date']      = new Date(date);
  if (time)      interviewUpdate['interview.time']      = time;
  if (mode)      interviewUpdate['interview.mode']      = mode;
  if (venue)     interviewUpdate['interview.venue']     = venue;
  if (score !== undefined) interviewUpdate['interview.score']  = score;
  if (remarks)   interviewUpdate['interview.remarks']   = remarks;
  if (completed !== undefined) interviewUpdate['interview.completed'] = completed;
  interviewUpdate['interview.scheduled'] = true;
  interviewUpdate['interview.conductedBy'] = req.user.id;

  const action = completed ? 'Interview completed' : 'Interview scheduled';
  const timelineEntry = { action, note: remarks || '', byName: req.user.name, by: req.user.id, at: new Date() };

  // Auto-update status when interview scheduled
  if (!completed) interviewUpdate.status = 'interview_scheduled';

  const admission = await Admission.findByIdAndUpdate(
    req.params.id,
    { $set: interviewUpdate, $push: { timeline: timelineEntry } },
    { new: true }
  );
  if (!admission) return res.status(404).json({ success: false, message: 'Application not found' });
  res.json({ success: true, data: admission });
};

// ─────────────────────────────────────────────
// PUT /api/admissions/:id/documents
// Update document checklist
// ─────────────────────────────────────────────
exports.updateDocuments = async (req, res) => {
  const docUpdate = {};
  Object.keys(req.body).forEach(key => {
    docUpdate[`documents.${key}`] = req.body[key];
  });

  const timelineEntry = {
    action:  'Document checklist updated',
    byName:  req.user.name,
    by:      req.user.id,
    at:      new Date()
  };

  const admission = await Admission.findByIdAndUpdate(
    req.params.id,
    { $set: docUpdate, $push: { timeline: timelineEntry } },
    { new: true }
  );
  if (!admission) return res.status(404).json({ success: false, message: 'Application not found' });
  res.json({ success: true, data: admission });
};

// ─────────────────────────────────────────────
// PUT /api/admissions/:id/note
// Add internal note
// ─────────────────────────────────────────────
exports.addNote = async (req, res) => {
  const { note, isInternal } = req.body;
  if (!note) return res.status(400).json({ success: false, message: 'Note is required' });

  const timelineEntry = {
    action:  isInternal ? '📌 Internal note added' : '💬 Note added',
    note,
    byName:  req.user.name,
    by:      req.user.id,
    at:      new Date()
  };

  const update = { $push: { timeline: timelineEntry } };
  if (isInternal) update.$set = { internalNotes: note };
  else             update.$set = { notes: note };

  const admission = await Admission.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!admission) return res.status(404).json({ success: false, message: 'Application not found' });
  res.json({ success: true, data: admission });
};

// ─────────────────────────────────────────────
// DELETE /api/admissions/:id
// ─────────────────────────────────────────────
exports.deleteAdmission = async (req, res) => {
  await Admission.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Application deleted' });
};

// ─────────────────────────────────────────────
// POST /api/admissions/:id/enroll
// Creates a Student + User account from admission data
// ─────────────────────────────────────────────
exports.enrollFromAdmission = async (req, res) => {
  try {
    const { classId, rollNumber } = req.body;
    if (!classId) return res.status(400).json({ success:false, message:'Class is required' });

    const admission = await Admission.findOne({ _id: req.params.id, school: req.user.school });
    if (!admission) return res.status(404).json({ success:false, message:'Admission not found' });
    if (admission.status === 'enrolled') return res.status(400).json({ success:false, message:'Already enrolled' });

    // Generate unique student email
    const cleanName = (admission.studentName||'student').toLowerCase().replace(/[^a-z0-9]/g,'');
    const studentEmail = cleanName + '.' + Date.now() + '@student.local';

    // Check email not taken
    const existing = await User.findOne({ email: studentEmail });
    if (existing) return res.status(400).json({ success:false, message:'Email conflict, try again' });

    // Create User account
    const hashed = await bcrypt.hash('Student@123', 10);
    const studentUser = await User.create({
      name:     admission.studentName,
      email:    studentEmail,
      phone:    admission.parentPhone || '',
      password: hashed,
      role:     'student',
      school:   req.user.school,
      isActive: true,
    });

    // Generate admission number
    const admNo = admission.applicationNumber + '-' + Date.now().toString().slice(-4);

    // Create Student document
    const student = await Student.create({
      user:            studentUser._id,
      admissionNumber: admNo,
      rollNumber:      rollNumber || '',
      class:           classId,
      gender:          admission.gender || 'other',
      dateOfBirth:     admission.dateOfBirth || null,
      bloodGroup:      admission.bloodGroup || '',
      parentName:      admission.parentName || '',
      parentEmail:     admission.parentEmail || '',
      parentPhone:     admission.parentPhone || '',
      religion:        admission.religion || '',
      category:        admission.category || '',
      isActive:        true,
      status:          'active',
      school:          req.user.school,
    });

    // Update admission status
    await Admission.findByIdAndUpdate(admission._id, {
      status: 'enrolled',
      $push: { timeline: { action:'enrolled', note:'Enrolled as student', byName: req.user.name, by: req.user.id, at: new Date() }}
    });

    await student.populate([
      { path:'user',  select:'name email' },
      { path:'class', select:'name section' },
    ]);

    res.json({
      success: true,
      message: admission.studentName + ' enrolled successfully',
      data: student,
      loginEmail:    studentEmail,
      loginPassword: 'Student@123',
    });
  } catch (err) {
    console.error('Enroll error:', err);
    res.status(500).json({ success:false, message: err.message || 'Enrollment failed' });
  }
};