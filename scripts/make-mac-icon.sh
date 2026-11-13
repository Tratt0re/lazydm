#!/bin/bash
# Builds the app icons from the artwork (src/assets/icon/APP_ICON.png, the source of everything else): the
# rounded square with margin and shadow is saved as the default icon of the app (lazydm_ico_1024.png: window),
# the same square edge to edge is saved for Windows and Linux (lazydm_ico_win.png), the favicon is scaled from it, and every iconset size goes into build/icon.icns
# (macOS). Needs macOS (swift, sips, iconutil). Usage: npm run icons:mac
set -euo pipefail
cd "$(dirname "$0")/.."

ICON_DIR="src/assets/icon"
ARTWORK="$ICON_DIR/APP_ICON.png"
DEFAULT_ICON="$ICON_DIR/lazydm_ico_1024.png"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

swift scripts/make-mac-icon.swift "$ARTWORK" "$DEFAULT_ICON"
swift scripts/make-mac-icon.swift "$ARTWORK" "$ICON_DIR/lazydm_ico_win.png" full
cp "$DEFAULT_ICON" "$WORK/icon-1024.png"
sips -z 128 128 "$DEFAULT_ICON" --out "$ICON_DIR/lazydm_ico_short.png" >/dev/null
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
echo "$DEFAULT_ICON, $ICON_DIR/lazydm_ico_win.png, $ICON_DIR/lazydm_ico_short.png and build/icon.icns written"
