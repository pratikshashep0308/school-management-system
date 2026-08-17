/**
 * translationService — FP-081 · GAP-I18N-001..003 · Decision ADR-10 (provider) OPEN
 * FINAL LLD 1.1 §37
 *
 * Translates parent-facing strings into the parent's language. Goes through an
 * ADR-10 translation provider boundary — no concrete translation vendor is
 * embedded.
 *
 * ── Safety: never machine-translate a wellbeing/safeguarding message ────────
 * A mistranslated safeguarding message could cause real harm. Such messages are
 * flagged non-translatable and returned in the source language with a marker, so
 * a human handles them, rather than risking a wrong automated translation.
 *
 * ── Caching by content hash ─────────────────────────────────────────────────
 * Identical source+target pairs resolve from cache, so a provider call is made
 * once per distinct string. The cache is injectable for testing.
 */
const crypto = require('crypto');

const providers = new Map();

function registerProvider(provider) {
  if (!provider || !provider.name || typeof provider.translate !== 'function') {
    throw new Error('TRANSLATION_PROVIDER_INVALID: a provider needs a name and translate(text, target).');
  }
  providers.set(provider.name, provider);
}
function _clearProviders() { providers.clear(); }

/** Categories that must never be machine-translated. */
const NON_TRANSLATABLE = ['safeguarding', 'wellbeing', 'legal'];

function cacheKey(text, target) {
  return crypto.createHash('sha256').update(`${target}::${text}`).digest('hex').slice(0, 24);
}

/**
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} opts.target        target language
 * @param {string} [opts.category]    if NON_TRANSLATABLE, returned untranslated
 * @param {object} [opts.deps]        { provider, cache } injectable
 */
async function translate({ text, target, category, deps = {} }) {
  if (!text) return { status: 'empty', text: '' };
  if (!target) return { status: 'no-target', text };

  // ── Safety gate ─────────────────────────────────────────────────────────────
  if (category && NON_TRANSLATABLE.includes(category)) {
    return {
      status: 'not-translated',
      reason: 'category-non-translatable',
      text, // source language, unchanged
      requiresHuman: true,
    };
  }

  const cache = deps.cache;
  const key = cacheKey(text, target);
  if (cache) {
    const hit = await cache.get(key);
    if (hit) return { status: 'cached', text: hit, target };
  }

  const provider = deps.provider || providers.get([...providers.keys()][0]);
  if (!provider) {
    // ADR-10 not resolved: return source with a marker, never a wrong guess.
    return { status: 'pending', code: 'ADR_10_PENDING', text, target, message: 'Translation provider not configured (ADR-10).' };
  }

  const translated = await provider.translate(text, target);
  if (cache && translated) await cache.set(key, translated);
  return { status: 'translated', text: translated, target };
}

module.exports = { translate, registerProvider, NON_TRANSLATABLE, cacheKey, _clearProviders };
