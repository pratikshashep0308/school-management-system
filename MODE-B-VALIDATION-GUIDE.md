# MODE-B Validation Guide — TFS-EOS Delta Build v1.0.0

MODE-A (build, static, unit, regression, packaging) is complete. MODE-B is the
runtime validation that can only be performed against a **provisioned target
environment**. It was NOT executed in the build environment because no MongoDB
deployment was reachable. This guide hands the exact steps to the deployment
operator.

> **Build machine vs target machine.** Everything below runs on the TARGET
> deployment machine (or a machine with network access to the target MongoDB),
> never on the build machine. The build machine produced the package; it has no
> database.

Every command uses an actual project script. Where a capability has **no project
script**, that is stated explicitly rather than inventing one.

---

## STEP 1 — Set MONGO_URI
```
# Linux/macOS
export MONGO_URI="mongodb+srv://<user>:<pass>@<host>/<db>?retryWrites=true&w=majority"
# PowerShell
$env:MONGO_URI = "mongodb+srv://<user>:<pass>@<host>/<db>?retryWrites=true&w=majority"
```
There is no localhost fallback by design. If MONGO_URI is unset, every DB script
refuses to run.

## STEP 2 — Validate MongoDB version & reachability
```
./scripts/check-mongodb.sh          # Linux/macOS
.\scripts\check-mongodb.ps1         # Windows
```
Exit 0 = reachable. Exit 1 = MONGO_URI missing. Exit 2 = unreachable. Exit 3 = no
transaction support.

## STEP 3 — Validate replica-set / transaction capability
`check-mongodb` (Step 2) returns exit code 3 if the deployment cannot support
multi-document transactions. Promotion (D-004) requires a replica set or a
transaction-capable cluster (Atlas satisfies this by default). Do not proceed to
migration if Step 2 reported no transaction support.

## STEP 4 — Validate target database identity
Confirm the database name embedded in MONGO_URI is the intended target. Run the
read-only validator, which prints the connection target before any checks:
```
./scripts/validate-db.sh            # Linux/macOS  (read-only; safe pre-migration)
.\scripts\validate-db.ps1           # Windows
```

## STEP 5 — Migration pre-flight (static, no DB writes)
```
node database/preflight.js
```
Confirms migration/rollback pairing, idempotency guards, no defaulted year
boundary, and read-only validation. Exit 0 = ready.

## STEP 6 — Migration dry-run (no writes)
```
export TFS_ACADEMIC_YEAR_START=2026-06-15
export TFS_ACADEMIC_YEAR_END=2027-04-30
TFS_DRY_RUN=1 ./scripts/migrate.sh   # reports intended changes for migration 002
```
(PowerShell: set the same variables with `$env:` and run `.\scripts\migrate.ps1`.)

## STEP 7 — Execute migration
```
./scripts/migrate.sh                 # Linux/macOS
.\scripts\migrate.ps1                # Windows
```
Migrations are idempotent (re-running is a no-op once complete). Migration 002 is
effectively irreversible for mis-stamped years — the dry-run in Step 6 is your
safeguard.

## STEP 8 — Create / verify indexes
```
mongosh "$MONGO_URI" --file database/indexes/create-indexes.js
```

## STEP 9 — Seed (RBAC module keys; optional sample holidays)
```
./scripts/seed.sh                    # grants new module keys (non-destructive)
./scripts/import-holidays.sh database/seed/holidays.sample.json --dry-run   # optional
```

## STEP 10 — Database validation (read-only)
```
./scripts/validate-db.sh
```
Exit 0 = the database matches the approved design.

## STEP 11 — Start backend
```
./scripts/start.sh                   # uses PM2 if present, else foreground
```

## STEP 12 — Health check
```
curl -fsS http://localhost:5000/api/health
```
(Adjust the port to your backend .env PORT. The endpoint is `/api/health`.)

## STEP 13 — API smoke tests
**No dedicated smoke-test script ships with this build.** Perform a minimal
manual smoke test: authenticate, then exercise one read route per major module
(students, calendar, promotion preview). A scripted smoke suite is a recommended
MODE-B addition but is not part of the current deliverable — do not assume one
exists.

## STEP 14 — Start / serve frontend
```
cd frontend && npm ci && npm run build     # produces the production bundle
# serve the build/ directory with your web server, or:
npm start                                   # dev server (non-production)
```

## STEP 15 — E2E tests
**No E2E/browser automation harness ships with this build.** Offline behaviour
was unit-verified (queue + server replay); real-device/network E2E is a MODE-B
activity requiring a harness that is not part of this deliverable. Identify/adopt
one (e.g. Playwright/Cypress) before recording an E2E result. Do not report E2E
as passed until such a harness has actually run.

## STEP 16 — Verify promotion transaction behaviour against REAL MongoDB
With a transaction-capable deployment, run a promotion batch through the API and
confirm: exactly-one-class per promoted student, a PromotionRecord per student,
and — critically — that a forced mid-batch failure rolls the WHOLE batch back
(no partial promotion). The integrity invariants are specified in
`backend/tests/integrity/promotionIntegrity.test.js`; MODE-B repeats them against
live MongoDB rather than the in-memory layer.

## STEP 17 — Verify rollback behaviour
```
mongosh "$MONGO_URI" --file database/migrations/002-academic-year-id-stamping.rollback.js
mongosh "$MONGO_URI" --file database/migrations/001-academic-year-and-calendar.rollback.js
```
Confirm the rollbacks remove only what the migrations added.

## STEP 18 — Verify audit logging
Perform an audited action (e.g. a promotion) and confirm an append-only audit
record is written and that no update/delete path exists for it.

## STEP 19 — Verify authorization
Confirm behaviourally: an unauthenticated request → 401; a wrong-role request →
403; and, if the authorization infrastructure is made to fail, the request is
DENIED (403, opaque reference) — ADR-13 fail-closed. The build-time proofs are in
`securityVerification.test.js` and `authorizationFailClosed.test.js`.

## STEP 20 — Record final MODE-B result
Record, per step: command run, exit code, and PASS/FAIL. A MODE-B PASS requires
Steps 2–12 and 16–19 to pass against the real environment. Steps 13 and 15
require harnesses not shipped here; note them as pending until adopted.

---

### Open decisions that affect MODE-B
- **ADR-05 / ADR-10 / ADR-11:** notification, translation, and LLM providers are
  unconfigured boundaries. Their features report a pending state; do not expect
  live delivery/generation until a provider is registered.
- **ADR-14:** the permission matrix has an approved fail-open gap for unknown
  keys. Do not invent a policy to close it during MODE-B.
