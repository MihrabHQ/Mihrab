#!/bin/sh
# Remove Mihrab for Linux (the desktop preview), with its settings.
#
#   curl -fsSL https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/uninstall-linux.sh | sh
#
# Quits Mihrab, and takes away whichever install-linux.sh made — the .deb
# (purged, so nothing of the package stays registered; sudo asks once) or
# the AppImage unpacked into ~/.local/share/mihrab with its menu entry and
# icon — then its start-at-login entry and its settings (~/.config/Mihrab).
# `install-linux.sh uninstall` does the same; keep the two in step (the
# Desktop workflow runs this one).
set -eu

DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
CONF="${XDG_CONFIG_HOME:-$HOME/.config}"
APP="$DATA/mihrab"
PKG=mihrab

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

echo "Removing Mihrab…"
pkill -x mihrab 2>/dev/null || true
pkill -f "$APP/mihrab" 2>/dev/null || true
if command -v dpkg >/dev/null 2>&1 && dpkg -s "$PKG" >/dev/null 2>&1; then
  $SUDO apt-get purge -y "$PKG" >/dev/null
fi
rm -rf "$APP" "$HOME/.local/bin/mihrab" "$DATA/applications/mihrab.desktop" \
  "$DATA/icons/hicolor/512x512/apps/mihrab.png" "$CONF/autostart/mihrab.desktop" "$CONF/Mihrab"
echo "Mihrab is removed, with its settings."
