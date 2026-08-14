/**
 * passportController — FP-055 · GAP-SLP-001..006 · FINAL LLD 1.1 §25
 *
 * REST over PassportEntry. The parent-facing export path is the sensitive one:
 * it MUST use PassportEntry.parentVisibleFilter so a wellbeing entry can never
 * reach a parent. The staff view uses a different, wider query.
 */
const PassportEntry = require('../models/PassportEntry');

/** GET /api/passport/students/:id — STAFF view (all entries). */
exports.staffView = async (req, res) => {
  try {
    const entries = await PassportEntry.find({
      student: req.params.id, school: req.user.school,
    }).sort({ date: -1 }).lean();
    res.json({ success: true, entries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/passport/students/:id/parent-view — PARENT-facing export.
 *
 * Uses the safeguarding filter. A wellbeing entry is excluded by type here even
 * if one were mis-set to parent visibility.
 */
exports.parentView = async (req, res) => {
  try {
    const filter = PassportEntry.parentVisibleFilter(req.params.id, req.user.school);
    const entries = await PassportEntry.find(filter).sort({ date: -1 }).lean();
    res.json({ success: true, entries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** POST /api/passport/entries — staff create. */
exports.createEntry = async (req, res) => {
  try {
    const { student, entryType, title, content, visibility, academicYearId } = req.body;
    if (!student || !entryType || !title || !academicYearId) {
      return res.status(400).json({ success: false, message: 'student, entryType, title and academicYearId are required.' });
    }
    const entry = await PassportEntry.create({
      student, entryType, title, content,
      // A wellbeing entry defaults to internal even if visibility is omitted.
      visibility: visibility || (PassportEntry.SENSITIVE_TYPES.includes(entryType) ? 'internal' : 'parent'),
      createdBy: req.user._id, school: req.user.school, academicYearId,
    });
    res.status(201).json({ success: true, entry });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
