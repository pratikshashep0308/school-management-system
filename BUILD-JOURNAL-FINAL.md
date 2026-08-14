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

---

## DOMAIN & SERVICES tier — FP-034, FP-035, FP-036, FP-037

**Commit `19d86ad`** · 412 tests, 19 suites, 0 failures

### FP-034 — rolloverService

Carries forward exactly two things (D-003). The new year is created as **draft**,
not active: promotion needs it to exist before it can set `toAcademicYear`, but it
must not activate until it begins.

The Class model is stubbed to record any write attempt and the test asserts zero — D-002
compliance is proven, not claimed.

Maharashtra's year crosses a calendar boundary, so a June holiday shifts into the start
year and a January one into the following year. **29 February is clamped to 28 in a
non-leap year and reported**, rather than silently becoming 1 March and moving a school
closure by a day.

### FP-035 — historicalEnrolmentService

The central assertion is negative. `Class.students[]` would return today's cohort
labelled as last year's — not a partial answer but a wrong one that looks plausible. The
Class model is stubbed to record access and every test asserts it is never touched.

The first-year fallback is labelled `derived`, never `transition-backed`, so a caller can
distinguish evidence from inference.

### FP-036 — examResultProvider

The single seam between assessment and promotion, which is what makes D-001 enforceable
rather than aspirational — one place to check.

Legacy `Result` reads are recorded against a stubbed model and asserted empty.

**Retest resolution.** Policy is read from the **retest** group, not the original: a
school decides "this counts as best-of" when scheduling the retest, and the original exam
was set before anyone knew one would be needed. Chained retests resolve against the
**full set**, not pairwise — pairwise `best` would discard a higher earlier mark, tested
explicitly with 30 → 80 → 50 expecting 80.

### FP-037 — promotionService

All ten mandated integrity checks covered. **Live transaction validation remains
ENVIRONMENT VALIDATION PENDING**; the unit tests use a mocked session and prove the call
sequence, not that MongoDB honoured it.

One transaction per **batch**, with one `$pull` and one `$addToSet` per class pair.
Forty per-student transactions on the same `Class.students[]` document would produce
write conflicts; D-004 mandates atomicity, not per-student granularity.

`$addToSet` rather than `$push` makes a repeated target write idempotent by construction.

The membership pre-condition converts a silent `$pull` no-op into
`PROMOTION_SOURCE_MEMBERSHIP_MISMATCH`. Without it a promotion over drifted data would
report success.

**No fallback to sequential writes.** Forcing `startSession()` to fail is asserted to
throw `TRANSACTIONS_UNAVAILABLE` naming the single-node remedy, having written nothing.

### Defects found and fixed before commit

| Defect | Resolution |
|---|---|
| Test required `models/Class`, which is registered by `models/index.js` | Corrected the require |
| The anti-fallback assertion matched **its own explanatory comment** | Replaced with a behavioural test that forces `startSession()` to fail |

---

## DATABASE tier close-out — FP-020, FP-021, FP-022, FP-023, FP-025

**Commit `c2fc283`** · 492 tests, 23 suites, 0 failures

FP-020 PassportEntry: safeguarding is enforced in `parentVisibleFilter()`, which excludes
wellbeing entries by **type as well as visibility** — a wellbeing entry mis-set to
`parent` still cannot leak. GAP-SIS-001 resolves to *no* new field: `Student.learningPassportId`
is not created, because entries are queried by `student` and a pointer would be a second
representation able to drift.

FP-021 subject models: the misconception flag is derived by `computeFlagged`, run on both
validate and save and exposed as a static — not left in a `pre('validate')` hook that
`validateSync()` skips.

FP-022 Insight rejects any record without an explanation or a source reference; Consent is
append-only across save and the four query update paths. Insight *generation* stays
ADR-11-pending (FP-080).

FP-023 NotificationProviderConfig carries **no plaintext credential field at all** — only
`credentialsRef`. `toSafeJSON` returns a `credentialConfigured` boolean and the reference
never appears in output.

FP-025 migration: the canonical mongosh migration is retained; a programmatic twin at
`database/lib/stamp-academic-year.js` carries identical logic as a Node module so the
pre-flight, dry-run and idempotency behaviour is unit-tested with a fake db handle. The
**pre-flight refuses** if any record predates the active year — `Result` has no date of its
own, so a mis-stamp is unrecoverable and refusing is the only safe behaviour. Neither file
has been executed against a real MongoDB: **ENVIRONMENT VALIDATION PENDING**.

### SEC-001 recorded

`checkPermission` fails open at **five** paths, not four — the `catch` block (error → allow)
at line 120 is the fifth and most consequential, since a transient DB error during permission
lookup results in the request being allowed. Documented as **RELEASE RISK / DECISION REQUIRED**
(proposed ADR-13), explicitly not PASS and not FAIL. Full analysis in
`BUILD-EVIDENCE/SECURITY-FINDING-SEC-001-checkPermission-failopen.md`.

### Defects found and fixed

| Defect | Resolution |
|---|---|
| `NumeracyMisconception.flagged` set only in `pre('validate')`, which `validateSync()` skips | Moved to a deterministic `computeFlagged` static, run on validate and save |
| My Node-style 002 **overwrote the canonical mongosh 002** and added a duplicate dash-named rollback, breaking `buildArtifacts.test.js` | Restored the canonical migration; kept the tested logic as `database/lib/stamp-academic-year.js`; repointed the suite |
| Two model tests used `validateSync()` / `enumValues` incorrectly | Corrected to behavioural assertions |
