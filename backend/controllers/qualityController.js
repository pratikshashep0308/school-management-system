/**
 * qualityController — FP-057 · GAP-QA-001, GAP-CON-001, GAP-AI-001 · FINAL LLD 1.1 §32
 *
 * REST over QualityIndicator, Consent and Insight (review only). Insight
 * GENERATION is ADR-11-dependent (FP-080); this controller exposes the review
 * and listing surface, which is unblocked.
 */
const { QualityIndicator, Insight, Consent } = require('../models/qualityConsentInsight');

exports.listIndicators = async (req, res) => {
  try {
    const indicators = await QualityIndicator.find({ school: req.user.school }).sort({ status: 1 }).lean();
    res.json({ success: true, indicators });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.upsertIndicator = async (req, res) => {
  try {
    const { id, description, standard, status, improvementAction, dueDate } = req.body;
    if (!id && !description) {
      return res.status(400).json({ success: false, message: 'description is required for a new indicator.' });
    }
    let indicator;
    if (id) {
      indicator = await QualityIndicator.findOne({ _id: id, school: req.user.school });
      if (!indicator) return res.status(404).json({ success: false, message: 'Indicator not found.' });
      ['description', 'standard', 'status', 'improvementAction', 'dueDate'].forEach((f) => {
        if (req.body[f] !== undefined) indicator[f] = req.body[f];
      });
      await indicator.save();
    } else {
      indicator = await QualityIndicator.create({
        description, standard, status: status || 'not-started', improvementAction, dueDate,
        owner: req.user._id, school: req.user.school,
      });
    }
    res.json({ success: true, indicator });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ── Consent (append-only) ─────────────────────────────────────────────────────
exports.recordConsent = async (req, res) => {
  try {
    const { student, consentType, version, granted } = req.body;
    if (!student || !consentType || !version || granted == null) {
      return res.status(400).json({ success: false, message: 'student, consentType, version and granted are required.' });
    }
    // A new record every time — the model rejects updates. This is how a
    // withdrawal is recorded: append granted:false, never mutate the grant.
    const consent = await Consent.create({
      student, parent: req.user._id, consentType, version, granted: Boolean(granted),
      school: req.user.school,
    });
    res.status(201).json({ success: true, consent });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.consentHistory = async (req, res) => {
  try {
    const history = await Consent.find({
      student: req.params.studentId, school: req.user.school,
    }).sort({ createdAt: 1 }).lean();
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Insight review (generation is FP-080, ADR-11) ─────────────────────────────
exports.listInsights = async (req, res) => {
  try {
    const filter = { school: req.user.school };
    if (req.query.status) filter.reviewStatus = req.query.status;
    const insights = await Insight.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ success: true, insights });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.reviewInsight = async (req, res) => {
  try {
    const { decision } = req.body;
    if (!['accepted', 'dismissed'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'decision must be accepted or dismissed.' });
    }
    const insight = await Insight.findOne({ _id: req.params.id, school: req.user.school });
    if (!insight) return res.status(404).json({ success: false, message: 'Insight not found.' });
    insight.reviewStatus = decision;
    insight.reviewedBy = req.user._id;
    await insight.save();
    res.json({ success: true, insight });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
