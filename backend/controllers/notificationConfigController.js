/**
 * notificationConfigController — FP-058 · GAP-NOT-006 · Decision D-007
 * FINAL LLD 1.1 §23 · ADR-05 OPEN
 *
 * Manages NotificationProviderConfig. The CONFIG surface is unblocked; the
 * concrete provider that consumes it (which vendor, which SDK) is ADR-05 and is
 * FP-039. This controller never stores a plaintext credential and never returns
 * a credential reference — reads go through toSafeJSON.
 */
const NotificationProviderConfig = require('../models/NotificationProviderConfig');

exports.list = async (req, res) => {
  try {
    const configs = await NotificationProviderConfig.find({ school: req.user.school });
    // Masked view only — the credential reference is never serialised out.
    res.json({ success: true, configs: configs.map((c) => c.toSafeJSON()) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.upsert = async (req, res) => {
  try {
    const { channel, provider, apiEndpoint, senderNumber, credentialsRef, isActive } = req.body;
    if (!channel || !['sms', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, message: 'channel must be sms or whatsapp.' });
    }
    // credentialsRef is a REFERENCE (e.g. 'env:SMS_KEY'), never a raw secret. If a
    // caller sends something that looks like an inline secret rather than a
    // reference, reject it — we do not want secrets flowing through this API.
    if (credentialsRef && !/^(env:|secret:|vault:)/.test(credentialsRef)) {
      return res.status(400).json({
        success: false,
        message: 'credentialsRef must be a reference (env:, secret: or vault:), not an inline secret.',
      });
    }

    const config = await NotificationProviderConfig.findOneAndUpdate(
      { school: req.user.school, channel },
      {
        $set: {
          provider: provider || null,
          apiEndpoint: apiEndpoint || null,
          senderNumber: senderNumber || null,
          credentialsRef: credentialsRef || null,
          isActive: Boolean(isActive),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, config: config.toSafeJSON() });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/notification-config/status — reports whether a working provider is
 * configured per channel, WITHOUT invoking it. Actual send capability depends on
 * the FP-039 adapter (ADR-05) and is reported as pending here.
 */
exports.status = async (req, res) => {
  try {
    const configs = await NotificationProviderConfig.find({ school: req.user.school });
    const byChannel = {};
    for (const c of configs) {
      byChannel[c.channel] = {
        configured: Boolean(c.provider && c.credentialsRef),
        active: c.isActive,
        // The adapter that would actually send is ADR-05 dependent.
        deliveryValidated: false,
        deliveryStatus: 'PENDING — provider adapter (ADR-05) not yet implemented',
      };
    }
    res.json({ success: true, channels: byChannel });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
