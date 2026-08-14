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
