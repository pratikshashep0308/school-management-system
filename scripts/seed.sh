#!/usr/bin/env bash
# seed — TFS-EOS Delta Build. Grants the new module keys in the permission matrix.
# Non-destructive: an existing grant is never lowered or overwritten.
set -uo pipefail
echo "== TFS-EOS seed =="
[ -z "${MONGO_URI:-}" ] && { echo "ERROR: MONGO_URI is required."; exit 1; }
mongosh "$MONGO_URI" --quiet --file database/seed/seed-module-keys.js
