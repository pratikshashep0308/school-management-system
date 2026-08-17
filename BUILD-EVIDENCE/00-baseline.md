# BP-000 — Repository and Environment Baseline

**Build Run:** BR-2026-0001 · **Stage:** BP-000 · **Date:** 14 August 2026
**Branch:** feature/tfs-eos-delta-build · **Baseline commit:** cd81c50

## Pre-change inventory (the regression reference)

| Item | Count |
|---|---|
| Backend model files | 19 |
| Registered Mongoose models | 41 |
| Route files | 29 |
| Controllers | 15 |
| Services | 8 |
| Jobs | 1 |
| Frontend pages | 39 |
| Test files (all in backend/fms) | 15 |
| Core backend tests | 0 |

## Changes made

- `backend/config/db.js` — added `requireMongoUri()` fail-fast and `assertTransactionSupport()` boot assertion (D-004 prerequisite). Existing connection logic and stale-index drops left untouched.
- `backend/.env.example` — added `MONGO_URI_TEST` placeholder with a note that it must differ from `MONGO_URI`.
- No other file modified. No model, route, controller or service touched.

## Gate results

| Gate | Status | Evidence |
|---|---|---|
| prompt_validation | passed | BP-000.md resolved from manifest |
| repository_analysis | passed | Inventory above |
| lint | warning | No lint script configured in backend/package.json (advisory gate) |
| unit_tests | **blocked** | No test runner yet — BP-001 installs it |
| secret_scan | passed | No literal credential in any tracked file; `.env` gitignored (line 2) |
| acceptance_criteria | **partial** | See below |

### Acceptance criteria detail

| Criterion | Result |
|---|---|
| Git branch created from baseline | **passed** |
| `.env` gitignored, no credential in a tracked file | **passed** |
| Fail-fast on missing MONGO_URI | **passed** — verified by execution |
| Pre-change file inventory recorded | **passed** |
| `rs.status()` returns a replica set; setName recorded | **blocked** — no database reachable |
| Server starts against the target database | **blocked** — no database reachable |

## Stage verdict

**NOT COMPLETE.** Four of six acceptance criteria pass; two are blocked by environment, and one mandatory gate (`unit_tests`) is blocked.

Per `build/guardrails.md` §9 and the orchestrator's core rule, **BP-001 does not begin.** The two blocked criteria and the blocked gate all resolve on a machine with network access to the MongoDB deployment.
