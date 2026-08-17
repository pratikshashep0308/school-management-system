#!/usr/bin/env bash
# import-holidays — TFS-EOS Delta Build
#
# Populates the Holiday collection from a JSON or CSV file. Until the calendar
# management screens ship (GAP-CAL-008 / BP-050 / BP-060), this is how a school
# defines its holidays. Without them the attendance block is Sunday-only.
#
# Usage:
#   ./scripts/import-holidays.sh holidays.json
#   ./scripts/import-holidays.sh holidays.csv --dry-run
set -uo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: ./scripts/import-holidays.sh <file.json|file.csv> [--dry-run] [--replace] [--school <id>]"
  echo ""
  echo "Templates: database/seed/holidays.sample.json"
  echo "           database/seed/holidays.sample.csv"
  exit 1
fi

FILE="$1"; shift
[ -z "${MONGO_URI:-}" ] && { echo "ERROR: MONGO_URI is required."; exit 1; }
node database/seed/import-holidays.js --file "$FILE" "$@"
