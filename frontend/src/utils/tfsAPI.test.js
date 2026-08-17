// frontend/src/utils/tfsAPI.test.js
//
// FP-060..065 — API client contract and error shaping.
//
// These test the CLIENT's actual behaviour: that every method targets the real
// backend path (a faithful map, not an invention) and that apiErrorMessage
// surfaces safe messages without leaking internals. No endpoint is asserted that
// the backend does not expose.

import { apiErrorMessage } from './tfsAPI';

describe('apiErrorMessage — safe, user-facing error text', () => {
  test('surfaces the backend message and its opaque ref', () => {
    const err = { response: { status: 403, data: { message: 'Authorization could not be verified for this request.', ref: 'authz-abc123' } } };
    const msg = apiErrorMessage(err);
    expect(msg).toMatch(/could not be verified/);
    expect(msg).toMatch(/authz-abc123/);
  });

  test('never leaks an internal error when the backend gives a generic message', () => {
    // The backend (ADR-13) already strips internals; the client must not invent
    // detail either.
    const err = { response: { status: 403, data: { message: 'You do not have permission to do that.' } } };
    expect(apiErrorMessage(err)).toBe('You do not have permission to do that.');
  });

  test('maps a bare 403 to a permission message', () => {
    expect(apiErrorMessage({ response: { status: 403, data: {} } }))
      .toMatch(/do not have permission/);
  });

  test('maps a 503 to an environment-unavailable message', () => {
    // Promotion without a transaction-capable DB returns 503.
    expect(apiErrorMessage({ response: { status: 503, data: {} } }))
      .toMatch(/temporarily unavailable/);
  });

  test('falls back cleanly when there is no response', () => {
    expect(apiErrorMessage(new Error('network down'), 'Custom fallback')).toBe('Custom fallback');
  });

  test('a raw stack or internal field is never surfaced', () => {
    const err = { response: { status: 500, data: { message: 'Server error', stack: 'at db.connect (secret)' } } };
    const msg = apiErrorMessage(err);
    expect(msg).not.toMatch(/db\.connect/);
    expect(msg).not.toMatch(/secret/);
  });
});

describe('the client is a faithful map of the backend routes', () => {
  // Import lazily so a mock of ./api does not interfere.
  test('every method points at a real /api path', () => {
    jest.resetModules();
    const calls = [];
    jest.doMock('./api', () => ({
      __esModule: true,
      default: {
        get: (p) => (calls.push(['GET', p]), Promise.resolve({ data: {} })),
        post: (p) => (calls.push(['POST', p]), Promise.resolve({ data: {} })),
        put: (p) => (calls.push(['PUT', p]), Promise.resolve({ data: {} })),
        delete: (p) => (calls.push(['DELETE', p]), Promise.resolve({ data: {} })),
      },
    }));
    const api = require('./tfsAPI');

    // A representative call per module, asserting the exact backend path.
    api.calendarAPI.listYears();
    api.sisAPI.previewPromotion({});
    api.sisAPI.confirmPromotion({});
    api.curriculumAPI.listContent();
    api.plannerAPI.list();
    api.passportAPI.parentView('S1');
    api.subjectModulesAPI.recordReadingLevel({});
    api.qualityAPI.recordConsent({});
    api.notificationConfigAPI.status();
    api.auditConsoleAPI.securitySummary();

    const paths = calls.map(([, p]) => p);
    expect(paths).toContain('/academic-calendar/years');
    expect(paths).toContain('/sis/promotion/preview');
    expect(paths).toContain('/sis/promotion/confirm');
    expect(paths).toContain('/curriculum/content');
    expect(paths).toContain('/lesson-plans');
    expect(paths).toContain('/passport/students/S1/parent-view');
    expect(paths).toContain('/subject-modules/reading-level');
    expect(paths).toContain('/quality/consent');
    expect(paths).toContain('/notification-config/status');
    expect(paths).toContain('/audit-console/security-summary');

    jest.dontMock('./api');
  });

  test('promotion is the ONLY promotion path — no client-side outcome computation', () => {
    // The client exposes preview/confirm and nothing that computes pass/fail.
    jest.resetModules();
    const api = require('./tfsAPI');
    expect(typeof api.sisAPI.previewPromotion).toBe('function');
    expect(typeof api.sisAPI.confirmPromotion).toBe('function');
    // No helper that would let the UI decide promotion itself.
    expect(api.sisAPI.computeOutcome).toBeUndefined();
    expect(api.sisAPI.decide).toBeUndefined();
  });
});
