// backend/services/classFeeTemplateService.js
// Helpers for the Class Fee Template system.

const ClassFeeTemplate = require('../models/ClassFeeTemplate');
const FeeAssignment    = require('../models/FeeAssignment');
const FeeType          = require('../models/FeeType');

// ── seedDefaultFeeTypes(schoolId) ─────────────────────────────────────────────
// Ensures the standard fee categories exist for the school. Idempotent — safe
// to call on every server start or before applying templates.
const STANDARD_TYPES = [
  { name: 'School Fee',  category: 'tuition',   isRecurring: true,  frequency: 'monthly'  },
  { name: 'Transport',   category: 'transport', isRecurring: true,  frequency: 'monthly'  },
  { name: 'Stationary',  category: 'other',     isRecurring: false, frequency: 'one-time' },
  { name: 'ID Card',     category: 'other',     isRecurring: false, frequency: 'one-time' },
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

// ── computeDueDate(line) ──────────────────────────────────────────────────────
// Resolves the due-date for a given template line.
// - If line.dueDate is set (one-time fees), use it.
// - Otherwise if line.dueDay is set (monthly), use this month's <dueDay>.
//   If that day already passed, roll forward to next month.
function computeDueDate(line) {
  if (line.dueDate) return new Date(line.dueDate);
  const now = new Date();
  const day = Math.min(Math.max(line.dueDay || 5, 1), 28); // clamp to 1–28 to dodge Feb edge cases
  const candidate = new Date(now.getFullYear(), now.getMonth(), day);
  if (candidate < now) candidate.setMonth(candidate.getMonth() + 1);
  return candidate;
}

// ── applyTemplateToStudent({ studentId, classId, schoolId, overrides, createdBy }) ──
// Looks up the template for the student's class and creates one FeeAssignment
// per template line. Skips lines that already exist for the student to avoid
// duplicates if called twice.
//
// `overrides` (optional) is a map: { [feeTypeId]: { amount, dueDate, skip } }
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

    const amount   = (ov.amount  != null) ? Number(ov.amount)  : Number(line.amount);
    const dueDate  = ov.dueDate ? new Date(ov.dueDate) : computeDueDate(line);

    // Don't double-create the same line for the same student (same feeType + dueDate)
    const dup = await FeeAssignment.findOne({
      student: studentId,
      feeType: line.feeType,
      dueDate: dueDate,
      school:  schoolId,
    });
    if (dup) { skipped.push(`Already exists: feeType ${line.feeType}`); continue; }

    const assignment = await FeeAssignment.create({
      student:       studentId,
      class:         classId,
      feeType:       line.feeType,
      baseAmount:    amount,
      finalAmount:   amount,                       // no discount at apply time; admin can edit later
      dueDate,
      lateFeePerDay: line.lateFeePerDay || 0,
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
  computeDueDate,
  applyTemplateToStudent,
};