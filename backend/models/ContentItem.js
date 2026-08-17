/**
 * ContentItem — FP-019 · GAP-CCR-001, GAP-CCR-005 · FINAL LLD 1.1 §26
 *
 * The curriculum and content repository.
 *
 * ── Not the BestPracticeResource store ──────────────────────────────────────
 * D-009 makes BestPracticeResource a separate dedicated collection. This schema
 * must NOT gain a type discriminator to accommodate it, and must remain
 * unmodified by GAP-PLC-004.
 *
 * `language` is required because GAP-CCR-005 stores multilingual story content
 * for the Reading module, and content whose language is unknown cannot be
 * served to the right reader.
 */
const mongoose = require('mongoose');

const ContentItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['story', 'worksheet', 'video', 'image', 'document', 'link', 'other'],
      default: 'other',
    },

    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    grade: { type: Number, min: 1, max: 12 },
    topicTags: { type: [String], default: [] },

    // GAP-CCR-005 — required, not defaulted.
    language: { type: String, required: true, trim: true },

    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: null },

    // Reuses the existing Cloudinary integration (GAP-CCR-003). No second file
    // store is introduced.
    fileUrl: { type: String },
    usageCount: { type: Number, default: 0, min: 0 },

    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  },
  { timestamps: true }
);

ContentItemSchema.index({ school: 1, subject: 1, grade: 1, language: 1 });
ContentItemSchema.index({ school: 1, approvalStatus: 1 });
ContentItemSchema.index({ title: 'text', topicTags: 'text' });

ContentItemSchema.pre('validate', function (next) {
  if (this.approvalStatus === 'rejected' && !String(this.rejectionReason || '').trim()) {
    return next(
      new Error('CONTENT_REJECTION_REASON_REQUIRED: a rejected item must record why.')
    );
  }
  return next();
});

module.exports =
  mongoose.models.ContentItem || mongoose.model('ContentItem', ContentItemSchema);
