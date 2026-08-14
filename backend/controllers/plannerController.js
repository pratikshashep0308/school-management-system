/**
 * plannerController — FP-054 · GAP-MTP-001..005 · FINAL LLD 1.1 §26
 *
 * REST over LessonPlan. Every plan date is validated through
 * timetableTermValidation (FP-051), so a plan cannot be scheduled on a
 * non-instructional day or outside its academic year. The controller does not
 * re-derive calendar logic.
 */
const LessonPlan = require('../models/LessonPlan');
const termValidation = require('../services/timetableTermValidation');

exports.listPlans = async (req, res) => {
  try {
    const filter = { school: req.user.school, teacher: req.user._id };
    if (req.query.classId) filter.class = req.query.classId;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }
    const plans = await LessonPlan.find(filter).sort({ date: -1 }).limit(200).lean();
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createPlan = async (req, res) => {
  try {
    const { class: classId, subject, date, academicYearId, objectives, activities, competencies, timetableRef, periodIndex } = req.body;
    if (!classId || !subject || !date || !academicYearId) {
      return res.status(400).json({ success: false, message: 'class, subject, date and academicYearId are required.' });
    }

    // FP-051 — reject a non-instructional or out-of-year date.
    const dateCheck = await termValidation.validatePlanDate({ date, academicYearId, schoolId: req.user.school });
    if (!dateCheck.valid) {
      return res.status(422).json({ success: false, code: dateCheck.code, message: dateCheck.message });
    }

    const plan = await LessonPlan.create({
      teacher: req.user._id, class: classId, subject, date, academicYearId,
      objectives, activities, competencies: competencies || [],
      timetableRef: timetableRef || null, periodIndex: periodIndex ?? null,
      status: 'draft', school: req.user.school,
    });
    res.status(201).json({ success: true, plan });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const plan = await LessonPlan.findOne({ _id: req.params.id, school: req.user.school, teacher: req.user._id });
    if (!plan) return res.status(404).json({ success: false, message: 'Lesson plan not found.' });

    // Optimistic concurrency for the offline queue (§33): if the client's base
    // differs from the current updatedAt, the plan changed underneath them.
    if (req.body.baseUpdatedAt && plan.updatedAt &&
        new Date(req.body.baseUpdatedAt).getTime() !== new Date(plan.updatedAt).getTime()) {
      return res.status(409).json({
        success: false, code: 'PLAN_CONFLICT',
        message: 'This plan was changed since you loaded it. Reload and reapply your edits.',
        current: plan,
      });
    }

    ['objectives', 'activities', 'reflection', 'coverageStatus', 'status'].forEach((f) => {
      if (req.body[f] !== undefined) plan[f] = req.body[f];
    });
    if (Array.isArray(req.body.competencies)) plan.competencies = req.body.competencies;
    await plan.save(); // pre-save stamps reflectionAt
    res.json({ success: true, plan });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
