#!/usr/bin/env bash
# Build everything and stage release artefacts under ./release/.
#
#   release/
#     copilot-buddy_<os>_<arch>[.exe]   <- daemon binaries (5 platforms)
#     SHA256SUMS                        <- checksums for the daemon binaries
#     copilot-buddy-extension-<ver>.zip <- unsigned web-store-ready zip
#     install/                          <- service unit/plist samples
#
# Run from repo root:  bash scripts/release.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo dev)}"
OUT="$REPO_ROOT/release"
rm -rf "$OUT"
mkdir -p "$OUT/install"

echo "==> Building Go daemon for 5 platforms (version=$VERSION)"
( cd backend && VERSION="$VERSION" make release )
mv backend/dist/* "$OUT/"

echo "==> Building Chrome extension"
( cd extension && npm install --silent && npm run build )

echo "==> Zipping extension"
EXT_ZIP="$OUT/copilot-buddy-extension-$VERSION.zip"
( cd extension/dist && zip -qr "$EXT_ZIP" . )

echo "==> Copying install samples"
cp -r docs/install/* "$OUT/install/"

echo
echo "Artefacts staged under: $OUT"
ls -lh "$OUT"
