#!/usr/bin/env bash
# check-mongodb — TFS-EOS Delta Build
#
# INSTALLATION/RUNTIME MODE. Verifies the target MongoDB deployment before any
# migration runs. This does not build anything and is not a build prerequisite.
#
# Exit codes:  0 ok · 1 MONGO_URI missing · 2 unreachable · 3 no transaction support
set -uo pipefail

echo "== TFS-EOS MongoDB check =="

if [ -z "${MONGO_URI:-}" ]; then
  echo "ERROR: MONGO_URI is required."
  echo "       Copy backend/.env.example to backend/.env and set MONGO_URI."
  echo "       The application never falls back to a default localhost URI —"
  echo "       a silent fallback would write to an unintended database."
  exit 1
fi

if ! command -v mongosh >/dev/null 2>&1; then
  echo "ERROR: mongosh not found on PATH."
  echo "       Install MongoDB Shell: https://www.mongodb.com/docs/mongodb-shell/"
  exit 2
fi

echo "-- connectivity"
if ! mongosh "$MONGO_URI" --quiet --eval 'db.adminCommand({ ping: 1 })' >/dev/null 2>&1; then
  echo "ERROR: MongoDB is unreachable."
  echo "       Installation cannot continue."
  echo "       Check the URI, network access, and (for Atlas) the IP allowlist."
  exit 2
fi
echo "   connected"

VERSION=$(mongosh "$MONGO_URI" --quiet --eval 'db.version()' 2>/dev/null | tr -d '\r')
echo "-- server version: ${VERSION:-unknown}"

echo "-- transaction capability"
# Approved decision D-004 requires promotion to run in a single multi-document
# transaction. Those are unavailable on a standalone mongod. A SINGLE-NODE
# replica set is sufficient — no additional hardware is needed.
SET_NAME=$(mongosh "$MONGO_URI" --quiet --eval \
  'try { const s = rs.status(); print(s.set || ""); } catch (e) { print(""); }' 2>/dev/null | tr -d '\r')

if [ -z "$SET_NAME" ]; then
  echo "ERROR: this deployment is not a replica set, so multi-document"
  echo "       transactions are unavailable. Promotion (D-004) cannot run safely:"
  echo "       a partial promotion would leave Student.class and Class.students[]"
  echo "       disagreeing, with no way to tell which is correct."
  echo ""
  echo "       Fix (single-node is enough, no data migration required):"
  echo "         1. start mongod with --replSet rs0"
  echo "         2. mongosh --eval 'rs.initiate()'"
  echo "         3. add ?replicaSet=rs0 to MONGO_URI"
  echo "       MongoDB Atlas clusters are replica sets by default."
  exit 3
fi
echo "   replica set: $SET_NAME — transactions available"

echo ""
echo "MongoDB check PASSED."
exit 0
