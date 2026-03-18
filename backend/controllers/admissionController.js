const Admission = require('../models/Admission');

// @desc  Get all admissions
// @route GET /api/admissions
exports.getAdmissions = async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.applyingForClass) filter.applyingForClass = req.query.applyingForClass;

  const admissions = await Admission.find(filter)
    .populate('processedBy', 'name')
    .sort({ createdAt: -1 });

  res.json({ success: true, count: admissions.length, data: admissions });
};

// @desc  Create admission (admin/staff)
// @route POST /api/admissions
exports.createAdmission = async (req, res) => {
  const admission = await Admission.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: admission });
};

// @desc  Public admission submit (no auth)
// @route POST /api/admissions/public
exports.publicSubmit = async (req, res) => {
  const { studentName, parentName, parentEmail, parentPhone, applyingForClass } = req.body;
  if (!studentName || !parentName || !parentEmail || !parentPhone || !applyingForClass) {
    return res.status(400).json({ success: false, message: 'Required fields missing' });
  }
  // Get first school (or a default school)
  const School = require('../models/School');
  const school = await School.findOne();
  const admission = await Admission.create({
    ...req.body,
    school: school?._id,
    status: 'pending',
  });
  res.status(201).json({ success: true, data: { applicationNumber: admission.applicationNumber } });
};

// @desc  Get single admission
// @route GET /api/admissions/:id
exports.getAdmission = async (req, res) => {
  const admission = await Admission.findById(req.params.id).populate('processedBy', 'name');
  if (!admission) return res.status(404).json({ success: false, message: 'Application not found' });
  res.json({ success: true, data: admission });
};

// @desc  Update admission
// @route PUT /api/admissions/:id
exports.updateAdmission = async (req, res) => {
  const admission = await Admission.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!admission) return res.status(404).json({ success: false, message: 'Application not found' });
  res.json({ success: true, data: admission });
};

// @desc  Update admission status only
// @route PUT /api/admissions/:id/status
exports.updateStatus = async (req, res) => {
  const { status, notes } = req.body;
  const validStatuses = ['pending', 'under_review', 'approved', 'rejected', 'enrolled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }
  const admission = await Admission.findByIdAndUpdate(
    req.params.id,
    { status, notes, processedBy: req.user.id, processedAt: new Date() },
    { new: true }
  );
  if (!admission) return res.status(404).json({ success: false, message: 'Application not found' });
  res.json({ success: true, data: admission });
};

// @desc  Delete admission
// @route DELETE /api/admissions/:id
exports.deleteAdmission = async (req, res) => {
  await Admission.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Application deleted' });
};

// @desc  Get admission statistics
// @route GET /api/admissions/stats
exports.getStats = async (req, res) => {
  const stats = await Admission.aggregate([
    { $match: { school: req.user.school } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  const result = { total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0, enrolled: 0 };
  stats.forEach(s => { result[s._id] = s.count; result.total += s.count; });
  res.json({ success: true, data: result });
};
