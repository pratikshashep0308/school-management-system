#!/usr/bin/env bash
# start — TFS-EOS Delta Build
set -uo pipefail
[ -f backend/.env ] || { echo "ERROR: backend/.env not found. Copy backend/.env.example."; exit 1; }
if command -v pm2 >/dev/null 2>&1 && [ -f ecosystem.config.js ]; then
  echo "Starting via PM2..."
  pm2 start ecosystem.config.js
else
  echo "Starting backend (foreground)..."
  ( cd backend && npm start )
fi
