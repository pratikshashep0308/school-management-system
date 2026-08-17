/**
 * subjectModulesController — FP-056 · GAP-SUB-001..004 · FINAL LLD 1.1 §25
 *
 * REST over the five subject-module collections. When a milestone is reached,
 * a PassportEntry is written — the ONE place that wiring lives. The controller
 * does not duplicate the milestone rule per collection.
 */
const subjects = require('../models/subjectModels');
const PassportEntry = require('../models/PassportEntry');

/** Write a passport milestone, idempotent on the source reference. */
async function writeMilestone({ studentId, schoolId, academicYearId, entryType, title, sourceRef }) {
  const existing = await PassportEntry.findOne({
    student: studentId,
    'sourceRef.collectionName': sourceRef.collectionName,
    'sourceRef.id': sourceRef.id,
  }).lean();
  if (existing) return existing;
  return PassportEntry.create({
    student: studentId, entryType, title,
    visibility: 'parent', system: true, sourceRef,
    school: schoolId, academicYearId,
  });
}

exports.recordReadingLevel = async (req, res) => {
  try {
    const { student, level, academicYearId } = req.body;
    if (!student || !level || !academicYearId) {
      return res.status(400).json({ success: false, message: 'student, level and academicYearId are required.' });
    }
    const record = await subjects.ReadingLevel.create({
      student, level, assessedBy: req.user._id, school: req.user.school, academicYearId,
    });
    // Reading-level advancement is a milestone.
    await writeMilestone({
      studentId: student, schoolId: req.user.school, academicYearId,
      entryType: 'reading-milestone', title: `Reading level: ${level}`,
      sourceRef: { collectionName: 'ReadingLevel', id: record._id },
    });
    res.status(201).json({ success: true, record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.recordMisconception = async (req, res) => {
  try {
    const { student, concept, incorrectCount, academicYearId } = req.body;
    if (!student || !concept || incorrectCount == null || !academicYearId) {
      return res.status(400).json({ success: false, message: 'student, concept, incorrectCount and academicYearId are required.' });
    }
    const record = await subjects.NumeracyMisconception.create({
      student, concept, incorrectCount: Number(incorrectCount), school: req.user.school, academicYearId,
    });
    res.status(201).json({ success: true, record, flagged: record.flagged });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.recordScienceInvestigation = async (req, res) => {
  try {
    const { student, title, hypothesis, safetyChecklist, conclusion } = req.body;
    if (!student || !title) {
      return res.status(400).json({ success: false, message: 'student and title are required.' });
    }
    const record = await subjects.ScienceInvestigation.create({
      student, title, hypothesis, safetyChecklist: safetyChecklist || [], conclusion,
      school: req.user.school,
    });
    res.status(201).json({ success: true, record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// exported for tests
exports._writeMilestone = writeMilestone;
