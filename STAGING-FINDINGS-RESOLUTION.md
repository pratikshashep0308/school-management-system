# TFS-EOS v1.0.0 — Staging Findings Resolution

**Branch:** `fix/tfs-eos-staging-findings` (off the staging-deployed v1.0.0 tree)
**Findings source:** TFS-EOS-v1.0.0-Staging-Findings.md (staging 66.116.251.3, 17 Aug 2026)
**Result:** all 5 findings resolved, test-first. Backend 626/626, Frontend 51/51,
0 failed, 0 skipped — green under **both UTC and IST (Asia/Kolkata)**.

> Accuracy note: the true cross-environment baseline was **611/615**, not the
> `615/0` the MODE-A manifest claimed. The build container ran UTC, which hid the
> three timezone failures (finding #2); the one structural failure was #4b. The
> staging report's number was correct; the manifest's was not. Corrected here.

---

## Finding #1 — Single-day holiday blocked every later day (SEVERE) — FIXED
- **File:** `backend/services/calendarService.js` (`isNonInstructionalDay`, `nonInstructionalDatesInRange`)
- **Cause:** the span query used `$or: [{ endDate: null }, { endDate: { $gte: dayStart } }]`.
  A null `endDate` (single-day holiday) always matched, so every date on or after
  the holiday's date was reported blocked — forever.
- **Fix:** `$or: [{ endDate: null, date: { $gte: dayStart } }, { endDate: { $gte: dayStart } }]`.
  A single-day holiday's effective end is its own date. Applied in both queries.
- **Test:** `calendarServiceQuerySemantics.test.js` — a faithful Mongo-operator
  matcher evaluates the real query: holiday date blocks; next day and two weeks
  later do NOT; a multi-day holiday still blocks its whole span.
- **Why MODE-A missed it:** the original unit test stubbed `findOne` to return a
  fixed holiday without evaluating the query — so a wrong query passed.

## Finding #2 — Timezone shift on non-UTC servers — FIXED
- **File:** `backend/services/calendarService.js` (`startOfDay`/`endOfDay`, Sunday checks)
- **Cause:** `setHours`/`getDay` (local) combined with `.toISOString()` (UTC)
  shifted every date by the server offset on non-UTC servers (staging is IST,
  UTC+5:30).
- **Fix:** `setUTCHours` and `getUTCDay` throughout, so boundaries, weekday
  detection and date strings share one frame.
- **Test:** the 3 previously-failing `calendarService.test.js` cases now pass;
  verified green under UTC, IST (+5:30) and US Pacific (−8).
- **Why MODE-A missed it:** CI ran UTC, where the bug is invisible.

## Finding #3 — Three delta pages unreachable — FIXED
- **Files:** `frontend/src/App.js`, `frontend/src/components/common/Sidebar.js`
- **Cause:** `AcademicCalendar`, `PromotionWorkflow`, `NotificationProviders`
  shipped as unit-tested components but were never added to the router or nav.
- **Fix:** added `<Route>` entries (AdminRoute-gated) in App.js, and nav items +
  `PATH_TO_MODULE` keys (`academicCalendar`/`promotion`/`notificationConfig`,
  matching the seeded matrix) + accent colours in Sidebar.js. (The finding named
  Layout.js; the real nav is Sidebar.js — Layout.js is the top bar.)
- **Test:** `RouteWiring.test.js` — each page is imported, routed on the same line
  as its component, has a nav item, and maps to the correct module key.
- **Why MODE-A missed it:** per-page tests rendered components directly, never the
  router or nav.

## Finding #4b — Stale buildArtifacts assertion — FIXED
- **File:** `backend/tests/unit/buildArtifacts.test.js`
- **Cause:** asserted `database/scripts` exists; the release ships
  `database/{migrations,indexes,seed,validation,lib}` and puts operational scripts
  at the repo root `scripts/`.
- **Fix:** assert the real layout, plus an explicit check that `database/scripts`
  does NOT exist. Test corrected to match reality — not weakened.
- **Note:** finding #4a (jest `roots` including `fms/`) was ALREADY fixed in the
  deployed tree (`jest.config.js` excludes `fms`), matching the report.

## Finding #5 — Migration 001 lacked dry-run — FIXED
- **File:** `database/migrations/001-academic-year-and-calendar.js`
- **Cause:** 001 ignored `TFS_DRY_RUN`, so a dry run silently performed the real
  write (002 already honoured it).
- **Fix:** added the `DRY_RUN` flag, banner, per-write guards (year insert,
  school-label align, collection create) and an early dry-run exit before the
  completion record — matching 002's pattern.
- **Test:** `migrationDryRun.test.js` — both migrations read the flag, announce
  the dry run, and gate writes. Verified via a mongosh-like harness: dry run =
  0 writes; real run = 1 insert, 2 updates, 2 collections (unchanged).

---

## Verification
| Suite | UTC | IST (Asia/Kolkata) |
|-------|-----|--------------------|
| Backend | 626 passed, 36 suites, 0 failed | 626 passed, 36 suites, 0 failed |
| Frontend | 51 passed, 7 suites, 0 failed | 51 passed, 7 suites, 0 failed |

## Scope discipline
- No pre-existing FMS code modified. No provider (ADR-05/10/11) or permission
  policy (ADR-14) introduced. The `v1.0.0` tag was not touched.
- Finding MB-02 from MODE-B (pre-existing `Admission.applicationNumber`
  duplicate-index warning) remains out of scope and unchanged.

## Recommended disposition
Merge `fix/tfs-eos-staging-findings` and cut **v1.0.1**. Re-run the MODE-B guide
against staging to confirm #1/#2 live (create a single-day holiday, verify the
next day is markable) and #3 (the three pages now appear and load).
