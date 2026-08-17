#!/usr/bin/env bash
# migrate — TFS-EOS Delta Build
#
# Runs migrations in order. Refuses to start if MongoDB is unreachable or lacks
# transaction support, because migration 002 is effectively irreversible:
# `results` carries no date of its own, so a mis-stamped academicYearId cannot be
# recovered afterwards.
#
# Env:  TFS_ACADEMIC_YEAR_START, TFS_ACADEMIC_YEAR_END  (required, no defaults)
#       TFS_ACADEMIC_YEAR_NAME  (optional, default 2026-27)
#       TFS_DRY_RUN=1           (optional, migration 002 reports without writing)
set -uo pipefail

echo "== TFS-EOS migrations =="

if ! ./scripts/check-mongodb.sh; then
  echo "Aborting: MongoDB check failed."
  exit 2
fi

if [ -z "${TFS_ACADEMIC_YEAR_START:-}" ] || [ -z "${TFS_ACADEMIC_YEAR_END:-}" ]; then
  echo ""
  echo "ERROR: TFS_ACADEMIC_YEAR_START and TFS_ACADEMIC_YEAR_END are required."
  echo "       They are school-specific and are deliberately not defaulted;"
  echo "       they also drive timetable term validation (GAP-CAL-003)."
  echo ""
  echo "  TFS_ACADEMIC_YEAR_START=2026-04-01 TFS_ACADEMIC_YEAR_END=2027-03-31 ./scripts/migrate.sh"
  exit 1
fi

echo ""
echo "-- 001 academic year and calendar"
mongosh "$MONGO_URI" --quiet --file database/migrations/001-academic-year-and-calendar.js || exit $?

echo ""
echo "-- 002 academicYearId stamping (pre-flight gate runs first)"
mongosh "$MONGO_URI" --quiet --file database/migrations/002-academic-year-id-stamping.js || exit $?

echo ""
echo "-- indexes"
mongosh "$MONGO_URI" --quiet --file database/indexes/create-indexes.js || exit $?

echo ""
echo "Migrations complete. Run ./scripts/validate-db.sh to verify."
