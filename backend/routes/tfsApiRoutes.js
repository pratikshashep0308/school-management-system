/**
 * tfsApiRoutes — FP-053..FP-059 route aggregation · FINAL LLD 1.1 §23,§25,§26,§28,§32
 *
 * Groups the remaining TFS-EOS API routers. Each sub-path is registered in the
 * route table with its own moduleKey so the matrix gate applies; every mutating
 * route also carries explicit authorize() (SEC-001 mitigation, preserved).
 */
const express = require('express');
const { protect, authorize } = require('../middleware/auth');

const curriculum = require('../controllers/curriculumController');
const planner = require('../controllers/plannerController');
const passport = require('../controllers/passportController');
const subjectModules = require('../controllers/subjectModulesController');
const quality = require('../controllers/qualityController');
const notificationConfig = require('../controllers/notificationConfigController');
const auditConsole = require('../controllers/auditConsoleController');

// ── FP-053 curriculum ─────────────────────────────────────────────────────────
const curriculumRouter = express.Router();
curriculumRouter.use(protect);
curriculumRouter.get('/content', curriculum.listContent);
curriculumRouter.post('/content', authorize('superAdmin', 'schoolAdmin', 'teacher'), curriculum.createContent);
curriculumRouter.post('/content/:id/review', authorize('superAdmin', 'schoolAdmin'), curriculum.reviewContent);
curriculumRouter.get('/best-practices', curriculum.listBestPractices);
curriculumRouter.post('/best-practices', authorize('superAdmin', 'schoolAdmin', 'teacher'), curriculum.createBestPractice);
curriculumRouter.post('/best-practices/:id/transition', authorize('superAdmin', 'schoolAdmin', 'teacher'), curriculum.transitionBestPractice);

// ── FP-054 planner ──────────────────────────────────────────────────────────
const plannerRouter = express.Router();
plannerRouter.use(protect);
plannerRouter.get('/', planner.listPlans);
plannerRouter.post('/', authorize('superAdmin', 'schoolAdmin', 'teacher'), planner.createPlan);
plannerRouter.put('/:id', authorize('superAdmin', 'schoolAdmin', 'teacher'), planner.updatePlan);

// ── FP-055 passport ─────────────────────────────────────────────────────────
const passportRouter = express.Router();
passportRouter.use(protect);
passportRouter.get('/students/:id', passport.staffView);
passportRouter.get('/students/:id/parent-view', passport.parentView);
passportRouter.post('/entries', authorize('superAdmin', 'schoolAdmin', 'teacher'), passport.createEntry);

// ── FP-056 subject modules ────────────────────────────────────────────────────
const subjectRouter = express.Router();
subjectRouter.use(protect);
subjectRouter.post('/reading-level', authorize('superAdmin', 'schoolAdmin', 'teacher'), subjectModules.recordReadingLevel);
subjectRouter.post('/misconception', authorize('superAdmin', 'schoolAdmin', 'teacher'), subjectModules.recordMisconception);
subjectRouter.post('/science', authorize('superAdmin', 'schoolAdmin', 'teacher'), subjectModules.recordScienceInvestigation);

// ── FP-057 quality / consent / insight ────────────────────────────────────────
const qualityRouter = express.Router();
qualityRouter.use(protect);
qualityRouter.get('/indicators', quality.listIndicators);
qualityRouter.post('/indicators', authorize('superAdmin', 'schoolAdmin'), quality.upsertIndicator);
qualityRouter.post('/consent', quality.recordConsent);
qualityRouter.get('/consent/:studentId', quality.consentHistory);
qualityRouter.get('/insights', quality.listInsights);
qualityRouter.post('/insights/:id/review', authorize('superAdmin', 'schoolAdmin'), quality.reviewInsight);

// ── FP-058 notification config (ADR-05 boundary) ──────────────────────────────
const notificationRouter = express.Router();
notificationRouter.use(protect);
notificationRouter.get('/', authorize('superAdmin', 'schoolAdmin'), notificationConfig.list);
notificationRouter.post('/', authorize('superAdmin', 'schoolAdmin'), notificationConfig.upsert);
notificationRouter.get('/status', authorize('superAdmin', 'schoolAdmin'), notificationConfig.status);

// ── FP-059 audit console (ADR-04 governance binding) ──────────────────────────
const auditRouter = express.Router();
auditRouter.use(protect);
// Governance roles get read access; the matrix gate ('auditConsole') plus this
// authorize() are both in force.
auditRouter.get('/', authorize('superAdmin', 'schoolAdmin', 'trustee', 'governanceCommittee'), auditConsole.query);
auditRouter.get('/actions', authorize('superAdmin', 'schoolAdmin', 'trustee', 'governanceCommittee'), auditConsole.actions);
auditRouter.get('/security-summary', authorize('superAdmin', 'schoolAdmin', 'trustee'), auditConsole.securitySummary);

module.exports = {
  curriculumRouter, plannerRouter, passportRouter, subjectRouter,
  qualityRouter, notificationRouter, auditRouter,
};
