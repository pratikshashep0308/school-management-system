# Release Notes — TFS-EOS Delta Build v1.0.0

## What this release is
An additive delta on the operating EduCore school-management platform for
Maharashtra schools. It adds academic calendar, competency assessment, learning
passport, parent partnership, an audit console, offline capability, and an AI
layer — while preserving all existing functionality. It is not a rewrite.

## Test status at release
- Backend: 615 passed, 0 skipped, 34 suites.
- Frontend: 39 passed, 6 suites.
- Total: 654 passed, 0 failed, 0 skipped.
- The single formerly-skipped test (FP-090 GAP-AI-005 structural proof) is now an
  active pass following FP-080.

## What has NOT been executed (and is not claimed as passing)
This package is validated to MODE-A (build + static + unit + regression). The
following require a provisioned environment and are reported as pending, never as
passing:
- MongoDB integration tier (no live database in the build environment).
- Live multi-document transaction behaviour for promotion (U-08).
- Migration execution against a live database.
- Offline end-to-end on a real device with real network transitions.
- Concrete provider validation for ADR-05/ADR-10/ADR-11.
- MODE-B.

## Installation
See INSTALLATION-GUIDE.md. In brief: run `scripts/check-prerequisites`, then
`scripts/check-mongodb` (requires `MONGO_URI` — there is no localhost fallback),
then `scripts/migrate` (with `TFS_ACADEMIC_YEAR_START`/`END`), then
`scripts/seed`, then `scripts/validate-db`. Database details: `database/README.md`.

## Known risks & open items
- Notification/translation/LLM providers are unconfigured boundaries; features
  requiring them report a pending state rather than failing.
- The permission matrix has an approved fail-open gap for unknown keys pending
  ADR-14; the delta introduces no new business rule to close it.

## Rollback
Each migration has a matching rollback; roll back 002 then 001. See
`database/README.md`.
