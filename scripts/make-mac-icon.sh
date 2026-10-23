#!/bin/bash
# Builds build/icon.icns (macOS) from the artwork: rounded square with margin and shadow, then every
# iconset size. Needs macOS (swift, sips, iconutil). Usage: npm run icons:mac
set -euo pipefail
cd "$(dirname "$0")/.."

ARTWORK="src/assets/icon/APP_ICON.png"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

swift scripts/make-mac-icon.swift "$ARTWORK" "$WORK/icon-1024.png"
mkdir -p build "$WORK/icon.iconset"
for size in 16 32 64 128 256 512; do
  sips -z "$size" "$size" "$WORK/icon-1024.png" --out "$WORK/icon-$size.png" >/dev/null
done
cp "$WORK/icon-16.png" "$WORK/icon.iconset/icon_16x16.png"
cp "$WORK/icon-32.png" "$WORK/icon.iconset/icon_16x16@2x.png"
cp "$WORK/icon-32.png" "$WORK/icon.iconset/icon_32x32.png"
cp "$WORK/icon-64.png" "$WORK/icon.iconset/icon_32x32@2x.png"
cp "$WORK/icon-128.png" "$WORK/icon.iconset/icon_128x128.png"
cp "$WORK/icon-256.png" "$WORK/icon.iconset/icon_128x128@2x.png"
cp "$WORK/icon-256.png" "$WORK/icon.iconset/icon_256x256.png"
cp "$WORK/icon-512.png" "$WORK/icon.iconset/icon_256x256@2x.png"
cp "$WORK/icon-512.png" "$WORK/icon.iconset/icon_512x512.png"
cp "$WORK/icon-1024.png" "$WORK/icon.iconset/icon_512x512@2x.png"
iconutil -c icns "$WORK/icon.iconset" -o build/icon.icns
echo "build/icon.icns written"
