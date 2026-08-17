# FP-095 — Release Package Report

**Package:** TFS-EOS-DELTA-BUILD-v1.0.0-FINAL.zip
**SHA-256:** `b59cccd0b78620974d2a0497a24e93e7f5b631d312f38b9ed28f56f311209ba7`
**Size:** 4.6 MB
**Built by:** scripts/package-release.sh (no hardcoded output path — E-05)

## Pre-package gates (all passed)
- Backend tests: 615 passed, 0 skipped, 34 suites.
- Frontend tests: 39 passed, 6 suites.
- Secret scan: PASS — no real credential in the staged package.
- Local-path scan (generated dirs scripts/database/config/docs): PASS — no
  developer path in build-generated output.
- Local-path scan (whole tree): 27 pre-existing FMS documentation files carry a
  developer path. FMS is out of TFS-EOS scope and is not modified by this delta
  build; reported honestly, not silently altered.

## Package contents (top level)
backend/, frontend/, database/, scripts/, config/, docs/, ecosystem.config.js,
.env.example, README.md, INSTALLATION-GUIDE.md, CHANGELOG.md, RELEASE-NOTES.md,
BUILD-MANIFEST.json.

## Exclusions verified
- No node_modules, no .git, no real .env (only .env.example templates and the
  non-secret academic-year date file config/academic-year-2026-27.env).

## Checksum verification
```
sha256sum -c TFS-EOS-DELTA-BUILD-v1.0.0-FINAL.zip.sha256
# → OK
```

## Scope note
This package is MODE-A validated (build + static + unit + regression). It is NOT
production-validated: live DB/transaction/migration execution, offline E2E, and
concrete provider validation (ADR-05/10/11) remain environment/decision pending.
