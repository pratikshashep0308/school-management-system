#!/usr/bin/env bash
# validate-db — TFS-EOS Delta Build. Read-only. Exit 0 pass, 1 fail.
set -uo pipefail
[ -z "${MONGO_URI:-}" ] && { echo "ERROR: MONGO_URI is required."; exit 1; }
mongosh "$MONGO_URI" --quiet --file database/validation/validate-db.js
