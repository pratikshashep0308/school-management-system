#!/usr/bin/env bash
# package-release — TFS-EOS Delta Build
#
# Builds the installable ZIP and optionally copies it to a destination.
#
# NO PATH IS HARDCODED. The destination comes from --out, or from
# TFS_RELEASE_OUTPUT_DIR, or defaults to ./dist inside the repository. A build
# artifact that embeds one person's home directory is not portable, leaks the
# machine layout of whoever ran it, and breaks for every other operator.
#
# Usage:
#   ./scripts/package-release.sh
#   ./scripts/package-release.sh --out /path/to/destination
#   TFS_RELEASE_OUTPUT_DIR=/path/to/destination ./scripts/package-release.sh
set -uo pipefail

VERSION="${TFS_RELEASE_VERSION:-1.0.0-rc1}"
OUT_DIR="${TFS_RELEASE_OUTPUT_DIR:-./dist}"
NAME="TFS-EOS-DELTA-BUILD-v${VERSION}"

while [ $# -gt 0 ]; do
  case "$1" in
    --out)     OUT_DIR="$2"; shift 2 ;;
    --version) VERSION="$2"; NAME="TFS-EOS-DELTA-BUILD-v${VERSION}"; shift 2 ;;
    --help|-h)
      echo "Usage: ./scripts/package-release.sh [--out <dir>] [--version <v>]"
      echo ""
      echo "  --out <dir>      Destination. Default: \$TFS_RELEASE_OUTPUT_DIR, else ./dist"
      echo "  --version <v>    Release version. Default: \$TFS_RELEASE_VERSION, else 1.0.0-rc1"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

mkdir -p "$OUT_DIR" || { echo "ERROR: cannot create destination: $OUT_DIR"; exit 1; }
[ -w "$OUT_DIR" ] || { echo "ERROR: destination is not writable: $OUT_DIR"; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
DEST="$STAGE/$NAME"
mkdir -p "$DEST"

echo "== Packaging $NAME =="
echo "-- staging"
tar cf - \
  --exclude=node_modules --exclude=.git --exclude=.env \
  --exclude=BUILD-EVIDENCE --exclude=frontend/build --exclude=dist \
  backend frontend database scripts config \
  ecosystem.config.js INSTALLATION-GUIDE.md BUILD-MANIFEST.json \
  README.md CHANGELOG.md RELEASE-NOTES.md 2>/dev/null \
  | (cd "$DEST" && tar xf -)

mkdir -p "$DEST/docs"
for f in INSTALLATION-GUIDE.md HOLIDAY-CALENDAR-GUIDE.md BUILD-JOURNAL.md FINAL-BUILD-VERIFICATION.md CHANGELOG.md RELEASE-NOTES.md; do
  [ -f "$f" ] && cp "$f" "$DEST/docs/"
done
cp backend/.env.example "$DEST/.env.example" 2>/dev/null

echo "-- secret scan"
# Placeholders are permitted; real credentials are not. USERNAME:PASSWORD and
# angle-bracket forms are the documented placeholder conventions.
HITS="$(grep -rIhoE "mongodb(\+srv)?://[A-Za-z0-9._%<>-]+:[^@[:space:]\"'{]+@" "$DEST" 2>/dev/null \
        | sort -u | grep -vE "USERNAME:PASSWORD|<[A-Za-z]+>:<[A-Za-z]+>|USER:PASS" || true)"
if [ -n "$HITS" ]; then
  echo "ERROR: a real credential was found in the staged package. Aborting."
  echo "$HITS" | head -5
  exit 2
fi

echo "-- local path scan"
# A packaged artifact must not carry anyone's home directory. The rule is applied
# in two tiers, because the repository contains pre-existing content this delta
# build is forbidden to modify.
#
#   HARD FAIL  — anything the delta build generated: scripts/, database/,
#                config/ and the top-level docs. A local path there is our defect.
#   WARN       — pre-existing content, principally backend/fms/ documentation.
#                FMS is out of TFS-EOS scope and must not be edited, so this is
#                reported honestly rather than silently passed or silently fixed.
PATH_RE="C:\\\\Users\\\\[A-Za-z]|/home/[a-z]+/(Desktop|Documents)"

OURS="$(grep -rIlE "$PATH_RE" \
        "$DEST/scripts" "$DEST/database" "$DEST/config" "$DEST/docs" \
        2>/dev/null || true)"
if [ -n "$OURS" ]; then
  echo "ERROR: a hardcoded local path was found in generated build output. Aborting."
  echo "$OURS" | sed "s#$DEST/##" | head -5
  exit 3
fi

PRE="$(grep -rIlE "$PATH_RE" "$DEST" --exclude-dir=node_modules 2>/dev/null || true)"
if [ -n "$PRE" ]; then
  COUNT="$(echo "$PRE" | wc -l | tr -d ' ')"
  echo "   WARNING: $COUNT pre-existing file(s) contain a developer's local path."
  echo "$PRE" | sed "s#$DEST/##" | head -5 | sed 's/^/     /'
  [ "$COUNT" -gt 5 ] && echo "     ... and $((COUNT - 5)) more"
  echo "     These are pre-existing (mostly backend/fms documentation). FMS is out"
  echo "     of TFS-EOS scope and is not modified by this build. Reported, not fixed."
fi

echo "-- archiving"
ZIP="$(cd "$OUT_DIR" && pwd)/${NAME}-FINAL.zip"
rm -f "$ZIP"
( cd "$STAGE" && zip -qr "$ZIP" "$NAME" ) || exit 4

SHA="$(sha256sum "$ZIP" | cut -d' ' -f1)"
echo "$SHA  $(basename "$ZIP")" > "${ZIP}.sha256"

echo ""
echo "Package : $ZIP"
echo "Size    : $(du -h "$ZIP" | cut -f1)"
echo "SHA-256 : $SHA"
echo ""
echo "Verify:  sha256sum -c ${ZIP}.sha256"
