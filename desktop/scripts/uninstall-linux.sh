#!/bin/sh
# Remove Mihrab for Linux, with its settings.
#
#   curl -fsSL https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/uninstall-linux.sh | sh
#
# Quits Mihrab and takes away whatever install-linux.sh put there: the
# package (apt, dnf, zypper or pacman) with Mihrab's repository and its key,
# or the unpacked AppImage with its menu entry — then the start-at-login
# entry and the settings (~/.config/Mihrab). It is install-linux.sh's own
# `uninstall`, so the two never drift apart: run from a checkout it uses the
# script beside it, piped from curl it fetches the one on main.
set -eu

case "$0" in
  */uninstall-linux.sh)
    here=$(dirname "$0")
    if [ -f "$here/install-linux.sh" ]; then exec sh "$here/install-linux.sh" uninstall; fi
    ;;
esac
curl -fsSL https://raw.githubusercontent.com/MihrabHQ/Mihrab/main/desktop/scripts/install-linux.sh | sh -s uninstall
