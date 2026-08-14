#!/usr/bin/env bash
# check-prerequisites — TFS-EOS Delta Build
# Verifies runtime tooling. Exit 0 ok, 1 missing prerequisite.
set -uo pipefail

echo "== TFS-EOS prerequisites =="
FAIL=0

need() {
  local cmd="$1" label="$2" hint="$3"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "   OK    $label — $($cmd --version 2>&1 | head -1)"
  else
    echo "   MISS  $label — $hint"
    FAIL=1
  fi
}

need node "Node.js"  "install Node 18 or later"
need npm  "npm"      "ships with Node.js"
need mongosh "mongosh" "https://www.mongodb.com/docs/mongodb-shell/"

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  echo "   FAIL  Node.js 18 or later is required (found major $NODE_MAJOR)"
  FAIL=1
fi

if [ -f backend/.env ]; then
  echo "   OK    backend/.env present"
else
  echo "   MISS  backend/.env — copy backend/.env.example and set MONGO_URI"
  FAIL=1
fi

echo ""
if [ "$FAIL" -eq 0 ]; then echo "Prerequisites PASSED."; exit 0; fi
echo "Prerequisites FAILED."
exit 1
