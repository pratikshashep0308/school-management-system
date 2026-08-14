/**
 * promotionController — FP-052 · GAP-SIS-005…009, GAP-PA-004 · FINAL LLD 1.1 §18.3, §19
 *
 * The HTTP surface for promotion, historical enrolment and assessment lookup.
 *
 * ── This controller contains NO promotion business logic ────────────────────
 * Every promotion decision, transaction and integrity check lives in
 * promotionService (FP-037). This controller validates input, checks
 * authorization, calls the service, and shapes the response. It never touches
 * Student.class, Class.students[] or PromotionRecord directly — doing so would
 * create a second code path with different guarantees than the transactional
 * one, which is exactly what D-004 forbids.
 *
 * The transaction semantics established and tested in FP-037 are therefore
 * preserved by construction: there is only one implementation.
 *
 * Live transaction validation remains ENVIRONMENT VALIDATION PENDING.
 */
const promotionService = require('../services/promotionService');
const historicalEnrolment = require('../services/historicalEnrolmentService');
const examResultProvider = require('../services/examResultProvider');
const auditService = require('../services/auditService');

/**
 * POST /api/sis/promotion/preview
 * Body: { classId, examGroupId, academicYearId, toAcademicYearId, sectionPolicy? }
 *
 * Read-only. Runs the D-011 eligibility gates and returns per-student outcomes
 * WITHOUT writing. An incomplete mark set surfaces here as a named blocker.
 */
exports.previewPromotion = async (req, res) => {
  try {
    const { classId, examGroupId, academicYearId, toAcademicYearId, sectionPolicy } = req.body;
    if (!classId || !examGroupId || !academicYearId) {
      return res.status(400).json({
        success: false,
        message: 'classId, examGroupId and academicYearId are required.',
      });
    }

    const preview = await promotionService.preview({
      classId, examGroupId, academicYearId, toAcademicYearId,
      schoolId: req.user.school,
      sectionPolicy: sectionPolicy || 'same',
    });

    res.json({ success: true, preview });
  } catch (err) {
    // D-011 blockers carry a code; surface it as a 422 with the missing detail,
    // not a generic 500 — the caller needs to know what to fix.
    if (err.code === examResultProvider.BLOCK_GROUP_UNPUBLISHED ||
        err.code === examResultProvider.BLOCK_MARKS_INCOMPLETE) {
      return res.status(422).json({
        success: false, code: err.code, message: err.message,
        missing: err.missing || [],
      });
    }
    if (err.code === promotionService.ERR.BATCH_TOO_LARGE) {
      return res.status(422).json({ success: false, code: err.code, message: err.message });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/sis/promotion/confirm
 * Body: { previewResult, batchId, overrides? }
 *
 * Applies a previewed promotion in ONE transaction (FP-037). Idempotent on
 * batchId. Returns a summary; never a partial result.
 */
exports.confirmPromotion = async (req, res) => {
  try {
    const { previewResult, batchId, overrides } = req.body;
    if (!previewResult || !batchId) {
      return res.status(400).json({
        success: false,
        message: 'previewResult and batchId are required.',
      });
    }

    const result = await promotionService.confirm({
      previewResult,
      batchId,
      schoolId: req.user.school,
      actorId: req.user._id,
      overrides: overrides || {},
    });

    // Audit the confirmed promotion (not the preview).
    if (!result.alreadyApplied) {
      await auditService.audit({
        actor: req.user._id,
        actorRoleSnapshot: req.user.role,
        action: 'promotion.confirm',
        module: 'promotion',
        recordRef: { collectionName: 'PromotionRecord', id: null },
        after: {
          batchId,
          promoted: result.promoted,
          retained: result.retained,
          graduated: result.graduated,
        },
        source: 'route',
        school: req.user.school,
      });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    // A missing transaction capability is an environment condition, reported
    // honestly rather than as a generic failure.
    if (err.code === promotionService.ERR.NO_TRANSACTIONS) {
      return res.status(503).json({
        success: false, code: err.code,
        message: 'Promotion requires a transaction-capable database and this deployment is not configured for it.',
      });
    }
    if (err.code === promotionService.ERR.MEMBERSHIP) {
      return res.status(409).json({
        success: false, code: err.code, message: err.message, students: err.students || [],
      });
    }
    if (err.code === promotionService.ERR.YEAR_MISSING) {
      return res.status(422).json({ success: false, code: err.code, message: err.message });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/sis/students/:id/history
 * Historical enrolment reconstructed from PromotionRecord (D-006).
 */
exports.studentHistory = async (req, res) => {
  try {
    const history = await historicalEnrolment.historyForStudent({
      studentId: req.params.id,
      schoolId: req.user.school,
    });
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/sis/classes/:id/roster?academicYearId=
 * Which students occupied a class during a given year. Resolved from transition
 * records, NOT Class.students[] (which is the current cohort only, D-005).
 */
exports.classRoster = async (req, res) => {
  try {
    const { academicYearId } = req.query;
    if (!academicYearId) {
      return res.status(400).json({ success: false, message: 'academicYearId is required.' });
    }
    const roster = await historicalEnrolment.rosterForClassYear({
      classId: req.params.id,
      academicYearId,
      schoolId: req.user.school,
    });
    res.json({ success: true, roster });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/sis/exam-groups/:id/announcement-scope
 * D-010 — names every class the announcement will publish for, so the
 * administrator sees the scope before confirming.
 */
exports.announcementScope = async (req, res) => {
  try {
    const scope = await examResultProvider.describeAnnouncementScope({
      examGroupId: req.params.id,
      schoolId: req.user.school,
    });
    res.json({ success: true, scope });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
