/**
 * notificationAdapter — FP-039 · GAP-NOT-001..006 · Decisions D-007, D-008
 * FINAL LLD 1.1 §23 · ADR-05 OPEN (concrete provider)
 *
 * ── The adapter boundary ────────────────────────────────────────────────────
 * This defines the CONTRACT every SMS/WhatsApp provider must satisfy, resolves a
 * school's configured provider, resolves its credential from a reference, and
 * dispatches through the provider. It does NOT contain a concrete provider —
 * which vendor, which SDK, which endpoint is ADR-05 and is unresolved.
 *
 * A provider is a plain object: { name, send(message, credential, config) }.
 * Registering one is how ADR-05 gets resolved later, without touching this file.
 *
 * ── Secrets never live here ─────────────────────────────────────────────────
 * The config stores a credentialsRef ('env:X', 'secret:Y', 'vault:Z'). The
 * credential is resolved AT SEND TIME from that reference and passed to the
 * provider transiently. It is never stored, never logged, never returned.
 *
 * ── Fallback (D-008) ────────────────────────────────────────────────────────
 * If no provider is configured or resolution fails, the adapter falls back to
 * the school's current sending number via the existing notification path, rather
 * than dropping the message. The fallback is reported, not silent.
 */
const mongoose = require('mongoose');

/** Registered providers, keyed by name. Empty until ADR-05 registers one. */
const providers = new Map();

/**
 * Register a concrete provider (the ADR-05 resolution point).
 * @param {{name: string, send: Function}} provider
 */
function registerProvider(provider) {
  if (!provider || !provider.name || typeof provider.send !== 'function') {
    throw new Error('NOTIFICATION_PROVIDER_INVALID: a provider needs a name and a send(message, credential, config) function.');
  }
  providers.set(provider.name, provider);
}

/** For tests and diagnostics. */
function _clearProviders() { providers.clear(); }
function listProviders() { return [...providers.keys()]; }

/**
 * Resolve a credential from its reference. NEVER returns the reference itself in
 * an error, and NEVER logs the value.
 *
 * @param {string} ref  'env:NAME' | 'secret:NAME' | 'vault:PATH'
 * @param {object} [resolvers] injectable for testing
 * @returns {Promise<string>} the resolved secret
 */
async function resolveCredential(ref, resolvers = {}) {
  if (!ref) throw new Error('NOTIFICATION_CREDENTIAL_MISSING: no credential reference configured.');
  const [scheme, ...rest] = ref.split(':');
  const name = rest.join(':');

  if (scheme === 'env') {
    const val = (resolvers.env || process.env)[name];
    if (!val) throw new Error(`NOTIFICATION_CREDENTIAL_UNRESOLVED: env reference '${name}' is not set.`);
    return val;
  }
  if (scheme === 'secret' || scheme === 'vault') {
    // The concrete secret-manager/vault client is deployment-specific (ADR-05).
    const resolver = resolvers[scheme];
    if (!resolver) {
      const e = new Error(`NOTIFICATION_CREDENTIAL_PROVIDER_PENDING: '${scheme}:' resolution requires the ADR-05 secret backend, not yet configured.`);
      e.code = 'ADR_05_PENDING';
      throw e;
    }
    return resolver(name);
  }
  throw new Error(`NOTIFICATION_CREDENTIAL_SCHEME_INVALID: '${scheme}' is not a supported reference scheme.`);
}

/**
 * Send a message on a channel for a school.
 *
 * @param {object} opts
 * @param {*} opts.schoolId
 * @param {'sms'|'whatsapp'} opts.channel
 * @param {object} opts.message   { to, body }
 * @param {object} [opts.deps]    injectable models/resolvers/fallback for testing
 * @returns {Promise<object>} { status, provider, fallback, attempts }
 */
async function send({ schoolId, channel, message, deps = {} }) {
  if (!message || !message.to || !message.body) {
    return { status: 'rejected', code: 'NOTIFICATION_MESSAGE_INVALID', message: 'to and body are required.' };
  }

  const NotificationProviderConfig = deps.ConfigModel || mongoose.model('NotificationProviderConfig');
  const config = await NotificationProviderConfig.findOne({ school: schoolId, channel }).lean?.()
    ?? await NotificationProviderConfig.findOne({ school: schoolId, channel });

  // ── No provider configured → D-008 fallback ────────────────────────────────
  if (!config || !config.provider || !config.isActive) {
    return await fallback({ schoolId, channel, message, reason: 'no active provider configured', deps });
  }

  const provider = providers.get(config.provider);
  if (!provider) {
    // The config names a provider, but no adapter is registered for it. This is
    // the ADR-05 gap: configured but not yet implemented.
    return await fallback({
      schoolId, channel, message,
      reason: `provider '${config.provider}' has no registered adapter (ADR-05 pending)`,
      code: 'ADR_05_PENDING', deps,
    });
  }

  // ── Resolve the credential transiently and dispatch ────────────────────────
  let credential;
  try {
    credential = await resolveCredential(config.credentialsRef, deps.resolvers);
  } catch (err) {
    return await fallback({ schoolId, channel, message, reason: `credential unresolved: ${err.message}`, code: err.code, deps });
  }

  try {
    const result = await provider.send(message, credential, {
      apiEndpoint: config.apiEndpoint, senderNumber: config.senderNumber,
    });
    // The credential goes out of scope here; it is never returned or logged.
    return { status: 'sent', provider: provider.name, fallback: false, providerResult: sanitizeResult(result) };
  } catch (err) {
    // Provider dispatch failed — classify for retry.
    return {
      status: 'error',
      provider: provider.name,
      retriable: classifyRetriable(err),
      // No credential, endpoint secret, or raw provider error internals.
      message: 'Provider dispatch failed.',
    };
  }
}

/** D-008 fallback via the existing school notification path. */
async function fallback({ schoolId, channel, message, reason, code, deps }) {
  const fallbackSender = deps.fallbackSender;
  if (!fallbackSender) {
    // In MODE A with no fallback wired, report the pending state honestly.
    return {
      status: 'pending', fallback: true, code: code || 'NOTIFICATION_FALLBACK_UNWIRED',
      reason, message: 'No provider available and no fallback sender wired in this environment.',
    };
  }
  await fallbackSender({ schoolId, channel, message });
  return { status: 'sent-fallback', fallback: true, reason };
}

/** Strip anything secret-shaped from a provider result before returning it. */
function sanitizeResult(result) {
  if (!result || typeof result !== 'object') return result;
  const { credential, apiKey, token, secret, ...safe } = result;
  return safe;
}

/** A transient network/5xx failure is retriable; a 4xx config error is not. */
function classifyRetriable(err) {
  const status = err?.response?.status || err?.status;
  if (!status) return true; // network — retry
  return status >= 500;
}

module.exports = {
  send,
  registerProvider,
  resolveCredential,
  listProviders,
  classifyRetriable,
  _clearProviders,
};
