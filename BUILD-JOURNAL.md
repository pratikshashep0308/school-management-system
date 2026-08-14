# TFS-EOS Delta Build — Build Journal

**Build Run:** BR-2026-0001 · **Branch:** `feature/tfs-eos-delta-build`
**Gate model:** STATIC · LOCAL UNIT · ENVIRONMENT-DEPENDENT · RELEASE/INSTALLATION

Environment note: MongoDB is not reachable from this build session. Per the
execution model, that defers ENVIRONMENT-DEPENDENT gates only. Code generation,
static validation and local unit tests continue.

---

## BP-000 — Repository and environment baseline

| | |
|---|---|
| Files modified | `backend/config/db.js`, `backend/.env.example` |
| Files added | `BUILD-EVIDENCE/00-baseline.md` |
| Database changes | none |
| Requirement IDs | build infrastructure |
| LLD sections | §26, Appendix S §S.5, §S.10 |
| Commit | `71b938e` |

**Changes.** `requireMongoUri()` exits with an actionable message when `MONGO_URI`
is absent, rather than allowing a silent fallback to a default database.
`assertTransactionSupport()` attempts `startSession()` at boot and exits if
unavailable — D-004 requires multi-document transactions, and a standalone `mongod`
must be caught at startup rather than midway through a promotion batch.
`.env.example` gained `MONGO_URI_TEST`.

**Tests.** Fail-fast path verified by execution. `db.js` loads.

| Gate | Result |
|---|---|
| Static — syntax/load | PASS |
| Static — secret scan | PASS |
| Local unit | NOT APPLICABLE (config only) |
| Environment — `rs.status()`, server start | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |

---

## BP-001 — Test harness and characterisation tests

| | |
|---|---|
| Files modified | `backend/package.json` |
| Files added | `backend/jest.config.js`, `backend/tests/setup.js`, `backend/tests/characterisation/resultGradeHook.test.js`, `backend/tests/characterisation/schemaGuarantees.test.js`, `backend/tests/unit/sanity.test.js` |
| Requirement IDs | GAP-SIS-004, GAP-AE-006, GAP-PA-005, GAP-PD-005, GAP-PLC-005, GAP-NOT-004 |
| LLD sections | §27, §28, ADR-16 |

**Decisions.** ADR-16 closed as Jest + Supertest. Jest matches the existing FMS
tests, so the 14 previously unrunnable FMS test files are now discoverable.

`tests/setup.js` enforces the database guard: it aborts if `MONGO_URI_TEST` equals
`MONGO_URI` (the suites seed and wipe data), and exposes `describeWithDb` so the
environment-dependent tier **skips** rather than fails when no test database is
configured. A skipped tier is announced on every run so it can never be mistaken
for a passing one.

**Characterisation coverage.** The grade hook is pinned by invoking the application
pre-save hook directly against an in-memory document with `Exam` stubbed — no
database needed. All fourteen grade boundaries are asserted, plus rounding
behaviour (2/3 → 67, not 66).

**Tests: 29 passed, 0 failed, 0 not executed.**

| Gate | Result |
|---|---|
| Static — lint/syntax | PASS |
| Local unit — characterisation | PASS (29) |
| Environment — controller/DB behaviour for GAP-PA-005, GAP-PD-005 | PARTIAL: schema-level pinned, request-level NOT EXECUTED — ENVIRONMENT UNAVAILABLE |

---

## BP-002 — Dead-code quarantine and permission fail-open assertion

| | |
|---|---|
| Files modified | `backend/server.js`, `backend/routes/permissionRoutes.js` |
| Files added | `backend/utils/assertModuleKeys.js`, `backend/config/routeTable.js`, `backend/routes/_allRoutes.README.md`, `backend/tests/unit/assertModuleKeys.test.js` |
| Files renamed | `routes/_allRoutes.js` → `routes/_allRoutes.js.unused` |
| Requirement IDs | defect remediation R-14, R-19 |
| LLD sections | §5.0, §8, §9, Appendix R R.3 |

**Changes.** The route table moved to `config/routeTable.js` byte-for-byte, so the
startup assertion can be unit tested without booting the server. `permissionRoutes`
now exposes `MODULES`, `ROLES` and `DEFAULT_GRANTS` as properties **on the router
function**, which keeps `require()` returning a mountable router — server.js is
unaffected.

`assertModuleKeys()` runs before `app.listen()` and throws, naming the offending
key, if any mounted `moduleKey` is missing from `MODULES`. This does **not** change
`checkPermission`'s fail-open behaviour — that is a separate behavioural change
needing its own risk assessment. It closes the gap from the other side: an
unregistered key becomes a startup failure instead of a silent matrix bypass.

`_allRoutes.js` quarantined. Verified by grep that nothing references it.

**Tests: 10 passed** (39 total across the suite).

| Gate | Result |
|---|---|
| Static — syntax, secret scan | PASS |
| Local unit | PASS (39 total) |
| Environment | NOT APPLICABLE |

---

## BP-010 / 012 / 013 / 014 / 030 / 031 — Calendar cluster and AuditLog

| | |
|---|---|
| Files added | `models/AcademicYear.js`, `models/Holiday.js`, `models/SpecialEvent.js`, `models/AuditLog.js`, `services/auditService.js`, `services/calendarService.js`, plus unit suites |
| Files modified | `services/attendanceService.js`, `controllers/attendanceController.js` |
| Requirement IDs | GAP-CAL-001, GAP-CAL-002, GAP-CAL-006, GAP-CAL-007, GAP-CAL-009, GAP-CAL-010, GAP-CAL-011, GAP-AUD-001 |
| LLD sections | §10.2, §10.8, §14, §17.2, §21, §28.1, Appendix R R.2.4–R.2.6, Appendix S §S.4 |
| Commit | `b00b939` |

**The defect being fixed.** `const schoolHolidays = {}` had a setter with no
callers anywhere in the backend, so `isHoliday()` evaluated to
`isWeekend(date) || false` — Sunday-only in practice. Every real school holiday
was invisible, attendance was markable on festival days, and those absences fed
consecutive-absence and sub-75% parent alerts as genuine truancy.

**Design decisions taken.** ONE async helper, not two: LLD §17.2.2 named both a
rewired `isHoliday()` and a parallel `isNonInstructionalDay()` without choosing,
and two helpers with overlapping semantics would recreate the duplicated-check
pattern that caused the original defect. `isHoliday()` is retained as a
deprecated delegating wrapper; `setHolidays()` is a warning no-op so any unseen
consumer fails loudly.

The helper is **async**, so all three call sites are now awaited. The
Specification's claim that call sites require no change is incorrect.

`isNonInstructionalDay()` **fails closed** — if the calendar cannot be read,
attendance marking is blocked. `checkAndSendAlerts` **fails open** by contrast,
falling back to unfiltered counting with a loud log, because suppressing every
parent alert would be worse than an occasional false positive.

`getOverview` now returns `unmarked: 0` with a reason on non-instructional days.
BR-CAL-03 said "suppress reminder", but no reminder mechanism exists in the
codebase — the behaviour that actually needed changing was the unconditional
`unmarked` computation, which produced a full-school alarm on every holiday.

`excused` now leaves the sub-75% denominator entirely. Previously it counted in
the denominator but not the numerator, silently penalising authorised absence.

**Tests: 61 passed.** Both directions proven — a five-day festival break raises
no alert, and a genuine five-day absence still does.

---

## Database and installation packages

| | |
|---|---|
| Files added | `database/migrations/001`, `001.rollback`, `002`, `002.rollback`; `database/indexes/create-indexes.js`; `database/seed/seed-module-keys.js`; `database/validation/validate-db.js`; 8 `scripts/*.sh`; 8 `scripts/*.ps1` |
| Requirement IDs | GAP-CAL-001, GAP-CAL-002, GAP-CAL-006, GAP-IAM-001, GAP-IAM-002, BR-SIS-04 |
| LLD sections | §9, §10.2, §21, §26, Appendix S §S.6.1, §S.11.1 |

**Safety properties built in.** Migration 002 runs the IR-H-06 pre-flight FIRST
and **refuses** to stamp a school whose records predate the active year, rather
than blanket-stamping them — `results` carries no date of its own, so a
mis-stamped `academicYearId` could never be recovered. A dry-run mode is provided.

Migration 001's rollback **refuses** to drop calendar collections that contain
user-entered holidays.

The index script never calls `dropIndex`. The Class unique index on
`{name, section, school}` is protected by D-002 and is untouched.

The seed never lowers or overwrites an existing grant — an administrator's
settings survive re-runs.

`check-mongodb` verifies replica-set capability and explains that a **single-node**
replica set is sufficient, so nobody provisions hardware they do not need.

Academic-year dates are **not defaulted anywhere**. Both the migration and the
installer refuse to run without them, and a static test asserts no hardcoded
year literal was introduced.

**Tests: 67 passed** on the artifact gate, including a secret scan across all 22
generated files.

| Gate | Result |
|---|---|
| Static — syntax, structure, secret scan | PASS (67) |
| Local unit | PASS (128 total) |
| Environment — migration execution against MongoDB | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |
