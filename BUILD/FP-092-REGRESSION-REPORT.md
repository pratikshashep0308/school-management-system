# FP-092 — Full Regression Report

**Build:** TFS-EOS Delta Build (final) · **Branch:** feature/tfs-eos-delta-build-final
**Commit at run:** e71f3aa (FP-091) → this report committed on top

## Result summary

| Layer | Suites | Tests | Passed | Failed | Skipped |
|-------|-------:|------:|-------:|-------:|--------:|
| Backend (unit + integration-guards + integrity + architecture) | 32 | 606 | 606 | 0 | 0 |
| Frontend (pages + utils + components) | 6 | 39 | 39 | 0 | 0 |
| **Total** | **38** | **645** | **645** | **0** | **0** |

No previously-passing test was removed or weakened to achieve green. The one
formerly-skipped test (FP-090 GAP-AI-005 dependency-direction proof, which was
`test.skip` pending FP-080) is now an ACTIVE PASS, not a skip.

## Coverage by tier

- **Calendar / rollover** — calendarService, calendarApi, holidayImport, rollover;
  BR-CAL-08 outside-year guard, E-04 fail-closed calendar.
- **Competency / PLC / curriculum** — competencyLayer, plcCurriculumModels,
  subject models, computeFlagged determinism.
- **Promotion critical path** — examResultProvider (D-001/D-010/D-011),
  promotionService (D-004, one txn per batch), promotionApi (FP-052 single entry
  point), promotionRecord (append-only), promotionIntegrity (FP-090, 9 invariants
  incl. Student.grade-never-present and GAP-AI-005 structural proof).
- **SIS / historical enrolment** — historicalEnrolment (never reads Class.students[]).
- **Parent partnership** — parentMultiChild (GAP-PA-004).
- **Notifications / OTP** — notificationAndOtp (hashed codes, constant-time,
  ADR-05 delivery boundary, secrets never leak).
- **Offline** — offlineSync (null moduleKey /api/sync), offlineQueue (frontend).
- **AI layer** — aiServices (FP-080/081/082/083: ADR-11/ADR-10 pending states,
  copilot no-actions, translation safeguarding gate, GAP-AI-005 isolation).
- **Security** — authorization, authorizationFailClosed (ADR-13),
  securityVerification (FP-091: 401/403 behaviour, token integrity, no leakage).
- **Migration / DB models** — migration002, databaseTierModels, buildArtifacts.
- **Frontend** — AcademicCalendar, PromotionWorkflow, NotificationProviders,
  tfsAPI route map, offlineQueue, Money.

## Environment-dependent items NOT executed (correctly excluded, not failed)

- MongoDB integration tier — NOT EXECUTED — ENVIRONMENT UNAVAILABLE (no MONGO_URI_TEST).
- FP-037 live multi-document transaction — ENVIRONMENT VALIDATION PENDING (U-08).
- FP-025 migration execution against a live DB — ENVIRONMENT VALIDATION PENDING.
- ADR-05 / ADR-10 / ADR-11 concrete provider validation — OPEN DECISION.
- FP-096 MODE-B — ENVIRONMENT VALIDATION PENDING.

These are reported as pending, never as PASS.

## How to reproduce

```
cd backend  && npx jest tests/ --forceExit --ci
cd frontend && CI=true npx react-scripts test --watchAll=false
```
