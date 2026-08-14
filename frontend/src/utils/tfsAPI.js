// frontend/src/utils/tfsAPI.js
//
// TFS-EOS Delta Build — API client.
//
// Every path here was read from backend/routes/*.js and config/routeTable.js,
// not inferred. If an endpoint is not in the backend, it is not in this file —
// a missing endpoint is a FRONTEND/API CONTRACT GAP to report, never something
// to invent here.
//
// Uses the shared axios instance from './api', which already handles the base
// URL, the JWT header and 401 redirects.
//
// Authorization note: the backend is authoritative. Nothing here grants access;
// the helpers below only shape requests and surface the server's own errors.

import api from './api';

// ── Academic calendar (FP-050) · /api/academic-calendar ───────────────────────
export const calendarAPI = {
  listYears: () => api.get('/academic-calendar/years'),
  createYear: (body) => api.post('/academic-calendar/years', body),
  activateYear: (id) => api.post(`/academic-calendar/years/${id}/activate`),
  listHolidays: (yearId) => api.get('/academic-calendar/holidays', { params: { yearId } }),
  createHoliday: (body) => api.post('/academic-calendar/holidays', body),
  deleteHoliday: (id) => api.delete(`/academic-calendar/holidays/${id}`),
  dayStatus: (date) => api.get('/academic-calendar/day-status', { params: { date } }),
  workingDays: (yearId) => api.get('/academic-calendar/working-days', { params: { yearId } }),
};

// ── SIS / promotion (FP-052) · /api/sis ───────────────────────────────────────
// Promotion flows through this API and only this API (FP-052 is the single
// entry point). The client never computes a promotion outcome itself.
export const sisAPI = {
  previewPromotion: (body) => api.post('/sis/promotion/preview', body),
  confirmPromotion: (body) => api.post('/sis/promotion/confirm', body),
  studentHistory: (id) => api.get(`/sis/students/${id}/history`),
  classRoster: (id, academicYearId) => api.get(`/sis/classes/${id}/roster`, { params: { academicYearId } }),
  announcementScope: (examGroupId) => api.get(`/sis/exam-groups/${examGroupId}/announcement-scope`),
};

// ── Curriculum + best practice (FP-053) · /api/curriculum ─────────────────────
export const curriculumAPI = {
  listContent: (params) => api.get('/curriculum/content', { params }),
  createContent: (body) => api.post('/curriculum/content', body),
  reviewContent: (id, body) => api.post(`/curriculum/content/${id}/review`, body),
  listBestPractices: (params) => api.get('/curriculum/best-practices', { params }),
  createBestPractice: (body) => api.post('/curriculum/best-practices', body),
  transitionBestPractice: (id, status) => api.post(`/curriculum/best-practices/${id}/transition`, { status }),
};

// ── Lesson planner (FP-054) · /api/lesson-plans ───────────────────────────────
export const plannerAPI = {
  list: (params) => api.get('/lesson-plans', { params }),
  create: (body) => api.post('/lesson-plans', body),
  update: (id, body) => api.put(`/lesson-plans/${id}`, body),
};

// ── Learning passport (FP-055) · /api/passport ────────────────────────────────
export const passportAPI = {
  staffView: (studentId) => api.get(`/passport/students/${studentId}`),
  parentView: (studentId) => api.get(`/passport/students/${studentId}/parent-view`),
  createEntry: (body) => api.post('/passport/entries', body),
};

// ── Subject modules (FP-056) · /api/subject-modules ───────────────────────────
export const subjectModulesAPI = {
  recordReadingLevel: (body) => api.post('/subject-modules/reading-level', body),
  recordMisconception: (body) => api.post('/subject-modules/misconception', body),
  recordScience: (body) => api.post('/subject-modules/science', body),
};

// ── Quality / consent / insight (FP-057) · /api/quality ───────────────────────
export const qualityAPI = {
  listIndicators: () => api.get('/quality/indicators'),
  upsertIndicator: (body) => api.post('/quality/indicators', body),
  recordConsent: (body) => api.post('/quality/consent', body),
  consentHistory: (studentId) => api.get(`/quality/consent/${studentId}`),
  listInsights: (params) => api.get('/quality/insights', { params }),
  reviewInsight: (id, decision) => api.post(`/quality/insights/${id}/review`, { decision }),
};

// ── Notification provider config (FP-058) · /api/notification-config ──────────
// The client never sends a raw secret. credentialsRef is a reference the backend
// validates (env:/secret:/vault:).
export const notificationConfigAPI = {
  list: () => api.get('/notification-config'),
  upsert: (body) => api.post('/notification-config', body),
  status: () => api.get('/notification-config/status'),
};

// ── Audit console (FP-059) · /api/audit-console ───────────────────────────────
export const auditConsoleAPI = {
  query: (params) => api.get('/audit-console', { params }),
  actions: () => api.get('/audit-console/actions'),
  securitySummary: (since) => api.get('/audit-console/security-summary', { params: { since } }),
};

/**
 * Extract a safe, user-facing message from an API error.
 *
 * The backend already strips internal detail from authorization failures
 * (ADR-13) and other errors, returning a generic message plus an optional ref.
 * This surfaces that message and never digs into stack traces or internal fields.
 */
export function apiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const data = err?.response?.data;
  if (data?.message) {
    return data.ref ? `${data.message} (ref: ${data.ref})` : data.message;
  }
  if (err?.response?.status === 403) return 'You do not have permission to do that.';
  if (err?.response?.status === 503) return 'This feature is temporarily unavailable in this environment.';
  return fallback;
}
