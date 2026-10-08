#!/bin/bash
# Notch Porch installer — downloads the latest release into /Applications.
#   curl -fsSL https://raw.githubusercontent.com/shubhamcodess/notch-porch/main/scripts/install.sh | bash
set -euo pipefail

REPO="shubhamcodess/notch-porch"
APP="Notch Porch.app"
URL="https://github.com/$REPO/releases/latest/download/Notch-Porch-arm64.zip"

if [ "$(uname -s)" != "Darwin" ]; then echo "Notch Porch is macOS only." >&2; exit 1; fi
if [ "$(uname -m)" != "arm64" ]; then echo "Notch Porch is built for Apple Silicon Macs (every notched MacBook is one)." >&2; exit 1; fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading Notch Porch…"
curl -fL --progress-bar "$URL" -o "$TMP/app.zip"
ditto -x -k "$TMP/app.zip" "$TMP"

if pgrep -qx "Notch Porch"; then
  echo "Quitting the running copy…"
  osascript -e 'tell application "Notch Porch" to quit' >/dev/null 2>&1 || pkill -x "Notch Porch" || true
  sleep 1
fi

echo "Installing to /Applications…"
rm -rf "/Applications/$APP"
mv "$TMP/$APP" "/Applications/$APP"
# Files fetched with curl are not quarantined, but clear the flag in case a browser touched it.
xattr -cr "/Applications/$APP" 2>/dev/null || true

echo "Done. Launching…"
open "/Applications/$APP"
echo "Look for the pill icon in your menu bar, then hover the notch."
