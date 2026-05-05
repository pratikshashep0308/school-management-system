// backend/services/classFeeTemplateService.js
// Helpers for the Class Fee Template system.
// Templates store ANNUAL (12-month) amounts. Half-year = annual / 2.
// Due dates are NOT used — fees are payable on collection.

const ClassFeeTemplate = require('../models/ClassFeeTemplate');
const FeeAssignment    = require('../models/FeeAssignment');
const FeeType          = require('../models/FeeType');

// ── seedDefaultFeeTypes(schoolId) ─────────────────────────────────────────────
// Ensures the standard fee categories exist for the school. Idempotent — safe
// to call on every server start or before applying templates.
// Mirrors the fee types available in Collect Fees so admin can use the same
// labels in Class Defaults.
const STANDARD_TYPES = [
  { name: 'Tuition Fee',      category: 'tuition',   isRecurring: false, frequency: 'one-time' },
  { name: 'Admission Fee',    category: 'other',     isRecurring: false, frequency: 'one-time' },
  { name: 'Registration Fee', category: 'other',     isRecurring: false, frequency: 'one-time' },
  { name: 'Exam Fee',         category: 'exam',      isRecurring: false, frequency: 'one-time' },
  { name: 'Transport Fee',    category: 'transport', isRecurring: false, frequency: 'one-time' },
  { name: 'Library Fee',      category: 'library',   isRecurring: false, frequency: 'one-time' },
  { name: 'Sports Fee',       category: 'sports',    isRecurring: false, frequency: 'one-time' },
  { name: 'Uniform',          category: 'uniform',   isRecurring: false, frequency: 'one-time' },
  { name: 'Books',            category: 'other',     isRecurring: false, frequency: 'one-time' },
  { name: 'Art Material',     category: 'other',     isRecurring: false, frequency: 'one-time' },
  { name: 'Stationary',       category: 'other',     isRecurring: false, frequency: 'one-time' },
  { name: 'ID Card',          category: 'other',     isRecurring: false, frequency: 'one-time' },
  { name: 'School Fee',       category: 'tuition',   isRecurring: false, frequency: 'one-time' },
];

async function seedDefaultFeeTypes(schoolId, createdBy) {
  if (!schoolId) return [];
  const out = [];
  for (const t of STANDARD_TYPES) {
    const existing = await FeeType.findOne({ school: schoolId, name: t.name });
    if (existing) { out.push(existing); continue; }
    const created = await FeeType.create({ ...t, school: schoolId, createdBy, isActive: true });
    out.push(created);
  }
  return out;
}

// ── applyTemplateToStudent({ studentId, classId, schoolId, overrides, createdBy }) ──
// Looks up the template for the student's class and creates one FeeAssignment
// per template line, using the ANNUAL amount as the base.
// Skips lines that already exist for the student to avoid duplicates.
//
// `overrides` (optional) is a map: { [feeTypeId]: { annualAmount, skip } }
// — used by the admin UI to tweak amounts before applying (scholarship etc.)
//
// Returns { applied: [<assignment>...], skipped: [<reason>...] }
async function applyTemplateToStudent({
  studentId,
  classId,
  schoolId,
  overrides = {},
  createdBy = null,
}) {
  if (!studentId || !classId || !schoolId) {
    return { applied: [], skipped: ['Missing studentId/classId/schoolId'] };
  }

  const tpl = await ClassFeeTemplate.findOne({
    class: classId, school: schoolId, isActive: true,
  });
  if (!tpl || !tpl.lines.length) {
    return { applied: [], skipped: ['No active template for this class'] };
  }

  const applied = [];
  const skipped = [];

  for (const line of tpl.lines) {
    const ov = overrides[line.feeType.toString()] || {};
    if (ov.skip) { skipped.push(`Skipped (admin): feeType ${line.feeType}`); continue; }

    // Allow override of annualAmount per student (scholarships, etc.)
    const annualAmount = (ov.annualAmount != null)
      ? Number(ov.annualAmount)
      : Number(line.annualAmount);

    // Skip duplicate: same student + same feeType already has an active (unpaid) assignment
    const dup = await FeeAssignment.findOne({
      student: studentId,
      feeType: line.feeType,
      school:  schoolId,
      status:  { $ne: 'paid' },
    });
    if (dup) { skipped.push(`Already exists: feeType ${line.feeType}`); continue; }

    const assignment = await FeeAssignment.create({
      student:       studentId,
      class:         classId,
      feeType:       line.feeType,
      baseAmount:    annualAmount,
      finalAmount:   annualAmount,
      school:        schoolId,
      createdBy,
      status:        'pending',
    });
    applied.push(assignment);
  }

  return { applied, skipped };
}

module.exports = {
  STANDARD_TYPES,
  seedDefaultFeeTypes,
  applyTemplateToStudent,
};