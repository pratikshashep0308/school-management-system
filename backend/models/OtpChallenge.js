/**
 * OtpChallenge — FP-042 · GAP-AUTH-001 · FINAL LLD 1.1 §29
 *
 * Stores a HASH of the OTP, never the code. A TTL prunes expired challenges.
 */
const mongoose = require('mongoose');

const OtpChallengeSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true },
    purpose: { type: String, required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    // Salted hash + per-record salt. The plaintext code is never stored.
    codeHash: { type: String, required: true, select: false },
    salt: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

OtpChallengeSchema.index({ identifier: 1, purpose: 1, school: 1, createdAt: -1 });
// Prune expired challenges an hour after expiry.
OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.models.OtpChallenge || mongoose.model('OtpChallenge', OtpChallengeSchema);
