#!/usr/bin/env bash
# install — TFS-EOS Delta Build, end-to-end installation.
set -uo pipefail

echo "=============================================="
echo " TFS-EOS Delta Build — installation"
echo "=============================================="

./scripts/check-prerequisites.sh || exit 1
echo ""
./scripts/check-mongodb.sh       || exit 2

echo ""
echo "-- backend dependencies"
( cd backend && npm ci --omit=dev 2>/dev/null || npm install --omit=dev ) || exit 3

echo ""
echo "-- frontend dependencies"
( cd frontend && npm ci 2>/dev/null || npm install ) || exit 3

echo ""
echo "-- migrations"
./scripts/migrate.sh || exit 4

echo ""
echo "-- seed"
./scripts/seed.sh || exit 5

echo ""
echo "-- validation"
./scripts/validate-db.sh || exit 6

echo ""
echo "Installation complete. Start with ./scripts/start.sh"
