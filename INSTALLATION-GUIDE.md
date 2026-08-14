# TFS-EOS Delta Build — Installation Guide

Every command below corresponds to a script that exists in this package.

---

## 1. What this is

A **delta build** on the existing EduCore school management platform, adding the
TFS-EOS academic calendar, audit trail and supporting infrastructure. It modifies
the existing application; it is not a separate product and does not replace your
current installation.

## 2. System requirements

| | |
|---|---|
| OS | Windows 10/11, Ubuntu 20.04+, macOS 12+ |
| Node.js | 18 or later |
| MongoDB | 4.4 or later, **running as a replica set** (see §5) |
| mongosh | required for migrations |
| RAM | 2 GB minimum, 4 GB recommended |
| Disk | 2 GB plus data |

## 3. Check prerequisites

```bash
./scripts/check-prerequisites.sh        # Linux / macOS
.\scripts\check-prerequisites.ps1       # Windows
```

Exit 0 means ready. Exit 1 lists what is missing.

## 4. Configure the connection

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```
MONGO_URI=mongodb://localhost:27017/tfs_eos?replicaSet=rs0
MONGO_URI_TEST=mongodb://localhost:27017/tfs_eos_test?replicaSet=rs0
JWT_SECRET=<a long random string>
```

Atlas is equally supported:

```
MONGO_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/tfs_eos
```

Three things matter here.

`MONGO_URI` has **no default**. The application exits at startup if it is unset
rather than falling back to localhost, because a silent fallback would write to
an unintended database.

`MONGO_URI_TEST` must name a **different database**. The test suites seed and
wipe data; `tests/setup.js` aborts if the two are identical.

`.env` is gitignored. Never commit it.

## 5. MongoDB replica set — required

Promotion runs as a single multi-document transaction (approved decision D-004).
Those transactions throw on a standalone `mongod`. A partial promotion would
leave `Student.class` and `Class.students[]` disagreeing with no way to tell
which is correct, so this is enforced rather than advised.

**A single-node replica set is sufficient.** No extra hardware, no data migration.

```bash
mongod --dbpath /var/lib/mongodb --replSet rs0
mongosh --eval "rs.initiate()"
```

Then add `?replicaSet=rs0` to `MONGO_URI`.

**MongoDB Atlas clusters are replica sets by default** — nothing to do.

Verify:

```bash
./scripts/check-mongodb.sh
```

It reports the server version and the replica set name, and exits 3 with
remediation steps if transactions are unavailable.

## 6. Academic year dates — required, not defaulted

Migrations need the academic year boundaries. They are **deliberately not
defaulted**: they are school-specific, and they also drive timetable term
validation. A guessed boundary silently mis-scopes every record stamped against it.

```bash
export TFS_ACADEMIC_YEAR_NAME="2026-27"
export TFS_ACADEMIC_YEAR_START="2026-04-01"
export TFS_ACADEMIC_YEAR_END="2027-03-31"
```

```powershell
$env:TFS_ACADEMIC_YEAR_NAME  = "2026-27"
$env:TFS_ACADEMIC_YEAR_START = "2026-04-01"
$env:TFS_ACADEMIC_YEAR_END   = "2027-03-31"
```

## 7. Install

```bash
./scripts/install.sh          # Linux / macOS
.\scripts\install.ps1         # Windows
```

This checks prerequisites, verifies MongoDB, installs dependencies, runs
migrations, seeds permissions, and validates the result. It stops at the first
failure with a distinct exit code.

To run the steps individually:

```bash
./scripts/migrate.sh
./scripts/seed.sh
./scripts/validate-db.sh
```

## 8. Migrations, and the one irreversible step

| Migration | Purpose |
|---|---|
| `001-academic-year-and-calendar` | Seeds the AcademicYear; creates `holidays` and `specialevents` |
| `002-academic-year-id-stamping` | Adds and populates `academicYearId` on attendance, results, timetables and exam groups |

**Dry-run migration 002 first.** It is effectively irreversible: `results` carries
no date of its own, so a mis-stamped year cannot be recovered afterwards.

```bash
TFS_DRY_RUN=1 mongosh "$MONGO_URI" --file database/migrations/002-academic-year-id-stamping.js
```

Migration 002 runs a pre-flight count and **refuses to proceed** if any record
predates the academic year start, rather than blanket-stamping it. If that
happens, seed a prior `AcademicYear` with `status: "closed"` covering those
dates and re-run.

Every migration is idempotent and has a rollback:

```bash
mongosh "$MONGO_URI" --file database/migrations/002-academic-year-id-stamping.rollback.js
```

Migration 001's rollback refuses to drop calendar collections that contain
user-entered holidays.

## 9. Verify

```bash
./scripts/validate-db.sh
```

Read-only. Checks migrations applied, collections present, exactly one active
academic year per school, every record year-stamped, and the approved-decision
invariants: `Class` carries no `academicYear`, the Class unique index is intact,
no `Student` carries a `grade` field.

Exit 0 passes. Warnings are reported separately from failures.

**Expect one warning on a fresh install: no holidays configured.** That is
correct and important — until a school populates the calendar, the holiday check
behaves exactly like the in-memory store it replaced. Populating it is step 11.

## 10. Start

```bash
./scripts/start.sh            # PM2 if available, otherwise foreground
.\scripts\start.ps1
```

Backend on `PORT` (default 5000). Stop with `./scripts/stop.sh`.

## 11. First-run configuration

1. Log in as an existing school administrator.
2. **Add holidays for the academic year.** Until this is done the calendar fix is
   inert — persisted-but-empty behaves identically to the old in-memory object.
3. Mark `recurringAnnually` on fixed-date holidays. That flag is the **only**
   thing year-end rollover carries forward.
4. Review the access-control matrix. The seed grants sensible defaults for the
   new modules and never lowers a grant you already set.

## 12. Health check

```bash
curl http://localhost:5000/api/health
```

Then confirm the calendar fix end to end: add a holiday, and attempt to mark
attendance on that date. It should be rejected with
`ATTENDANCE_BLOCKED_HOLIDAY` and the holiday label.

## 13. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `MONGO_URI is not set` at startup | No `.env` | Copy `.env.example`, set `MONGO_URI` |
| `does not support sessions` at startup | Standalone mongod | §5 — single-node replica set |
| `check-mongodb` exits 2 | Unreachable | Check URI, network, Atlas IP allowlist |
| `check-mongodb` exits 3 | No replica set | §5 |
| Migration 002 refuses | Records predate the year | Seed a prior closed year, re-run |
| Rollback 001 refuses | Holidays exist | Export or delete deliberately first |
| Attendance still markable on a holiday | Calendar empty | §11 step 2 |
| Tests abort with "identical to MONGO_URI" | Same DB for both | Give `MONGO_URI_TEST` its own database |
| Server exits listing a moduleKey | Unregistered key | Add it to `MODULES` and `DEFAULT_GRANTS` |

## 14. Backup and restore

```bash
mongodump --uri="$MONGO_URI" --out=backup/$(date +%F)
mongorestore --uri="$MONGO_URI" backup/2026-08-14
```

Take a backup before running migrations. Migration 002 in particular cannot be
fully undone.

## 15. Upgrade and rollback

Migrations are idempotent — re-running an applied migration is a no-op. To roll
back a stage, run its rollback script, then `git checkout` the prior commit.
Each build stage is a separate commit for exactly this reason.

## 16. Build machine vs target machine

The **build machine** produced this package (source, tests, ZIP, checksum) and
has no database. All database and runtime steps in this guide run on the
**target deployment machine**, or a machine with network access to the target
MongoDB. Never point the build machine's scripts at a production database.

## 17. Security configuration

- Set a strong `JWT_SECRET` in `backend/.env` (never commit it; `.env` is
  gitignored and excluded from the package).
- Provide `MONGO_URI` with least-privilege credentials scoped to the target
  database. There is no localhost fallback — a missing `MONGO_URI` stops the run.
- Notification, translation, and LLM providers are unconfigured boundaries
  (ADR-05/10/11). Configure them only when the corresponding decision is resolved.

## 18. MODE-B runtime validation

After installation, follow `MODE-B-VALIDATION-GUIDE.md` to validate the running
system against the real environment (connectivity, transactions, migration
execution, promotion transaction behaviour, rollback, audit, authorization).
Until MODE-B is executed against the target, treat the release as
**BUILD COMPLETE — RUNTIME ENVIRONMENT VALIDATION PENDING**.
