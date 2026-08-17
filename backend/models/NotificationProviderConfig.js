/**
 * NotificationProviderConfig — FP-023 · GAP-NOT-006 · Decision D-007
 * FINAL LLD 1.1 §23 · ADR-05 open (concrete provider only)
 *
 * Per-school, per-channel provider configuration. The MODEL is unblocked; the
 * concrete provider adapter (ADR-05) is FP-039.
 *
 * ── Credentials are never stored or returned in plain text ──────────────────
 * `credentialsRef` holds a REFERENCE to a secret (an env var name or a secret-
 * manager key), never the secret itself. A read API returns a masked indicator.
 * This model carries no plaintext credential field at all, so one cannot leak.
 */
const mongoose = require('mongoose');

const NotificationProviderConfigSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    channel: { type: String, enum: ['sms', 'whatsapp'], required: true },

    // Provider identifier is a free string — no vendor is enumerated here, so no
    // provider is invented (ADR-05 open).
    provider: { type: String, default: null },
    apiEndpoint: { type: String, default: null },
    senderNumber: { type: String, default: null },

    // A REFERENCE to a secret, never the secret. e.g. 'env:SMS_API_KEY' or a
    // secret-manager path resolved at send time.
    credentialsRef: { type: String, default: null },

    isActive: { type: Boolean, default: false },
    school_: { type: String, select: false }, // reserved; never used for secrets
  },
  { timestamps: true }
);

// One configuration per school per channel.
NotificationProviderConfigSchema.index({ school: 1, channel: 1 }, { unique: true });

/** A masked, safe-to-return view. The credential reference is never exposed. */
NotificationProviderConfigSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    channel: this.channel,
    provider: this.provider,
    apiEndpoint: this.apiEndpoint,
    senderNumber: this.senderNumber,
    isActive: this.isActive,
    // Only whether a credential is configured, never any part of it.
    credentialConfigured: Boolean(this.credentialsRef),
  };
};

module.exports =
  mongoose.models.NotificationProviderConfig ||
  mongoose.model('NotificationProviderConfig', NotificationProviderConfigSchema);
