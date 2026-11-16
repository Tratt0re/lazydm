#!/bin/bash
# Render Franco.svg into APP_ICON.png, then build all platform icons.
# Needs macOS (swift, sips, iconutil). See scripts/ICONS.md for color options.
set -euo pipefail
cd "$(dirname "$0")/.."

ICON_DIR="src/assets/icon"
ARTWORK="$ICON_DIR/APP_ICON.png"
DEFAULT_ICON="$ICON_DIR/lazydm_ico_1024.png"
BACKGROUND="#E9EAE7"
HAT="#202428"
MUSTACHE="#F0ECE3"
OUTLINE="none"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --background|--hat|--mustache|--outline)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
      case "$1" in
        --background) BACKGROUND="$2" ;;
        --hat) HAT="$2" ;;
        --mustache) MUSTACHE="$2" ;;
        --outline) OUTLINE="$2" ;;
      esac
      shift 2 ;;
    --help|-h)
      echo 'Usage: npm run icons:mac -- [--background "#RRGGBB"] [--hat "#RRGGBB"] [--mustache "#RRGGBB"] [--outline "#RRGGBB"|none]'
      exit 0 ;;
    *) echo "Unknown option: $1 (use --help)" >&2; exit 1 ;;
  esac
done
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Render to temporary artwork first so invalid input never overwrites APP_ICON.png.
swift -module-cache-path "$WORK/module-cache" scripts/make-franco-artwork.swift "$ICON_DIR/Franco.svg" "$WORK/artwork.png" \
  "$BACKGROUND" "$HAT" "$MUSTACHE" "$OUTLINE"
cp "$WORK/artwork.png" "$ARTWORK"
swift -module-cache-path "$WORK/module-cache" scripts/make-mac-icon.swift "$ARTWORK" "$DEFAULT_ICON"
swift -module-cache-path "$WORK/module-cache" scripts/make-mac-icon.swift "$ARTWORK" "$ICON_DIR/lazydm_ico_win.png" full
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
