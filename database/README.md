# TFS-EOS Delta Build — Database Deliverables

Every script here is **mongosh-compatible**, **additive** (no existing field is
dropped or renamed), **idempotent** (re-running is safe; migrations record
completion in `db.migrations` and exit early), and paired with a **rollback**.
Nothing defaults the academic-year boundaries — they are a school decision
(DEP-01/DEP-02) and drive term validation, so a guessed boundary is refused.

## Required environment variables

| Variable | Required by | Meaning |
|----------|-------------|---------|
| `MONGO_URI` | all | Connection string for the TARGET database. Never defaulted. |
| `TFS_ACADEMIC_YEAR_START` | migration 001 | Term start (e.g. `2026-06-15`). No default. |
| `TFS_ACADEMIC_YEAR_END` | migration 001 | Term end (e.g. `2027-04-30`). No default. |
| `TFS_ACADEMIC_YEAR_NAME` | migration 001 | Label, defaults to `2026-27`. |
| `TFS_DRY_RUN` | migrations | When set, prints intended changes and writes nothing. |

## Canonical execution order

Run against the intended database only. **Preflight and dry-run first.**

```
# 0. Preflight — static completeness/consistency (no DB needed)
node database/preflight.js

# 1. Validate the CURRENT state (read-only) — baseline before changes
mongosh "$MONGO_URI" --file database/validation/validate-db.js

# 2. Migration 001 — academic year + calendar collections
TFS_ACADEMIC_YEAR_START=2026-06-15 TFS_ACADEMIC_YEAR_END=2027-04-30 \
  mongosh "$MONGO_URI" --file database/migrations/001-academic-year-and-calendar.js

# 3. Migration 002 — stamp academicYearId onto existing records
#    Dry run first:
TFS_DRY_RUN=1 mongosh "$MONGO_URI" --file database/migrations/002-academic-year-id-stamping.js
#    Then apply:
mongosh "$MONGO_URI" --file database/migrations/002-academic-year-id-stamping.js

# 4. Indexes
mongosh "$MONGO_URI" --file database/indexes/create-indexes.js

# 5. Seed module keys (RBAC) and optional sample holidays
mongosh "$MONGO_URI" --file database/seed/seed-module-keys.js
node database/seed/import-holidays.js   # optional sample data

# 6. Validate the RESULTING state (read-only) — must pass before go-live
mongosh "$MONGO_URI" --file database/validation/validate-db.js
```

## Rollback

Each migration has a matching `.rollback.js`. Roll back in reverse order (002
then 001). Rollbacks are additive-safe: they remove only what the migration
added and never touch pre-existing records.

```
mongosh "$MONGO_URI" --file database/migrations/002-academic-year-id-stamping.rollback.js
mongosh "$MONGO_URI" --file database/migrations/001-academic-year-and-calendar.rollback.js
```

## Idempotency & safety guarantees

- Re-running any migration after completion is a no-op (guarded by `db.migrations`).
- `TFS_DRY_RUN=1` performs no writes on migration 002.
- `validate-db.js` never writes (exit 0 = all checks pass).
- No script hardcodes a release path or a database name (E-05).
