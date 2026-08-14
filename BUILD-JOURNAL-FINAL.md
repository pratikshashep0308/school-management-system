# BUILD JOURNAL — FINAL EXECUTION

**Baseline:** FINAL LLD 1.1 · Decision Register Rev 2 · Amendment A-01
**Branch:** `feature/tfs-eos-delta-build-final` · **Series:** FP (the BP set is historical evidence only)

---

## Verification group — FP-001, 002, 003, 010, 011, 012, 013, 030, 031

**Result: ALL 9 ALREADY COMPLIANT. No code rewritten.**

Per §3 of the execution authorisation, these were inspected against FINAL LLD 1.1 rather than
rebuilt. No commit was created for them — a commit with no change is not evidence.

| Prompt | Verified against | Result |
|---|---|---|
| FP-001 | §E.1 | `assertTransactionSupport`, `requireMongoUri` fail-fast, `MONGO_URI_TEST`, `.env` gitignored |
| FP-002 | §48 | Jest+Supertest, characterisation suite, test-DB guard |
| FP-003 | §31, §44 | Startup assertion wired, dead code quarantined, registry exported |
| FP-010 | §10.1, §15 | Embedded terms, `isActive`, status enum draft/active/closed |
| FP-011 | §21 | `recurringAnnually` defaults false, `endDate` range |
| FP-012 | §21 | Both flags independent and correctly defaulted |
| FP-013 | §28 | Actor snapshots, before/after/source, `audit()` + failure counter |
| FP-030 | §20 | BR-CAL-08 guard (E-02), fails closed (E-04), 3 awaited sites, deprecated shims |
| FP-031 | §21.1 | Excused leaves denominator (E-03), fails open (E-04), `getOverview` returns 0 |

---

## FP-014 — PromotionRecord

**Result: PASS. 21 tests.**

| | |
|---|---|
| Requirements | GAP-SIS-005, GAP-SIS-007, GAP-SIS-008 |
| LLD / Decisions | §10.1, §18.3 · D-004, D-006 |
| Files added | `backend/models/PromotionRecord.js`, `backend/tests/unit/promotionRecord.test.js` |
| MongoDB required | No — schema validation runs in memory |

`fromClass`/`toClass` are ObjectId identity; the grade/section strings are denormalised
readability aids so a record stays legible after a Class is renamed, and are never used to resolve
identity.

**Append-only enforced on every mutating path.** A document `pre('save')` hook alone would not
have caught `updateOne`, `updateMany`, `findOneAndUpdate` or `replaceOne` — those bypass document
hooks entirely. Query-level hooks were added and each is tested.

Decision coherence is enforced rather than assumed: `promoted` must name a target class,
`graduated` must not.

---

## FP-024 — Additive field extensions (R-3, M-01, R-1)

**Result: PASS. 18 tests.**

| | |
|---|---|
| Requirements | GAP-CFG-002, GAP-CFG-003, GAP-PLC-001 (+ others deferred to later prompts) |
| Decisions | R-3, M-01, R-1 |
| Files modified | `backend/models/School.js`, `backend/models/Meeting.js` |

**R-3** — `School.aiThresholds` now carries **both** `attendanceWarningPct` (75) and
`attendanceCriticalPct` (60), with validation rejecting `critical >= warning`. That ordering is not
cosmetic: without it a student could be "critical" without ever being "warning", so alerts would
skip a level.

**M-01** — `meetingSubtype` and `lessonStudyCycle` are now explicitly declared. `strict: false` is
retained for genuinely unknown future fields but is no longer relied upon for these two: a typo
such as `PCL` is now rejected instead of silently stored where no query would ever match it.
Existing Meeting documents remain valid — asserted.

The `meetingSubtype` enum carries **only** `plc`, the one value the approved requirement defines.
`lessonStudyCycle` is left unconstrained because no requirement enumerates its states.

**R-1** — `actionItems` untouched. A test asserts `owner` and `status` are **absent**.

---

## FP-032 / FP-033 — Threshold configuration and presentation bands

**Result: PASS. 33 tests.**

| | |
|---|---|
| Decisions | R-3, R-2 · Amendment A-01.3, A-01.4 |
| Files added | `backend/config/attendanceThresholds.js`, `backend/config/presentationBands.js` |
| Files modified | `backend/services/attendanceService.js`, `backend/controllers/attendanceController.js` |

**All eleven threshold literals replaced.** The defect was not merely duplication: the same rule
existed as `percentage < 75` at line 133 and `< 0.75` at line 178. `ratioToPct` converts the
**ratio**, never the threshold, so the two spellings cannot diverge — proven by a test that runs
both paths over the same data and asserts an identical verdict.

**R-2 independence is structural, not documented.** `attendanceBand()` takes no school argument at
all, so coupling colour to business thresholds is impossible rather than merely discouraged. A test
asserts `attendanceBand.length === 1`.

### Defect found and fixed during this prompt

The initial edit referenced `schoolDoc` in `checkAndSendAlerts` and `school` in the two analytics
functions — **neither was in scope.** Caught by inspection before commit. A `loadSchoolConfig()`
helper now loads the configuration once per operation and degrades to the approved defaults with a
warning if the School document cannot be read, so a missing School never breaks alerting.

---

## FP-052 (split) — GAP-PA-004 parent multi-child resolution

**Result: PASS. 10 tests.**

Executed independently per §10 of the authorisation. **Not blocked by U-08** — only the promotion
endpoints in FP-052 carry that constraint.

| | |
|---|---|
| Requirements | GAP-PA-004 |
| Files modified | `backend/controllers/studentPortalController.js` |

`Student.findOne({parentId})` became `Student.find(...)` via a new `resolveChildren()` helper. The
existing ParentDashboard switcher UI (lines 298, 361, 455-481) is **preserved, not rebuilt** — it
was already correct and was simply never receiving more than one child.

Legacy `parentEmail` linkage is preserved and still backfills `parentId`, so the email path remains
a one-time cost per student. Children matched by both paths are not duplicated.

A parent with one child behaves exactly as before — asserted as a regression test.

---

## Test status

| Tier | Status |
|---|---|
| A Static | PASS |
| B Unit | PASS |
| C Local integration | PASS |
| D Database-dependent | **NOT EXECUTED — ENVIRONMENT UNAVAILABLE** |
| E External-service | **NOT EXECUTED — DEPENDENCY PENDING** (ADR-05, ADR-10, ADR-11) |
| F E2E | **NOT EXECUTED — ENVIRONMENT UNAVAILABLE** |
| G Security | Partial — static and unit portions pass |
| H Regression | PASS — all six characterisation guarantees green |
