/**
 * curriculumController — FP-053 · GAP-CCR-001..005, GAP-PLC-004 · Decision D-009
 * FINAL LLD 1.1 §26
 *
 * REST over ContentItem and BestPracticeResource. D-009 keeps them SEPARATE:
 * two controllers' worth of behaviour, but distinct collections and distinct
 * endpoints. A ContentItem is never returned as a BestPracticeResource or vice
 * versa, so no client can conflate them.
 */
const ContentItem = require('../models/ContentItem');
const BestPractice = require('../models/BestPracticeResource');
const auditService = require('../services/auditService');

// ── ContentItem (curriculum repository) ───────────────────────────────────────
exports.listContent = async (req, res) => {
  try {
    const filter = { school: req.user.school };
    if (req.query.subject) filter.subject = req.query.subject;
    if (req.query.grade) filter.grade = Number(req.query.grade);
    if (req.query.language) filter.language = req.query.language;
    if (req.query.status) filter.approvalStatus = req.query.status;
    const items = await ContentItem.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createContent = async (req, res) => {
  try {
    const { title, type, subject, grade, language, topicTags, fileUrl } = req.body;
    if (!title || !language) {
      return res.status(400).json({ success: false, message: 'title and language are required.' });
    }
    const item = await ContentItem.create({
      title, type: type || 'other', subject, grade: grade ? Number(grade) : undefined,
      language, topicTags: topicTags || [], fileUrl,
      uploader: req.user._id, approvalStatus: 'pending', school: req.user.school,
    });
    res.status(201).json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.reviewContent = async (req, res) => {
  try {
    const { decision, rejectionReason } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'decision must be approved or rejected.' });
    }
    const item = await ContentItem.findOne({ _id: req.params.id, school: req.user.school });
    if (!item) return res.status(404).json({ success: false, message: 'Content item not found.' });

    item.approvalStatus = decision;
    item.approvedBy = req.user._id;
    if (decision === 'rejected') item.rejectionReason = rejectionReason || null;
    await item.save(); // model enforces rejection-reason-required
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ── BestPracticeResource (D-009 — dedicated, separate endpoints) ──────────────
exports.listBestPractices = async (req, res) => {
  try {
    const filter = { school: req.user.school };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.subject) filter.subject = req.query.subject;
    const resources = await BestPractice.find(filter).sort({ publishedAt: -1, createdAt: -1 }).limit(200).lean();
    res.json({ success: true, resources });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createBestPractice = async (req, res) => {
  try {
    const { title, summary, body, resourceType, subject, grade, competencies } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title is required.' });
    const resource = await BestPractice.create({
      title, summary, body, resourceType: resourceType || 'other',
      subject, grade: grade ? Number(grade) : undefined, competencies: competencies || [],
      contributedBy: req.user._id, status: 'draft', school: req.user.school,
    });
    res.status(201).json({ success: true, resource });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.transitionBestPractice = async (req, res) => {
  try {
    const { status } = req.body;
    const resource = await BestPractice.findOne({ _id: req.params.id, school: req.user.school });
    if (!resource) return res.status(404).json({ success: false, message: 'Resource not found.' });

    if (!resource.canTransitionTo(status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot move a ${resource.status} resource to ${status}.`,
      });
    }
    resource.status = status;
    if (status === 'published') {
      resource.publishedAt = new Date();
      resource.publishedBy = req.user._id;
    }
    await resource.save(); // model enforces publish-completeness
    res.json({ success: true, resource });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
