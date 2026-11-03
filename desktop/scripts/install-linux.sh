#!/bin/sh
# Mihrab for Linux, the desktop preview.
#
#   install:  curl -fsSL https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/install-linux.sh | sh
#   remove:   curl -fsSL https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/install-linux.sh | sh -s uninstall
#
# Debian, Ubuntu, Mint and the rest of apt's family get the .deb (sudo asks
# for your password once): it brings its own dependencies and the sandbox
# profile Ubuntu 24.04 needs. Everything else gets the AppImage, unpacked
# into ~/.local/share/mihrab — no sudo, and no FUSE needed to start it.
#
# Removing it quits Mihrab, takes away the app, its start-at-login entry
# and its settings (~/.config/Mihrab): a clean slate for the next test.
#
# The installers come from the desktop-preview pre-release, which the
# Desktop workflow (.github/workflows/desktop.yml) refreshes. MIHRAB_FROM=dir
# installs from a folder of those files instead (the workflow's own test).
set -eu

BASE="https://github.com/MihrabHQ/Mihrab/releases/download/desktop-preview"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
CONF="${XDG_CONFIG_HOME:-$HOME/.config}"
APP="$DATA/mihrab"
BIN="$HOME/.local/bin/mihrab"
ENTRY="$DATA/applications/mihrab.desktop"
ICON="$DATA/icons/hicolor/512x512/apps/mihrab.png"
PKG=mihrab

say() { printf '%s\n' "$*"; }
fail() { say "Mihrab: $*" >&2; exit 1; }

case "$(uname -m)" in
  x86_64 | amd64) AI=x86_64 DEB=amd64 ;;
  aarch64 | arm64) AI=arm64 DEB=arm64 ;;
  *) fail "there is no build for $(uname -m) yet." ;;
esac

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

fetch() { # fetch <file> <to>
  if [ -n "${MIHRAB_FROM:-}" ]; then
    cp "$MIHRAB_FROM/$1" "$2"
  else
    say "Downloading $1…"
    curl -fL --progress-bar "$BASE/$1" -o "$2" || fail "the download failed."
  fi
}

stop() {
  pkill -x mihrab 2>/dev/null || true
  pkill -f "$APP/mihrab" 2>/dev/null || true
}

uses_apt() {
  [ "${MIHRAB_FORMAT:-}" != appimage ] && command -v apt-get >/dev/null 2>&1 && command -v dpkg >/dev/null 2>&1
}

if [ "${1:-}" = uninstall ]; then
  say "Removing Mihrab…"
  stop
  # Purged, not just removed: nothing of the package stays registered.
  if dpkg -s "$PKG" >/dev/null 2>&1; then
    $SUDO apt-get purge -y "$PKG" >/dev/null
  fi
  rm -rf "$APP" "$BIN" "$ENTRY" "$ICON" "$CONF/autostart/mihrab.desktop" "$CONF/Mihrab"
  say "Mihrab is removed, with its settings."
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
stop

if uses_apt; then
  fetch "Mihrab-linux-$DEB.deb" "$TMP/mihrab.deb"
  chmod 644 "$TMP/mihrab.deb"
  say "Installing (sudo may ask for your password)…"
  # A fresh system (or container) may have no package lists yet, and then
  # none of the deb's dependencies is installable: refresh them and retry.
  $SUDO apt-get install -y "$TMP/mihrab.deb" >/dev/null 2>&1 ||
    { $SUDO apt-get update -qq && $SUDO apt-get install -y "$TMP/mihrab.deb" >/dev/null; } ||
    fail "apt-get could not install the package."
  RUN=mihrab
else
  fetch "Mihrab-linux-$AI.AppImage" "$TMP/Mihrab.AppImage"
  chmod +x "$TMP/Mihrab.AppImage"
  (cd "$TMP" && ./Mihrab.AppImage --appimage-extract >/dev/null) || fail "the AppImage would not unpack."
  rm -rf "$APP"
  mkdir -p "$(dirname "$APP")" "$(dirname "$BIN")" "$(dirname "$ENTRY")" "$(dirname "$ICON")"
  mv "$TMP/squashfs-root" "$APP"
  ln -sf "$APP/mihrab" "$BIN"
  for f in "$APP/mihrab.png" "$APP/usr/share/icons/hicolor/512x512/apps/mihrab.png"; do
    if [ -f "$f" ]; then cp "$f" "$ICON"; break; fi
  done
  cat >"$ENTRY" <<EOF
[Desktop Entry]
Type=Application
Name=Mihrab
Comment=Prayer times, the adhan and the Qur'an
Exec=$APP/mihrab %U
Icon=mihrab
Categories=Utility;
Keywords=prayer;salah;adhan;quran;islam;
StartupWMClass=Mihrab
EOF
  RUN="$APP/mihrab"
fi

say "Mihrab is installed."
if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && [ -z "${MIHRAB_FROM:-}" ]; then
  nohup "$RUN" >/dev/null 2>&1 &
  say "Starting it now. To remove it again:"
else
  say "Open it from your applications menu. To remove it again:"
fi
say "  curl -fsSL https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/install-linux.sh | sh -s uninstall"
