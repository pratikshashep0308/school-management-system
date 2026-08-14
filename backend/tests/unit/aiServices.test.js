/**
 * FP-080/081/082/083 — AI layer behaviour at the ADR-10/ADR-11 boundaries.
 *
 * These tests assert BEHAVIOUR, not source text:
 *   - with no generator/provider registered, the services report the pending
 *     decision and write nothing (they do not fabricate output);
 *   - a registered fake generator drives real output;
 *   - copilots refuse actions and refuse to invent when ungrounded;
 *   - translation refuses to machine-translate safeguarding content;
 *   - GAP-AI-005 structural isolation is proven by an import-graph test.
 */
const path = require('path');
const insightService = require('../../services/insightService');
const copilotService = require('../../services/copilotService');
const translationService = require('../../services/translationService');

afterEach(() => {
  insightService._clearGenerators();
  copilotService._clearGenerators();
  translationService._clearProviders();
});

describe('insightService (FP-080, ADR-11)', () => {
  const signals = {
    subject: 'Asha (Grade 6)',
    entity: { collectionName: 'Student', id: '507f1f77bcf86cd799439011' },
    window: 'last 4 weeks',
    metrics: [{ label: 'Attendance', value: '68%', trend: 'falling' }],
    sourceRefs: [{ collectionName: 'AttendanceSummary', id: '507f1f77bcf86cd799439012' }],
    sourceModules: ['attendance'],
  };

  test('no generator → ADR_11_PENDING, nothing written', async () => {
    const InsightModel = { create: jest.fn() };
    const res = await insightService.generateInsight({ signals, type: 'attendance-risk', schoolId: 's1', deps: { InsightModel } });
    expect(res.status).toBe('pending');
    expect(res.code).toBe('ADR_11_PENDING');
    expect(InsightModel.create).not.toHaveBeenCalled();
  });

  test('registered generator drives a persisted insight', async () => {
    const InsightModel = { create: jest.fn(async (doc) => ({ _id: 'i1', ...doc })) };
    const generator = { name: 'fake', generate: jest.fn(async () => ({ explanation: 'Attendance fell to 68%, below the 75% threshold.', confidence: 0.8 })) };
    const res = await insightService.generateInsight({ signals, type: 'attendance-risk', schoolId: 's1', deps: { generator, InsightModel } });
    expect(res.status).toBe('generated');
    expect(InsightModel.create).toHaveBeenCalledTimes(1);
    const doc = InsightModel.create.mock.calls[0][0];
    expect(doc.explanation).toMatch(/68%/);
    expect(doc.sourceRefs).toHaveLength(1);
    expect(doc.affectedEntity.collectionName).toBe('Student');
  });

  test('generated insight with no source refs is rejected, not persisted', async () => {
    const InsightModel = { create: jest.fn() };
    const generator = { name: 'fake', generate: jest.fn(async () => ({ explanation: 'Something happened.' })) };
    const res = await insightService.generateInsight({ signals: { ...signals, sourceRefs: [] }, type: 't', schoolId: 's1', deps: { generator, InsightModel } });
    expect(res.status).toBe('rejected');
    expect(res.code).toBe('INSIGHT_NO_SOURCE');
    expect(InsightModel.create).not.toHaveBeenCalled();
  });

  test('generated insight with empty explanation is rejected', async () => {
    const InsightModel = { create: jest.fn() };
    const generator = { name: 'fake', generate: jest.fn(async () => ({ explanation: '   ' })) };
    const res = await insightService.generateInsight({ signals, type: 't', schoolId: 's1', deps: { generator, InsightModel } });
    expect(res.status).toBe('rejected');
    expect(res.code).toBe('INSIGHT_NO_EXPLANATION');
    expect(InsightModel.create).not.toHaveBeenCalled();
  });

  test('buildPrompt rejects signals without entity/metrics', () => {
    expect(() => insightService.buildPrompt({})).toThrow(/SIGNALS_INVALID/);
  });
});

describe('GAP-AI-005 — structural isolation (import-graph)', () => {
  // The requirement: the insight service module must not import Result,
  // BehaviouralNote, or student-enrolment models. Proven by inspecting the
  // resolved module's dependency children, not by reading its comments.
  test('insightService does not depend on raw record models', () => {
    const svcPath = require.resolve('../../services/insightService');
    // Fresh require graph rooted at the service.
    delete require.cache[svcPath];
    require(svcPath);
    const mod = require.cache[svcPath];
    const forbidden = ['models/Result', 'models/BehaviouralNote', 'models/Student', 'models/PromotionRecord', 'models/Class'];
    const children = mod.children.map((c) => c.id.replace(/\\/g, '/'));
    for (const child of children) {
      for (const f of forbidden) {
        expect(child).not.toContain(f);
      }
    }
  });
});

describe('copilotService (FP-082/083, ADR-11/ADR-12)', () => {
  test('refuses action requests without calling a generator', async () => {
    const generator = { name: 'fake', generate: jest.fn() };
    copilotService.registerGenerator(generator);
    const res = await copilotService.ask({ role: 'teacher', question: 'Please promote Rohan to grade 7', context: {} });
    expect(res.status).toBe('refused');
    expect(res.code).toBe('COPILOT_ACTION_REFUSED');
    expect(generator.generate).not.toHaveBeenCalled();
  });

  test('isActionRequest catches mark changes and deletes', () => {
    expect(copilotService.isActionRequest('change the mark for Asha')).toBe(true);
    expect(copilotService.isActionRequest('delete the record')).toBe(true);
    expect(copilotService.isActionRequest('send an sms to parents')).toBe(true);
    expect(copilotService.isActionRequest('which students are below 75% attendance?')).toBe(false);
  });

  test('no generator → ADR_11_PENDING', async () => {
    const res = await copilotService.ask({ role: 'principal', question: 'Summarise attendance', context: { a: 1 } });
    expect(res.code).toBe('ADR_11_PENDING');
  });

  test('ungrounded prompt instructs the model not to invent', async () => {
    const generator = { name: 'fake', generate: jest.fn(async () => ({ answer: 'ok' })) };
    copilotService.registerGenerator(generator);
    const res = await copilotService.ask({ role: 'teacher', question: 'How is Asha doing?', context: {} });
    expect(res.grounded).toBe(false);
    const prompt = generator.generate.mock.calls[0][0];
    expect(prompt).toMatch(/no grounding context/i);
    expect(prompt).toMatch(/do NOT invent/i);
  });

  test('grounded answer reports its basis', async () => {
    const generator = { name: 'fake', generate: jest.fn(async () => ({ answer: 'She is at 68%.' })) };
    copilotService.registerGenerator(generator);
    const res = await copilotService.ask({ role: 'teacher', question: 'How is Asha doing?', context: { attendance: '68%' } });
    expect(res.status).toBe('answered');
    expect(res.grounded).toBe(true);
    expect(res.basis).toContain('attendance');
  });
});

describe('translationService (FP-081, ADR-10)', () => {
  test('safeguarding content is never machine-translated', async () => {
    const provider = { name: 'fake', translate: jest.fn() };
    translationService.registerProvider(provider);
    const res = await translationService.translate({ text: 'Confidential welfare concern', target: 'mr', category: 'safeguarding' });
    expect(res.status).toBe('not-translated');
    expect(res.requiresHuman).toBe(true);
    expect(res.text).toBe('Confidential welfare concern'); // source, unchanged
    expect(provider.translate).not.toHaveBeenCalled();
  });

  test('no provider → ADR_10_PENDING, returns source untouched', async () => {
    const res = await translationService.translate({ text: 'Parents evening on Friday', target: 'mr' });
    expect(res.code).toBe('ADR_10_PENDING');
    expect(res.text).toBe('Parents evening on Friday');
  });

  test('registered provider translates and caches', async () => {
    const store = new Map();
    const cache = { get: async (k) => store.get(k), set: async (k, v) => store.set(k, v) };
    const provider = { name: 'fake', translate: jest.fn(async (t) => `[mr]${t}`) };
    translationService.registerProvider(provider);
    const first = await translationService.translate({ text: 'Hello', target: 'mr', deps: { cache } });
    expect(first.status).toBe('translated');
    const second = await translationService.translate({ text: 'Hello', target: 'mr', deps: { cache } });
    expect(second.status).toBe('cached');
    expect(provider.translate).toHaveBeenCalledTimes(1);
  });
});
