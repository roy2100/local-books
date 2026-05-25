#!/bin/bash
set -euo pipefail

REPO="roy2100/local-books"
APP_NAME="Local Books"

echo "Fetching latest release..."
DMG_URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep '"browser_download_url"' \
  | grep '\.dmg"' \
  | head -1 \
  | sed 's/.*"browser_download_url": "\(.*\)"/\1/')

if [ -z "$DMG_URL" ]; then
  echo "Error: no DMG found in latest release" >&2
  exit 1
fi

echo "Downloading: $DMG_URL"
TMP_DMG=$(mktemp /tmp/local-books-XXXXXX.dmg)
curl -fL --progress-bar -o "$TMP_DMG" "$DMG_URL"

echo "Mounting DMG..."
MOUNT_POINT=$(mktemp -d /tmp/local-books-mount-XXXXXX)
hdiutil attach "$TMP_DMG" -mountpoint "$MOUNT_POINT" -nobrowse -quiet

echo "Installing to /Applications..."
if [ -d "/Applications/$APP_NAME.app" ]; then
  rm -rf "/Applications/$APP_NAME.app"
fi
cp -R "$MOUNT_POINT/$APP_NAME.app" /Applications/

echo "Cleaning up..."
hdiutil detach "$MOUNT_POINT" -quiet
rm -f "$TMP_DMG"
rmdir "$MOUNT_POINT"

echo "Removing Gatekeeper quarantine..."
xattr -rd com.apple.quarantine "/Applications/$APP_NAME.app"

echo "Done! $APP_NAME installed to /Applications."
