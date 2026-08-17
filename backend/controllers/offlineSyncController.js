/**
 * offlineSyncController — FP-071 · FINAL LLD 1.1 §33
 *
 * POST /api/sync — replay a queued batch. Runs as the authenticated user; the
 * handlers apply the same validation and authorization as the online paths, so
 * being offline earlier confers no extra permission.
 */
const mongoose = require('mongoose');
const offlineSync = require('../services/offlineSyncService');
const termValidation = require('../services/timetableTermValidation');

/**
 * Handlers map each supported op type to its normal service path. Each returns
 * { data } on success, or { conflict|forbidden|validationError, ... }.
 */
function buildHandlers() {
  return {
    'lessonPlan.create': async (payload, ctx) => {
      const LessonPlan = mongoose.model('LessonPlan');
      // Same date validation as the online planner (FP-054/FP-051).
      const check = await termValidation.validatePlanDate({
        date: payload.date, academicYearId: payload.academicYearId, schoolId: ctx.user.school,
      });
      if (!check.valid) return { validationError: true, message: check.message };
      const plan = await LessonPlan.create({
        ...payload, teacher: ctx.user._id, school: ctx.user.school, status: payload.status || 'draft',
      });
      return { data: { id: plan._id } };
    },

    'lessonPlan.update': async (payload, ctx) => {
      const LessonPlan = mongoose.model('LessonPlan');
      const plan = await LessonPlan.findOne({ _id: payload.id, school: ctx.user.school, teacher: ctx.user._id });
      if (!plan) return { forbidden: true, message: 'Plan not found or not yours.' };
      // Optimistic concurrency: a stale base means someone edited meanwhile.
      if (payload.baseUpdatedAt && plan.updatedAt &&
          new Date(payload.baseUpdatedAt).getTime() !== new Date(plan.updatedAt).getTime()) {
        return { conflict: true, current: plan.toObject(), message: 'This plan changed since you edited it offline.' };
      }
      ['objectives', 'activities', 'reflection', 'coverageStatus', 'status'].forEach((f) => {
        if (payload[f] !== undefined) plan[f] = payload[f];
      });
      await plan.save();
      return { data: { id: plan._id, updatedAt: plan.updatedAt } };
    },

    'formativeObservation.create': async (payload, ctx) => {
      const FO = mongoose.model('FormativeObservation');
      const obs = await FO.create({ ...payload, observedBy: ctx.user._id, school: ctx.user.school });
      return { data: { id: obs._id } };
    },

    'readingLog.create': async (payload, ctx) => {
      const { ReadingLogEntry } = require('../models/subjectModels');
      const entry = await ReadingLogEntry.create({ ...payload, school: ctx.user.school });
      return { data: { id: entry._id } };
    },
  };
}

exports.sync = async (req, res) => {
  try {
    const { operations } = req.body;
    const ctx = {
      user: req.user,
      models: { SyncLog: mongoose.model('SyncLog') },
      handlers: buildHandlers(),
    };
    const { results, summary } = await offlineSync.processBatch(operations, ctx);
    // 200 even with per-op failures — the client reads each result.
    res.json({ success: true, results, summary });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports._buildHandlers = buildHandlers; // for tests
