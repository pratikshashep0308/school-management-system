/**
 * copilotService — FP-082 (teacher) + FP-083 (principal) · GAP-TC-001..004, GAP-PC-001..003
 * Decisions ADR-11, ADR-12 · FINAL LLD 1.1 §32
 *
 * Teacher and principal copilots. Both go through the ADR-11 generator boundary
 * (same registry pattern as insightService) and add ADR-12's guardrails:
 *
 *   - GROUNDING: a copilot answers only from supplied context. It must not
 *     invent facts about a specific student or the school. The context is
 *     caller-supplied and pre-authorised; the copilot never fetches raw records.
 *   - SCOPE: the teacher copilot is scoped to the teacher's own classes; the
 *     principal copilot to school-level aggregates. Scope is enforced by WHAT
 *     CONTEXT the caller passes, not by trusting the model.
 *   - NO ACTIONS: a copilot suggests; it never writes. It returns text, never a
 *     command the system executes. Promotion, marks and enrolment are never
 *     driven by a copilot (this mirrors the promotion engine's refusal to accept
 *     an Insight — FP-090).
 *
 * Like insightService, this module does not import Result/BehaviouralNote/
 * enrolment models: grounding context arrives pre-aggregated.
 */

const generators = new Map();

function registerGenerator(generator) {
  if (!generator || !generator.name || typeof generator.generate !== 'function') {
    throw new Error('COPILOT_GENERATOR_INVALID: a generator needs a name and generate(prompt, context).');
  }
  generators.set(generator.name, generator);
}
function _clearGenerators() { generators.clear(); }

/** Reject a question that asks the copilot to take an action rather than answer. */
const ACTION_INTENTS = [/\bpromote\b/i, /\bfail\b.*\bstudent/i, /\bchange\b.*\bmark/i, /\bdelete\b/i, /\bsend\b.*\b(sms|message|email)\b/i];

function isActionRequest(question) {
  return ACTION_INTENTS.some((re) => re.test(question || ''));
}

/**
 * Answer a grounded question.
 *
 * @param {object} opts
 * @param {'teacher'|'principal'} opts.role
 * @param {string} opts.question
 * @param {object} opts.context     pre-aggregated, pre-authorised grounding data
 * @param {object} [opts.deps]      { generator } injectable
 */
async function ask({ role, question, context, deps = {} }) {
  if (!question || !String(question).trim()) {
    return { status: 'rejected', code: 'COPILOT_EMPTY', message: 'Please ask a question.' };
  }

  // ── No actions ─────────────────────────────────────────────────────────────
  if (isActionRequest(question)) {
    return {
      status: 'refused',
      code: 'COPILOT_ACTION_REFUSED',
      message: 'I can help you understand the data, but I cannot make changes like promoting, '
        + 'failing, or messaging. Use the relevant screen for that.',
    };
  }

  const generator = deps.generator || generators.get([...generators.keys()][0]);
  if (!generator) {
    return { status: 'pending', code: 'ADR_11_PENDING', message: 'The copilot needs an LLM generator, which is not yet configured (ADR-11).' };
  }

  // ── Grounding ──────────────────────────────────────────────────────────────
  // If the caller supplied no context, the copilot must not answer from thin air
  // about a specific student or school metric.
  const grounded = context && Object.keys(context).length > 0;
  const prompt = buildCopilotPrompt(role, question, context, grounded);

  const result = await generator.generate(prompt, { role, grounded });
  const answer = (result && result.answer || '').trim();
  if (!answer) {
    return { status: 'error', code: 'COPILOT_NO_ANSWER', message: 'No answer was produced.' };
  }

  return {
    status: 'answered',
    answer,
    grounded,
    // The context the answer was based on, so the UI can show its basis.
    basis: grounded ? Object.keys(context) : [],
  };
}

function buildCopilotPrompt(role, question, context, grounded) {
  const scope = role === 'principal'
    ? 'You are assisting a principal with SCHOOL-LEVEL aggregates only.'
    : 'You are assisting a teacher about THEIR OWN classes only.';
  const guard = grounded
    ? 'Answer ONLY from the context below. If the context does not contain the answer, say so.'
    : 'You have no grounding context. Do NOT invent facts about any specific student or metric; '
      + 'answer only in general terms or ask for specifics.';
  return [
    scope, guard,
    'Question:', question,
    grounded ? `Context: ${JSON.stringify(context)}` : '',
    'You may explain and suggest. You may NOT instruct the system to take any action.',
  ].filter(Boolean).join('\n');
}

module.exports = { ask, registerGenerator, isActionRequest, buildCopilotPrompt, _clearGenerators };
