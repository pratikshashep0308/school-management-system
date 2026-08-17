#!/usr/bin/env bash
# stop — TFS-EOS Delta Build
set -uo pipefail
if command -v pm2 >/dev/null 2>&1; then pm2 stop ecosystem.config.js || true; fi
echo "Stopped."
