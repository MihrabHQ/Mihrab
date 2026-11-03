#!/usr/bin/env bash
# Notification delivery on a CI runner, end to end.
#
# Linux: run under `xvfb-run -a dbus-run-session -- bash scripts/ci-notify.sh`.
# A real notification daemon (dunst) takes the notifications, and every
# org.freedesktop.Notifications.Notify call on the session bus is recorded,
# so the check is that the SYSTEM received them, not only that the app
# thought it sent them.
# Windows: run as is; the app-side delivery is what can be checked there.
set -euo pipefail
cd "$(dirname "$0")/.."
export MIHRAB_NOTIFY_FRESH=1 MIHRAB_SETTLE_MS=8000
profile="$(mktemp -d)"

if [ "$(uname)" = "Linux" ]; then
  export ELECTRON_DISABLE_SANDBOX=1
  dunst >/dev/null 2>&1 &
  dbus-monitor "interface='org.freedesktop.Notifications',member='Notify'" > notify-bus.log 2>&1 &
  sleep 2
fi

node scripts/drive.js scripts/steps-notify.js --profile "$profile"

if [ "$(uname)" = "Linux" ]; then
  sleep 1
  for body in 'Delivery check (once)' 'Delivery check (daily)'; do
    grep -q "$body" notify-bus.log || { echo "the session bus never saw: $body"; cat notify-bus.log; exit 1; }
  done
  echo "the notification daemon received both notifications"
fi
