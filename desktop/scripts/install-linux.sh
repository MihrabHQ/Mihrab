#!/bin/sh
# Mihrab for Linux.
#
#   install:  curl -fsSL https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/install-linux.sh | sh
#   remove:   curl -fsSL https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/uninstall-linux.sh | sh
#             (the same as this script with `uninstall`, which it runs)
#
# Adds Mihrab's repository to the system's own package manager and installs
# from it, so Mihrab is updated with the rest of the system from then on:
#
#   apt     Debian, Ubuntu, Mint, Pop!_OS      /etc/apt/sources.list.d/mihrab.sources
#   dnf     Fedora                             /etc/yum.repos.d/mihrab.repo
#   zypper  openSUSE                           the repository `mihrab`
#   pacman  Arch, Manjaro, EndeavourOS (yay)   [mihrab] in /etc/pacman.conf
#
# The repositories (https://mihrabhq.github.io/packages, built by
# MihrabHQ/packages) are signed, and the key is added with them. sudo asks
# for your password once. Anywhere else the AppImage is unpacked into
# ~/.local/share/mihrab — no sudo, no FUSE — and does not update itself.
#
# Removing it quits Mihrab and takes away the app, the repository and its
# key, the start-at-login entry and the settings (~/.config/Mihrab).
#
# MIHRAB_REPO=url uses another copy of the repositories (the Desktop
# workflow's own test); MIHRAB_FORMAT=appimage skips the package manager;
# MIHRAB_FROM=dir takes the AppImage from a folder instead of downloading it.
set -eu

REPO="${MIHRAB_REPO:-https://mihrabhq.github.io/packages}"
RELEASES="https://github.com/MihrabHQ/Mihrab/releases/download"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
CONF="${XDG_CONFIG_HOME:-$HOME/.config}"
APP="$DATA/mihrab"
BIN="$HOME/.local/bin/mihrab"
ENTRY="$DATA/applications/mihrab.desktop"
ICON="$DATA/icons/hicolor/512x512/apps/mihrab.png"

say() { printf '%s\n' "$*"; }
fail() { say "Mihrab: $*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

manager() {
  if [ "${MIHRAB_FORMAT:-}" = appimage ]; then echo none
  elif has apt-get && has dpkg; then echo apt
  elif has dnf; then echo dnf
  elif has zypper; then echo zypper
  elif has pacman; then echo pacman
  else echo none
  fi
}

stop() {
  pkill -x mihrab 2>/dev/null || true
  pkill -f "$APP/mihrab" 2>/dev/null || true
}

# ---- remove ----------------------------------------------------------------
if [ "${1:-}" = uninstall ]; then
  say "Removing Mihrab…"
  stop
  if has dpkg && dpkg -s mihrab >/dev/null 2>&1; then
    $SUDO apt-get purge -y mihrab >/dev/null
  fi
  if has rpm && rpm -q mihrab >/dev/null 2>&1; then
    if has dnf; then $SUDO dnf remove -y -q mihrab >/dev/null
    elif has zypper; then $SUDO zypper --non-interactive remove mihrab >/dev/null
    else $SUDO rpm -e mihrab
    fi
  fi
  if has pacman && pacman -Q mihrab >/dev/null 2>&1; then
    $SUDO pacman -R --noconfirm mihrab >/dev/null
  fi
  # The repository and its key.
  for f in /etc/apt/sources.list.d/mihrab.sources /usr/share/keyrings/mihrab.gpg /etc/yum.repos.d/mihrab.repo; do
    if [ -e "$f" ]; then $SUDO rm -f "$f"; fi
  done
  if has zypper && zypper --non-interactive repos mihrab >/dev/null 2>&1; then
    $SUDO zypper --non-interactive removerepo mihrab >/dev/null
  fi
  if [ -f /etc/pacman.conf ] && grep -q '^\[mihrab\]' /etc/pacman.conf; then
    # The [mihrab] section: its header and the lines under it, to the next.
    $SUDO sed -i '/^\[mihrab\]/,/^\[/{/^\[mihrab\]/d;/^\[/!d}' /etc/pacman.conf
    fpr=$(curl -fsSL "$REPO/fingerprint.txt" 2>/dev/null || true)
    if [ -n "$fpr" ]; then $SUDO pacman-key --delete "$fpr" >/dev/null 2>&1 || true; fi
  fi
  rm -rf "$APP" "$BIN" "$ENTRY" "$ICON" "$CONF/autostart/mihrab.desktop" "$CONF/Mihrab"
  say "Mihrab is removed, with its settings."
  exit 0
fi

# ---- install ---------------------------------------------------------------
has curl || fail "curl is needed: install it with your package manager, then run this again."
stop
m=$(manager)
case "$m" in
  apt)
    say "Adding Mihrab's repository to apt (sudo may ask for your password)…"
    curl -fsSL "$REPO/mihrab.gpg" | $SUDO tee /usr/share/keyrings/mihrab.gpg >/dev/null
    curl -fsSL "$REPO/mihrab.sources" | $SUDO tee /etc/apt/sources.list.d/mihrab.sources >/dev/null
    $SUDO apt-get update -qq || fail "apt could not read the repositories."
    $SUDO apt-get install -y mihrab >/dev/null || fail "apt could not install mihrab."
    RUN=mihrab UPDATES="sudo apt upgrade (or Software Updater)"
    ;;
  dnf)
    say "Adding Mihrab's repository to dnf (sudo may ask for your password)…"
    curl -fsSL "$REPO/mihrab.repo" | $SUDO tee /etc/yum.repos.d/mihrab.repo >/dev/null
    $SUDO dnf install -y -q mihrab >/dev/null || fail "dnf could not install mihrab."
    RUN=mihrab UPDATES="sudo dnf upgrade (or GNOME Software)"
    ;;
  zypper)
    say "Adding Mihrab's repository to zypper (sudo may ask for your password)…"
    if ! zypper --non-interactive repos mihrab >/dev/null 2>&1; then
      $SUDO zypper --non-interactive addrepo --refresh "$REPO/mihrab.repo" >/dev/null
    fi
    $SUDO zypper --non-interactive --gpg-auto-import-keys install mihrab >/dev/null || fail "zypper could not install mihrab."
    RUN=mihrab UPDATES="sudo zypper update"
    ;;
  pacman)
    say "Adding Mihrab's repository to pacman (sudo may ask for your password)…"
    fpr=$(curl -fsSL "$REPO/fingerprint.txt") || fail "the repository's key could not be read."
    curl -fsSL "$REPO/mihrab.asc" | $SUDO pacman-key --add - >/dev/null 2>&1 ||
      { $SUDO pacman-key --init >/dev/null 2>&1; curl -fsSL "$REPO/mihrab.asc" | $SUDO pacman-key --add - >/dev/null; }
    # Trusting it needs pacman's own local key, which an installed Arch has
    # and a bare one (a container) may not: --init makes it, keeping the rest.
    $SUDO pacman-key --lsign-key "$fpr" >/dev/null 2>&1 ||
      { $SUDO pacman-key --init >/dev/null 2>&1; $SUDO pacman-key --lsign-key "$fpr" >/dev/null; } ||
      fail "pacman would not trust the repository's key."
    if ! grep -q '^\[mihrab\]' /etc/pacman.conf; then
      printf '\n[mihrab]\nServer = %s/arch/$arch\n' "$REPO" | $SUDO tee -a /etc/pacman.conf >/dev/null
    fi
    # Arch installs against an up-to-date system: -Syu, never a bare -Sy.
    say "Updating the system's packages and installing Mihrab…"
    $SUDO pacman -Syu --needed --noconfirm mihrab >/dev/null || fail "pacman could not install mihrab."
    RUN=mihrab UPDATES="sudo pacman -Syu (or yay -Syu)"
    ;;
  none)
    case "$(uname -m)" in
      x86_64 | amd64) AI=x86_64 ;;
      aarch64 | arm64) AI=arm64 ;;
      *) fail "there is no build for $(uname -m) yet." ;;
    esac
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    if [ -n "${MIHRAB_FROM:-}" ]; then
      cp "$MIHRAB_FROM/Mihrab-linux-$AI.AppImage" "$TMP/Mihrab.AppImage"
    else
      # The build the repositories carry: a release's, or the preview's.
      set -- $(curl -fsSL "$REPO/source.txt" 2>/dev/null || echo desktop-preview)
      if [ "${1:-desktop-preview}" = desktop-preview ]; then
        url="$RELEASES/desktop-preview/Mihrab-linux-$AI.AppImage"
      else
        v=${1#v}
        url="$RELEASES/$1/Mihrab-$v-linux-$AI.AppImage"
      fi
      say "Downloading Mihrab…"
      curl -fL --progress-bar "$url" -o "$TMP/Mihrab.AppImage" || fail "the download failed."
    fi
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
    RUN="$APP/mihrab" UPDATES="running this command again"
    ;;
esac

say "Mihrab is installed. Updates come with: $UPDATES."
if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && [ -z "${MIHRAB_FROM:-}${MIHRAB_REPO:-}" ]; then
  nohup "$RUN" >/dev/null 2>&1 &
  say "Starting it now. To remove it again:"
else
  say "Open it from your applications menu. To remove it again:"
fi
say "  curl -fsSL https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/uninstall-linux.sh | sh"
