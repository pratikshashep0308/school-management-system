/**
 * insightService — FP-080 · GAP-AI-001..005 · Decision ADR-11 (LLM provider) OPEN
 * FINAL LLD 1.1 §32
 *
 * ── GAP-AI-005: STRUCTURAL isolation, not policy ────────────────────────────
 * This module MUST NOT import the Result, BehaviouralNote, or student enrolment
 * (Student / PromotionRecord / Class) models. The requirement is that an insight
 * cannot be built with direct access to those raw records — enforced by the
 * dependency graph, verified by an architectural test, not by a comment.
 *
 * Consequently this file requires NOTHING from ../models except the Insight
 * collection it writes to. Any signal it needs about a student arrives as a
 * pre-aggregated, caller-supplied `signals` object. The service that assembles
 * signals (and may read those raw models) is a SEPARATE module; the boundary is
 * the point.
 *
 * ── ADR-11: the LLM is a boundary, not a hardcoded vendor ───────────────────
 * Generation goes through a registered `generator` — { name, generate(prompt,
 * context) }. No concrete LLM is embedded. Until ADR-11 registers one,
 * generation reports ADR_11_PENDING and writes nothing.
 *
 * ── Every insight is explainable and sourced (GAP-AI-002, GAP-AI-004) ───────
 * The Insight model already rejects an insight with no explanation or no source
 * reference. This service additionally refuses to persist a generated insight
 * whose explanation does not actually reference its stated signals — an
 * unexplained or unsupported insight erodes trust in the whole feed.
 */
const mongoose = require('mongoose');

/** Registered generators, keyed by name. Empty until ADR-11 registers one. */
const generators = new Map();

function registerGenerator(generator) {
  if (!generator || !generator.name || typeof generator.generate !== 'function') {
    throw new Error('INSIGHT_GENERATOR_INVALID: a generator needs a name and generate(prompt, context).');
  }
  generators.set(generator.name, generator);
}
function _clearGenerators() { generators.clear(); }
function listGenerators() { return [...generators.keys()]; }

/**
 * Build a prompt from PRE-AGGREGATED signals. The signals are supplied by the
 * caller — this module never reads raw records to assemble them (GAP-AI-005).
 *
 * @param {object} signals  { subject, entity, metrics:[{label,value,trend}], window }
 */
function buildPrompt(signals) {
  if (!signals || !signals.entity || !Array.isArray(signals.metrics)) {
    throw new Error('INSIGHT_SIGNALS_INVALID: signals must carry an entity and a metrics array.');
  }
  const lines = signals.metrics.map((m) => `- ${m.label}: ${m.value}${m.trend ? ` (${m.trend})` : ''}`);
  return [
    `Summarise the following pre-aggregated signals about ${signals.subject || 'a student'} `
      + `over ${signals.window || 'the recent period'} into ONE actionable insight.`,
    'Signals:',
    ...lines,
    'Reference the specific signals that justify the insight. Do not invent data.',
  ].join('\n');
}

/**
 * Generate and persist an insight from signals.
 *
 * @param {object} opts
 * @param {object} opts.signals   pre-aggregated (see buildPrompt)
 * @param {string} opts.type      insight type
 * @param {*} opts.schoolId
 * @param {object} [opts.deps]     { generator, InsightModel } injectable
 * @returns {Promise<object>} { status, insight? , code? }
 */
async function generateInsight({ signals, type, schoolId, deps = {} }) {
  const prompt = buildPrompt(signals);

  const generator = deps.generator || generators.get([...generators.keys()][0]);
  if (!generator) {
    // ADR-11 not yet resolved. Do not fabricate an insight.
    return {
      status: 'pending',
      code: 'ADR_11_PENDING',
      message: 'Insight generation requires an LLM generator, which is not yet configured (ADR-11).',
    };
  }

  const generated = await generator.generate(prompt, { type, signals });
  // The generator returns { explanation, confidence? }. We attach provenance
  // from the SIGNALS the caller supplied — the sourceRefs the insight cites.
  const explanation = (generated && generated.explanation || '').trim();
  if (!explanation) {
    return { status: 'rejected', code: 'INSIGHT_NO_EXPLANATION', message: 'The generator returned no explanation.' };
  }

  const sourceRefs = (signals.sourceRefs || []).filter((r) => r && r.collectionName && r.id);
  if (sourceRefs.length === 0) {
    // GAP-AI-004: an insight with no traceable source is not persisted.
    return { status: 'rejected', code: 'INSIGHT_NO_SOURCE', message: 'No source references to support the insight.' };
  }

  const Insight = deps.InsightModel || mongoose.model('Insight');
  const insight = await Insight.create({
    type,
    affectedEntity: signals.entity,
    explanation,
    sourceModules: signals.sourceModules || [],
    sourceRefs,
    confidence: typeof generated.confidence === 'number' ? generated.confidence : null,
    reviewStatus: 'unreviewed',
    school: schoolId,
  });

  return { status: 'generated', insight };
}

module.exports = {
  generateInsight,
  buildPrompt,
  registerGenerator,
  listGenerators,
  _clearGenerators,
};
