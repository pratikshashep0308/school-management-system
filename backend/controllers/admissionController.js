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

  // Date range filter (createdAt)
  if (req.query.dateFrom || req.query.dateTo) {
    filter.createdAt = {};
    if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo)   filter.createdAt.$lte = new Date(req.query.dateTo + 'T23:59:59');
  }

  // Sort: ?sort=date_asc | date_desc (default) | name_asc | name_desc
  let sort = { createdAt: -1 };
  switch (req.query.sort) {
    case 'date_asc':  sort = { createdAt:  1 }; break;
    case 'date_desc': sort = { createdAt: -1 }; break;
    case 'name_asc':  sort = { studentName:  1 }; break;
    case 'name_desc': sort = { studentName: -1 }; break;
  }

  const [admissions, total] = await Promise.all([
    Admission.find(filter)
      .populate('processedBy', 'name')
      .populate('interview.conductedBy', 'name')
      .sort(sort)
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

  // Resolve class IDs to names
  const ClassModel = mongoose.model('Class');
  const allClasses = await ClassModel.find({ school: req.user.school }).select('name section').lean().catch(()=>[]);
  const classNameMap = {};
  allClasses.forEach(c => { classNameMap[c._id.toString()] = `${c.name}${c.section?' '+c.section:''}`.trim(); });

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
      byClass: classStats.map(c => ({ class: classNameMap[c._id] || c._id || '—', count: c.count })),
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
//
// ── Shared validation helpers (used by createAdmission and publicSubmit) ──
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

function validateAdmissionPayload(body) {
  const errs = [];
  const studentName = (body.studentName || body.name || '').trim();
  if (!studentName) errs.push('Student Name is required');

  // Email format (only if provided — fields are otherwise optional)
  for (const field of ['parentEmail', 'fatherEmail', 'motherEmail', 'studentEmail']) {
    const val = (body[field] || '').trim();
    if (val && !EMAIL_RE.test(val)) errs.push(`Invalid email format in ${field}`);
  }

  // Phone format (digits, spaces, +, -, parens; 7-20 chars)
  for (const field of ['parentPhone', 'fatherPhone', 'motherPhone', 'phone']) {
    const val = (body[field] || '').trim();
    if (val && !PHONE_RE.test(val)) errs.push(`Invalid phone format in ${field}`);
  }

  // Date of birth — must not be in the future
  const dob = body.dateOfBirth || body.dob;
  if (dob) {
    const dobDate = new Date(dob);
    if (isNaN(dobDate.getTime())) {
      errs.push('Invalid date of birth');
    } else if (dobDate > new Date()) {
      errs.push('Date of birth cannot be in the future');
    }
  }
  return errs;
}

async function isDuplicateAdmission(body, schoolId) {
  // Match on parent phone OR parent email, scoped to same school + active (non-rejected) status
  const Admission = require('../models/Admission');
  const phone = (body.parentPhone || body.phone || '').trim();
  const email = (body.parentEmail || body.email || '').trim().toLowerCase();
  if (!phone && !email) return null;
  const or = [];
  if (phone) or.push({ parentPhone: phone });
  if (email) or.push({ parentEmail: email });
  return Admission.findOne({
    school: schoolId,
    status: { $nin: ['rejected', 'enrolled'] }, // rejected/enrolled = won't conflict
    $or: or,
  });
}

exports.createAdmission = async (req, res) => {
  // Validate inputs
  const errs = validateAdmissionPayload(req.body);
  if (errs.length) {
    return res.status(400).json({ success: false, message: errs.join('. ') });
  }
  // Duplicate check
  const dupe = await isDuplicateAdmission(req.body, req.user.school);
  if (dupe) {
    return res.status(409).json({
      success: false,
      message: `An active admission already exists for this contact (${dupe.studentName || dupe.applicationNumber}). Please check existing applications first.`,
      duplicateOf: dupe._id,
    });
  }

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
  try {
    const { name, studentName, grade, parentName, phone, email, dob } = req.body;
    const finalName = studentName || name;
    if (!finalName) {
      return res.status(400).json({ success: false, message: 'Student name is required' });
    }
    // Validate the rest of the payload
    const validationBody = { ...req.body, studentName: finalName, dateOfBirth: dob || req.body.dateOfBirth };
    const errs = validateAdmissionPayload(validationBody);
    if (errs.length) {
      return res.status(400).json({ success: false, message: errs.join('. ') });
    }
    const School = require('../models/School');
    const school = await School.findOne();
    // Duplicate check (against this school's active admissions)
    if (school?._id) {
      const dupe = await isDuplicateAdmission({ ...req.body, parentPhone: phone, parentEmail: email }, school._id);
      if (dupe) {
        return res.status(409).json({
          success: false,
          message: 'An admission with this contact already exists. Please contact the school office.',
        });
      }
    }
    const admission = await Admission.create({
      ...req.body,
      studentName:      finalName,
      applyingForClass: grade || req.body.applyingForClass || '',
      parentName:       parentName || '',
      parentPhone:      phone || req.body.parentPhone || '',
      parentEmail:      email || req.body.parentEmail || '',
      dateOfBirth:      dob  || req.body.dateOfBirth  || '',
      school:  school?._id,
      status:  'pending',
      source:  'online',
      timeline: [{ action: 'Application submitted online', byName: parentName || finalName, at: new Date() }]
    });
    res.status(201).json({ success: true, data: { applicationNumber: admission.applicationNumber } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
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
  // ── TC-ADM-06 — When reopening a rejected admission, clear stale rejection reason
  if (status === 'pending') {
    update.rejectionReason = '';
  }

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

    // ── Normalize enum fields to match Student model enums ────────────────────
    // Student.category enum: ['General','OBC','SC','ST','Other'] (Title Case)
    // Student.gender   enum: ['male','female','other']           (lowercase)
    const normalizeCategory = (val) => {
      if (!val) return undefined; // skip field entirely if blank — avoid enum failure
      const map = {
        general: 'General', obc: 'OBC', sc: 'SC', st: 'ST',
        other: 'Other', others: 'Other',
      };
      const key = String(val).trim().toLowerCase();
      return map[key] || 'Other'; // fallback to Other if unrecognized
    };
    const normalizeGender = (val) => {
      if (!val) return 'other';
      const v = String(val).trim().toLowerCase();
      return ['male','female','other'].includes(v) ? v : 'other';
    };

    const studentDoc = {
      user:            studentUser._id,
      admissionNumber: admNo,
      rollNumber:      rollNumber || '',
      class:           classId,
      gender:          normalizeGender(admission.gender),
      dateOfBirth:     admission.dateOfBirth || null,
      bloodGroup:      admission.bloodGroup || '',
      parentName:      admission.parentName || '',
      parentEmail:     admission.parentEmail || '',
      parentPhone:     admission.parentPhone || '',
      religion:        admission.religion || '',
      isActive:        true,
      status:          'active',
      school:          req.user.school,
    };
    // Only set category if we have a valid value — empty string would fail enum
    const cat = normalizeCategory(admission.category);
    if (cat) studentDoc.category = cat;

    // Create Student document
    const student = await Student.create(studentDoc);

    // Update admission status
    await Admission.findByIdAndUpdate(admission._id, {
      status: 'enrolled',
      $push: { timeline: { action:'enrolled', note:'Enrolled as student', byName: req.user.name, by: req.user.id, at: new Date() }}
    });

    // Auto-apply class fee template (if any) — non-blocking on errors
    try {
      const { applyTemplateToStudent } = require('../services/classFeeTemplateService');
      await applyTemplateToStudent({
        studentId: student._id,
        classId,
        schoolId:  req.user.school,
        createdBy: req.user._id,
      });
    } catch (e) {
      console.error('Class fee template auto-apply failed:', e.message);
    }

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