// backend/controllers/classFeeTemplateController.js
// CRUD for class fee templates + manual "apply to existing students" endpoint.

const ClassFeeTemplate = require('../models/ClassFeeTemplate');
const Student          = require('../models/Student');
const {
  seedDefaultFeeTypes,
  applyTemplateToStudent,
} = require('../services/classFeeTemplateService');

// ── GET /api/class-fee-templates ─────────────────────────────────────────────
// Returns all templates for this school (one per class).
exports.listTemplates = async (req, res) => {
  // Make sure standard fee types exist before the UI loads them
  await seedDefaultFeeTypes(req.user.school, req.user._id);

  const templates = await ClassFeeTemplate.find({ school: req.user.school })
    .populate('class', 'name section grade')
    .populate('lines.feeType', 'name category isRecurring frequency');
  res.json({ success: true, data: templates });
};

// ── GET /api/class-fee-templates/:classId ────────────────────────────────────
// Returns the template for one class (or null if none).
exports.getTemplateByClass = async (req, res) => {
  await seedDefaultFeeTypes(req.user.school, req.user._id);

  const tpl = await ClassFeeTemplate.findOne({
    class: req.params.classId, school: req.user.school,
  })
    .populate('class', 'name section grade')
    .populate('lines.feeType', 'name category isRecurring frequency');

  res.json({ success: true, data: tpl });
};

// ── POST /api/class-fee-templates ────────────────────────────────────────────
// Create OR replace the template for a class (upsert).
// body: { classId, lines: [{ feeType, amount, dueDay?, dueDate?, lateFeePerDay?, notes? }] }
exports.upsertTemplate = async (req, res) => {
  const { classId, lines = [], isActive = true } = req.body;
  if (!classId)        return res.status(400).json({ success: false, message: 'classId is required' });
  if (!Array.isArray(lines)) return res.status(400).json({ success: false, message: 'lines must be an array' });

  // Basic per-line validation
  for (const l of lines) {
    if (!l.feeType)              return res.status(400).json({ success: false, message: 'Every line needs a feeType' });
    if (l.amount == null || Number(l.amount) < 0)
                                 return res.status(400).json({ success: false, message: 'Every line needs a non-negative amount' });
  }

  const tpl = await ClassFeeTemplate.findOneAndUpdate(
    { class: classId, school: req.user.school },
    {
      class:    classId,
      school:   req.user.school,
      isActive,
      lines:    lines.map(l => ({
        feeType:        l.feeType,
        amount:         Number(l.amount),
        dueDay:         l.dueDay  != null ? Number(l.dueDay) : 5,
        dueDate:        l.dueDate || null,
        lateFeePerDay:  Number(l.lateFeePerDay || 0),
        notes:          l.notes || '',
      })),
      updatedBy: req.user._id,
      $setOnInsert: { createdBy: req.user._id },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .populate('class', 'name section grade')
    .populate('lines.feeType', 'name category isRecurring frequency');

  res.json({ success: true, data: tpl });
};

// ── DELETE /api/class-fee-templates/:classId ─────────────────────────────────
exports.deleteTemplate = async (req, res) => {
  await ClassFeeTemplate.findOneAndDelete({
    class: req.params.classId, school: req.user.school,
  });
  res.json({ success: true });
};

// ── POST /api/class-fee-templates/:classId/apply ─────────────────────────────
// Manually apply the class template to one or all students in that class.
// body: { studentIds?: [...], overrides?: { [feeTypeId]: { amount?, dueDate?, skip? } } }
// If studentIds is omitted, applies to every active student in the class.
exports.applyToStudents = async (req, res) => {
  const { studentIds, overrides = {} } = req.body;
  const { classId } = req.params;

  let students;
  if (Array.isArray(studentIds) && studentIds.length) {
    students = await Student.find({
      _id: { $in: studentIds }, school: req.user.school, isActive: true,
    });
  } else {
    students = await Student.find({
      class: classId, school: req.user.school, isActive: true,
    });
  }

  const results = [];
  for (const s of students) {
    const r = await applyTemplateToStudent({
      studentId: s._id,
      classId,
      schoolId:  req.user.school,
      overrides,
      createdBy: req.user._id,
    });
    results.push({ studentId: s._id, applied: r.applied.length, skipped: r.skipped.length });
  }

  const totalApplied = results.reduce((s, r) => s + r.applied, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);

  res.json({
    success: true,
    summary: { studentsProcessed: results.length, totalApplied, totalSkipped },
    results,
  });
};