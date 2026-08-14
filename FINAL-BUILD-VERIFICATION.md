# TFS-EOS Delta Build — Final Build Verification

**Build Run:** BR-2026-0001 · **Version:** 1.0.0-rc1 · **Branch:** `feature/tfs-eos-delta-build`
**Date:** 14 August 2026

---

## Status

```
BUILD RELEASE CANDIDATE:        PASS
MONGODB INSTALLATION VALIDATION: PENDING
ATLAS VALIDATION:                PENDING
E2E ENVIRONMENT VALIDATION:      PENDING
```

**This is not a final release.** Both `BUILD COMPLETE` and
`ENVIRONMENT VALIDATION COMPLETE` are required before that claim, and the second
has not been performed. No environment check was executed and none is reported
as passed.

---

## Part A — Code verification

Everything below ran and passed in this build session.

| Gate | Tier | Result | Evidence |
|---|---|---|---|
| Module load / syntax | STATIC | **PASS** | All models, services, controllers and scripts load |
| Secret scan | STATIC | **PASS** | 22 generated files; 0 credentials; `.env` gitignored and excluded from the package |
| Migration script syntax | STATIC | **PASS** | 4 migration files + index, seed, validation |
| Shell script syntax | STATIC | **PASS** | 8 Bash scripts via `bash -n` |
| Package structure | STATIC | **PASS** | Extracted and verified; no `.env`, no `node_modules`, no `.git` |
| Checksum | STATIC | **PASS** | SHA-256 verified against the extracted archive |
| Characterisation | LOCAL UNIT | **PASS (29)** | The six no-change guarantees |
| Permission assertion | LOCAL UNIT | **PASS (10)** | Fail-open closed at startup |
| Calendar service | LOCAL UNIT | **PASS (14)** | Including fail-closed and memoisation |
| Attendance alerts | LOCAL UNIT | **PASS (8)** | Closures excluded; genuine truancy still alerts |
| Build artifacts | STATIC | **PASS (67)** | Migration safety, rollback presence, secret scan |
| **Total** | | **128 passed, 0 failed** | |

### Backward compatibility

All six no-change guarantees are pinned by executing tests, not by assertion:

| Requirement | How it is pinned |
|---|---|
| GAP-AE-006 | The `Result` pre-save hook is invoked directly against an in-memory document with `Exam` stubbed. All fourteen grade boundaries plus rounding (2/3 → 67, not 66) |
| GAP-SIS-004 | `Admission` registered; `Student.documents[]` present |
| GAP-PLC-005 | RSVP and attendance paths present; `MEETING` type enum retains `staff` |
| GAP-NOT-004 | `audience`, `priority`, `readBy[]`, `actionLog[]`, `isEmailSent`, `isSMSSent` all present |
| GAP-PA-005 / GAP-PD-005 | Schema level pinned; request-level behaviour is environment-dependent |

Structural invariants also asserted: `Student.grade` does not exist,
`Meeting.actionItems` retains `assignedTo`/`done` and not `owner`/`status`,
`Class` carries no `academicYear`, `RolePermission.permissions` is a `Map`.

---

## Part B — Environment verification

**NOT EXECUTED. ENVIRONMENT UNAVAILABLE.**

TCP to the MongoDB deployment times out from the build environment: the egress
proxy permits HTTPS to an allowlist, and the MongoDB wire protocol is not
proxyable. This defers environment-dependent verification only; it did not block
code generation, static validation or local unit testing.

| Check | Status |
|---|---|
| MongoDB connectivity | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |
| MongoDB version | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |
| Replica set / transaction capability | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |
| Migration 001 execution | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |
| Migration 002 execution and pre-flight | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |
| Index creation | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |
| Seed execution | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |
| `validate-db` execution | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |
| Integration test tier | NOT EXECUTED — requires `MONGO_URI_TEST` |
| Application start | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |
| E2E workflows | NOT EXECUTED — ENVIRONMENT UNAVAILABLE |
| Installation validation | NOT EXECUTED — TARGET ENVIRONMENT UNAVAILABLE |

### Completing Part B

```bash
./scripts/check-mongodb.sh
export TFS_ACADEMIC_YEAR_START=2026-04-01 TFS_ACADEMIC_YEAR_END=2027-03-31
TFS_DRY_RUN=1 mongosh "$MONGO_URI" --file database/migrations/002-academic-year-id-stamping.js
./scripts/migrate.sh && ./scripts/seed.sh && ./scripts/validate-db.sh
cd backend && MONGO_URI_TEST=<separate db> npm test
```

Then re-issue this report with Part B populated.

---

## Part C — Build prompt progress

| | |
|---|---|
| Total build prompts | 59 |
| Executed and passed | 8 |
| Gated (awaiting sign-off) | 4 |
| Not started | 47 |

**Executed:** BP-000, BP-001, BP-002, BP-010, BP-012, BP-013, BP-014, BP-030,
BP-031 (calendar cluster delivered as one coherent unit), plus the database and
installation packages.

**Gated:** BP-036 and BP-034 need sign-off on LLD §S.11.2 (exam announcement
granularity) and §S.11.3 (promotion publication gating). BP-052's promotion
endpoints inherit that; its parent multi-child fix is not gated. BP-098 needs
GitHub credentials and target filesystem access.

---

## Part D — Open inputs

| Input | Blocks | Type |
|---|---|---|
| `TFS_ACADEMIC_YEAR_START` / `_END` | Migration 001, GAP-CAL-003 | Data |
| Sign-off on LLD §S.11.2 | BP-036, BP-034, BP-052 | Decision |
| Sign-off on LLD §S.11.3 | BP-036, BP-034, BP-052 | Decision |
| Original Level 1 requirements, or a waiver | Full traceability verification | Artifact |
| Reachable MongoDB | All of Part B | Environment |

Academic year dates are deliberately not defaulted anywhere — a static test
asserts no hardcoded year literal was introduced. A guessed boundary would
silently mis-scope every record stamped against it, and migration 002 cannot be
reversed in the way that matters: `results` carries no date of its own.

---

## Part E — Requirement compliance (partial)

Of 115 requirements, this session implemented or partially implemented:

| Requirement | State |
|---|---|
| GAP-CAL-001 | IMPLEMENTED — model, migration, index; ENVIRONMENT VALIDATION PENDING |
| GAP-CAL-002 | VERIFIED (static + unit) — persisted holidays block attendance |
| GAP-CAL-006 | IMPLEMENTED — `SpecialEvent` with independent flags |
| GAP-CAL-007 | VERIFIED — single helper, no duplicate date logic |
| GAP-CAL-009 | VERIFIED — block awaited, structured error code, legacy message retained |
| GAP-CAL-010 | VERIFIED — closures excluded from numerator and denominator |
| GAP-CAL-011 | VERIFIED — `getOverview` returns `unmarked: 0` with a reason |
| GAP-AUD-001 | IMPLEMENTED — collection and `audit()` helper |
| GAP-IAM-002 | PARTIAL — startup assertion and seed done; `MODULES` code change pending BP-040 |
| GAP-SIS-004, AE-006, PA-005, PD-005, PLC-005, NOT-004 | VERIFIED — pinned by characterisation tests |

No requirement was marked VERIFIED on the strength of a test that did not execute.

---

## Package

| | |
|---|---|
| File | `TFS-EOS-DELTA-BUILD-v1.0-FINAL.zip` |
| Size | 4.4 MB |
| SHA-256 | `968cb27df4ade83e07f8cf02119267430c42b212a8fc2a291ee6ed74d467215a` |
| Structural validation | PASS — extracted and verified |
| Secrets | 0 — `.env` and `node_modules` excluded |
